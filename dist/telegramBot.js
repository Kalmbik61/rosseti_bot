/**
 * Telegram бот для управления парсером отключений
 */
import TelegramBot from "node-telegram-bot-api";
import { getPowerOutagesQuick, saveReport, } from "./index.js";
import { filterValidOutages, formatDateForDisplay, MY_PLACE, logger, getLatestReportInfo, SubscriptionManager, ADMIN_CHAT_IDS, } from "./utils/index.js";
export class PowerOutageBot {
    bot;
    isPolling = false;
    subscriptionManager;
    notificationInterval;
    pendingBroadcast;
    pendingUnsubscribeAll;
    constructor(token) {
        this.bot = new TelegramBot(token, { polling: false });
        this.subscriptionManager = new SubscriptionManager();
        this.setupCommands();
        this.setupBotMenu();
        this.initializeSubscriptions();
    }
    /**
     * Настройка меню команд бота
     */
    async setupBotMenu() {
        try {
            // Базовые команды для всех пользователей
            const baseCommands = [
                {
                    command: "start",
                    description: "Запустить бота и получить информацию",
                },
                {
                    command: "search",
                    description: "Поиск всех отключений электричества",
                },
                {
                    command: "search_new",
                    description: "Поиск только актуальных отключений",
                },
                {
                    command: "get",
                    description: "Получить последний сгенерированный отчет",
                },
                {
                    command: "help",
                    description: "Показать справку по всем командам",
                },
                {
                    command: "subscribe",
                    description: "Подписаться на уведомления о новых отключениях",
                },
                {
                    command: "unsubscribe",
                    description: "Отписаться от уведомлений",
                },
            ];
            // Админские команды
            const adminCommands = [
                {
                    command: "admin_stats",
                    description: "📊 Статистика подписок и системы",
                },
                {
                    command: "admin_subscribers",
                    description: "👥 Список всех подписчиков",
                },
                {
                    command: "admin_broadcast",
                    description: "📢 Массовая рассылка сообщений",
                },
                {
                    command: "admin_unsubscribe",
                    description: "❌ Отписать пользователя по Chat ID",
                },
                {
                    command: "admin_unsubscribe_all",
                    description: "🗑️ Отписать всех пользователей",
                },
            ];
            // Устанавливаем обычное меню для всех
            await this.bot.setMyCommands(baseCommands);
            // Устанавливаем расширенное меню для админов
            if (ADMIN_CHAT_IDS.length > 0) {
                const allCommands = [...baseCommands, ...adminCommands];
                for (const adminId of ADMIN_CHAT_IDS) {
                    try {
                        await this.bot.setMyCommands(allCommands, {
                            scope: { type: "chat", chat_id: adminId },
                        });
                    }
                    catch (error) {
                        logger.warn(`Не удалось установить админское меню для ${adminId}:`, error);
                    }
                }
            }
            logger.info("Telegram: Меню команд успешно настроено");
            logger.info(`Telegram: Админское меню настроено для ${ADMIN_CHAT_IDS.length} администраторов`);
        }
        catch (error) {
            logger.error("Telegram: Ошибка при настройке меню команд:", error);
        }
    }
    /**
     * Настройка команд бота
     */
    setupCommands() {
        // Универсальный перехватчик админских команд
        this.bot.onText(/\/(admin_.*|confirm_.*)/, async (msg) => {
            if (!this.isAdmin(msg.from?.id)) {
                await this.sendAccessDeniedMessage(msg.chat.id);
                logger.warn(`Попытка доступа к админской команде от неавторизованного пользователя ${msg.from?.id} (${msg.from?.username || 'unknown'}): ${msg.text}`);
                return;
            }
            // Если админ - команды обрабатываются специфическими обработчиками ниже
        });
        // Команда /start
        this.bot.onText(/\/start/, async (msg) => {
            const chatId = msg.chat.id;
            const welcomeMessage = `
🔌 *Бот для мониторинга отключений электричества*

Добро пожаловать! Этот бот поможет вам отслеживать отключения электричества в районе ${MY_PLACE}.

📋 Используйте меню команд (кнопка слева от поля ввода) для выбора нужного действия.

✨ Бот автоматически сохраняет результаты в формате Markdown.
`;
            await this.bot.sendMessage(chatId, welcomeMessage, {
                parse_mode: "Markdown",
            });
        });
        // Команда /search - стандартный поиск
        this.bot.onText(/\/search$/, async (msg) => {
            await this.handleSearchCommand(msg, false);
        });
        // Команда /search_new - поиск только актуальных
        this.bot.onText(/\/search_new/, async (msg) => {
            await this.handleSearchCommand(msg, true);
        });
        // Команда /get - получить последний отчет
        this.bot.onText(/\/get/, async (msg) => {
            await this.handleGetCommand(msg);
        });
        // Команда /help
        this.bot.onText(/\/help/, async (msg) => {
            const chatId = msg.chat.id;
            const isAdmin = this.isAdmin(msg.from?.id);
            let helpMessage = `
📋 *Справка по командам:*

**/search** - Поиск всех отключений
• Ищет все отключения для ${MY_PLACE}
• Возвращает результат в формате Markdown
• Сохраняет отчет в файл

**/search\\_new** - Поиск актуальных отключений  
• Ищет только отключения на сегодня и будущие
• Фильтрует устаревшие записи
• Показывает количество актуальных отключений

**/get** - Получить последний отчет
• Возвращает последний сгенерированный отчет
• Если отчетов нет - сообщает об этом

**/subscribe** - Подписаться на уведомления
• Автоматическая проверка новых отключений каждые 6 часов
• Уведомления приходят только при появлении новых результатов

**/unsubscribe** - Отписаться от уведомлений
• Отключает автоматические уведомления

**/help** - Показать эту справку
`;
            if (isAdmin) {
                helpMessage += `
🔧 *Админские команды:*

**/admin\\_stats** - Статистика системы
• Количество подписчиков и их активность
• Информация о последних проверках
• Статус бота и системы

**/admin\\_subscribers** - Список подписчиков
• Подробная информация о всех пользователях
• Chat ID, имена, даты подписки
• Время последних уведомлений

**/admin\\_broadcast** - Массовая рассылка
• Отправка сообщений всем подписчикам
• Двухэтапное подтверждение
• Статистика доставки

**/admin\\_unsubscribe** - Отписка пользователя
• Отписать конкретного пользователя по Chat ID
• Формат: \`/admin_unsubscribe 123456789\`

**/admin\\_unsubscribe\\_all** - Массовая отписка
• Отписать всех активных подписчиков
• Двухэтапное подтверждение безопасности
• Необратимая операция
`;
            }
            await this.bot.sendMessage(chatId, helpMessage, {
                parse_mode: "Markdown",
            });
        });
        // Команда /subscribe
        this.bot.onText(/\/subscribe|\/подписка/, async (msg) => {
            await this.handleSubscribeCommand(msg);
        });
        // Команда /unsubscribe
        this.bot.onText(/\/unsubscribe|\/отписка/, async (msg) => {
            await this.handleUnsubscribeCommand(msg);
        });
        // Админские команды
        this.bot.onText(/\/admin_stats/, async (msg) => {
            if (this.isAdmin(msg.from?.id)) {
                await this.handleAdminStatsCommand(msg);
            }
            else {
                await this.sendAccessDeniedMessage(msg.chat.id);
            }
        });
        this.bot.onText(/\/admin_subscribers/, async (msg) => {
            if (this.isAdmin(msg.from?.id)) {
                await this.handleAdminSubscribersCommand(msg);
            }
            else {
                await this.sendAccessDeniedMessage(msg.chat.id);
            }
        });
        this.bot.onText(/\/admin_broadcast/, async (msg) => {
            if (this.isAdmin(msg.from?.id)) {
                await this.handleAdminBroadcastCommand(msg);
            }
            else {
                await this.sendAccessDeniedMessage(msg.chat.id);
            }
        });
        this.bot.onText(/\/confirm_broadcast/, async (msg) => {
            if (this.isAdmin(msg.from?.id)) {
                await this.handleConfirmBroadcastCommand(msg);
            }
            else {
                await this.sendAccessDeniedMessage(msg.chat.id);
            }
        });
        this.bot.onText(/\/admin_unsubscribe/, async (msg) => {
            if (this.isAdmin(msg.from?.id)) {
                await this.handleAdminUnsubscribeCommand(msg);
            }
            else {
                await this.sendAccessDeniedMessage(msg.chat.id);
            }
        });
        this.bot.onText(/\/admin_unsubscribe_all/, async (msg) => {
            if (this.isAdmin(msg.from?.id)) {
                await this.handleAdminUnsubscribeAllCommand(msg);
            }
            else {
                await this.sendAccessDeniedMessage(msg.chat.id);
            }
        });
        this.bot.onText(/\/confirm_unsubscribe_all/, async (msg) => {
            if (this.isAdmin(msg.from?.id)) {
                await this.handleConfirmUnsubscribeAllCommand(msg);
            }
            else {
                await this.sendAccessDeniedMessage(msg.chat.id);
            }
        });
        // Обработчик callback запросов (inline кнопки)
        this.bot.on("callback_query", async (callbackQuery) => {
            const msg = callbackQuery.message;
            const chatId = msg?.chat.id;
            const userId = callbackQuery.from.id;
            const data = callbackQuery.data;
            if (!chatId || !this.isAdmin(userId)) {
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: "❌ У вас нет прав администратора",
                    show_alert: true,
                });
                return;
            }
            try {
                if (data?.startsWith("unsubscribe_")) {
                    const targetChatId = parseInt(data.replace("unsubscribe_", ""), 10);
                    await this.handleInlineUnsubscribe(callbackQuery, targetChatId);
                }
                else {
                    await this.bot.answerCallbackQuery(callbackQuery.id, {
                        text: "❌ Неизвестная команда",
                    });
                }
            }
            catch (error) {
                logger.error("Telegram: Ошибка обработки callback:", error);
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: "❌ Произошла ошибка",
                    show_alert: true,
                });
            }
        });
    }
    /**
     * Проверка прав администратора
     */
    isAdmin(userId) {
        if (!userId)
            return false;
        return ADMIN_CHAT_IDS.includes(userId);
    }
    /**
     * Отправка сообщения об отказе в доступе
     */
    async sendAccessDeniedMessage(chatId) {
        const message = `
🚫 **Доступ запрещен**

❌ У вас нет прав администратора для выполнения этой команды.

💡 **Доступные команды:**
• /start - информация о боте
• /search - поиск всех отключений
• /search_new - поиск актуальных отключений
• /get - получить последний отчет
• /subscribe - подписаться на уведомления
• /unsubscribe - отписаться от уведомлений
• /help - справка по командам

📞 По вопросам администрирования обратитесь к владельцу бота.
`;
        await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    }
    /**
     * Админская команда: статистика
     */
    async handleAdminStatsCommand(msg) {
        const chatId = msg.chat.id;
        try {
            logger.info(`Admin: Запрос статистики от админа ${msg.from?.id}`);
            const stats = this.subscriptionManager.getStats();
            const { lastResults } = this.subscriptionManager.getLastCheckInfo();
            const message = `
📊 *Админ-панель: Статистика*

👥 **Подписчики:**
• Всего зарегистрировано: ${stats.totalSubscribers}
• Активных: ${stats.activeSubscribers}
• Отписавшихся: ${stats.totalSubscribers - stats.activeSubscribers}

🔍 **Последняя проверка:**
• Время: ${stats.lastCheck
                ? formatDateForDisplay(stats.lastCheck)
                : "Не проводилась"}
• Найдено отключений: ${stats.lastResultsCount}
• Актуальных: ${lastResults.length}

🤖 **Система:**
• Интервал проверки: каждые 6 часов
• Регион: ${MY_PLACE}
• Статус бота: ${this.isRunning() ? "🟢 Активен" : "🔴 Остановлен"}
`;
            await this.bot.sendMessage(chatId, message, {
                parse_mode: "Markdown",
            });
        }
        catch (error) {
            logger.error("Admin: Ошибка получения статистики:", error);
            await this.bot.sendMessage(chatId, `❌ Ошибка получения статистики: ${error.message}`, { parse_mode: "Markdown" });
        }
    }
    /**
     * Админская команда: список подписчиков с интерактивными кнопками
     */
    async handleAdminSubscribersCommand(msg) {
        const chatId = msg.chat.id;
        try {
            logger.info(`Admin: Запрос списка подписчиков от админа ${msg.from?.id}`);
            const subscribers = this.subscriptionManager.getSubscribers();
            if (subscribers.length === 0) {
                await this.bot.sendMessage(chatId, "📝 *Список подписчиков пуст*\n\nНет активных подписчиков.", { parse_mode: "Markdown" });
                return;
            }
            // Показываем подписчиков порциями по 5 с кнопками
            const pageSize = 5;
            const totalPages = Math.ceil(subscribers.length / pageSize);
            for (let page = 0; page < totalPages; page++) {
                const start = page * pageSize;
                const end = start + pageSize;
                const pageSubscribers = subscribers.slice(start, end);
                const { text, keyboard } = this.createSubscribersMessageWithButtons(pageSubscribers, page + 1, totalPages, start);
                await this.bot.sendMessage(chatId, text, {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: keyboard,
                    },
                });
                // Небольшая задержка между сообщениями
                if (page < totalPages - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 800));
                }
            }
            // Отправляем итоговую статистику
            const statsMessage = `
📊 **Итоговая статистика подписчиков:**

👥 Всего активных: **${subscribers.length}**
📅 Последняя проверка: ${formatDateForDisplay(new Date())}

💡 **Как использовать:**
• Нажмите на кнопку с именем пользователя для быстрой отписки
• Используйте \`/admin_unsubscribe <Chat_ID>\` для точной отписки
• Используйте \`/admin_unsubscribe_all\` для массовой отписки
`;
            await this.bot.sendMessage(chatId, statsMessage, {
                parse_mode: "Markdown",
            });
        }
        catch (error) {
            logger.error("Admin: Ошибка получения списка подписчиков:", error);
            await this.bot.sendMessage(chatId, `❌ Ошибка получения списка подписчиков: ${error.message}`, { parse_mode: "Markdown" });
        }
    }
    /**
     * Создание сообщения со списком подписчиков и кнопками
     */
    createSubscribersMessageWithButtons(subscribers, page, totalPages, startIndex = 0) {
        let message = `📝 *Список подписчиков* (страница ${page}/${totalPages})\n\n`;
        const keyboard = [];
        subscribers.forEach((sub, index) => {
            const globalIndex = startIndex + index + 1;
            const username = sub.username ? `@${sub.username}` : "нет username";
            const firstName = sub.firstName || "нет имени";
            const subscribedDate = formatDateForDisplay(sub.subscribedAt);
            const lastNotified = sub.lastNotified
                ? formatDateForDisplay(sub.lastNotified)
                : "никогда";
            // Текстовая информация
            message += `${globalIndex}. **${firstName}** (${username})\n`;
            message += `   💬 Chat ID: \`${sub.chatId}\`\n`;
            message += `   📅 Подписан: ${subscribedDate}\n`;
            message += `   🔔 Последнее уведомление: ${lastNotified}\n\n`;
            // Кнопка для отписки
            const buttonText = `❌ ${firstName} (${sub.chatId})`;
            const callbackData = `unsubscribe_${sub.chatId}`;
            keyboard.push([
                {
                    text: buttonText,
                    callback_data: callbackData,
                },
            ]);
        });
        message += `\n🔽 **Нажмите на кнопку ниже для отписки пользователя:**`;
        return { text: message, keyboard };
    }
    /**
     * Админская команда: массовая рассылка
     */
    async handleAdminBroadcastCommand(msg) {
        const chatId = msg.chat.id;
        try {
            const message = `
📢 *Админ-панель: Массовая рассылка*

Для отправки сообщения всем подписчикам используйте команду:
\`/admin_broadcast <ваше сообщение>\`

**Пример:**
\`/admin_broadcast Внимание! Завтра планируется масштабное отключение электричества.\`

⚠️ **Внимание:** Сообщение будет отправлено ВСЕМ активным подписчикам (${this.subscriptionManager.getStats().activeSubscribers} чел.).
`;
            await this.bot.sendMessage(chatId, message, {
                parse_mode: "Markdown",
            });
            // Проверяем, есть ли текст для рассылки
            const text = msg.text?.replace(/^\/admin_broadcast\s*/, "").trim();
            if (text && text.length > 0) {
                await this.performBroadcast(chatId, text);
            }
        }
        catch (error) {
            logger.error("Admin: Ошибка обработки команды рассылки:", error);
            await this.bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`, { parse_mode: "Markdown" });
        }
    }
    /**
     * Выполнение массовой рассылки
     */
    async performBroadcast(adminChatId, message) {
        try {
            const subscribers = this.subscriptionManager.getSubscribers();
            if (subscribers.length === 0) {
                await this.bot.sendMessage(adminChatId, "❌ Нет активных подписчиков для рассылки.", { parse_mode: "Markdown" });
                return;
            }
            // Подтверждение рассылки
            const confirmMessage = `
🚨 **ПОДТВЕРЖДЕНИЕ РАССЫЛКИ**

📝 **Сообщение:**
${message}

👥 **Получатели:** ${subscribers.length} активных подписчиков

⚠️ Вы действительно хотите отправить это сообщение всем подписчикам?
Для подтверждения отправьте: \`/confirm_broadcast\`
`;
            await this.bot.sendMessage(adminChatId, confirmMessage, {
                parse_mode: "Markdown",
            });
            // Сохраняем сообщение для подтверждения
            this.pendingBroadcast = {
                message,
                adminChatId,
                timestamp: Date.now(),
            };
            // Удаляем pending broadcast через 5 минут
            setTimeout(() => {
                if (this.pendingBroadcast &&
                    this.pendingBroadcast.timestamp === this.pendingBroadcast.timestamp) {
                    this.pendingBroadcast = undefined;
                }
            }, 5 * 60 * 1000);
        }
        catch (error) {
            logger.error("Admin: Ошибка подготовки рассылки:", error);
            throw error;
        }
    }
    /**
     * Подтверждение массовой рассылки
     */
    async handleConfirmBroadcastCommand(msg) {
        const chatId = msg.chat.id;
        try {
            if (!this.pendingBroadcast) {
                await this.bot.sendMessage(chatId, "❌ Нет ожидающих рассылок для подтверждения.", { parse_mode: "Markdown" });
                return;
            }
            if (this.pendingBroadcast.adminChatId !== chatId) {
                await this.bot.sendMessage(chatId, "❌ Вы можете подтверждать только свои рассылки.", { parse_mode: "Markdown" });
                return;
            }
            // Проверяем, не истёк ли срок действия (5 минут)
            const now = Date.now();
            const age = now - this.pendingBroadcast.timestamp;
            if (age > 5 * 60 * 1000) {
                this.pendingBroadcast = undefined;
                await this.bot.sendMessage(chatId, "❌ Время ожидания подтверждения истекло (5 минут). Повторите команду рассылки.", { parse_mode: "Markdown" });
                return;
            }
            // Выполняем рассылку
            const { message } = this.pendingBroadcast;
            this.pendingBroadcast = undefined;
            await this.executeBroadcast(chatId, message);
        }
        catch (error) {
            logger.error("Admin: Ошибка подтверждения рассылки:", error);
            await this.bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`, { parse_mode: "Markdown" });
        }
    }
    /**
     * Выполнение массовой рассылки
     */
    async executeBroadcast(adminChatId, message) {
        try {
            const subscribers = this.subscriptionManager.getSubscribers();
            await this.bot.sendMessage(adminChatId, `🚀 Начинаю рассылку сообщения ${subscribers.length} подписчикам...`, { parse_mode: "Markdown" });
            let successCount = 0;
            let errorCount = 0;
            // Рассылаем с небольшими задержками, чтобы не превысить лимиты Telegram
            for (let i = 0; i < subscribers.length; i++) {
                const subscriber = subscribers[i];
                if (!subscriber) {
                    continue;
                }
                try {
                    await this.bot.sendMessage(subscriber.chatId, `📢 *Сообщение от администратора:*\n\n${message}`, { parse_mode: "Markdown" });
                    successCount++;
                    // Обновляем время последнего уведомления
                    await this.subscriptionManager.updateLastNotified(subscriber.chatId);
                }
                catch (error) {
                    errorCount++;
                    logger.warn(`Admin: Не удалось отправить сообщение пользователю ${subscriber.chatId}:`, error);
                }
                // Задержка между сообщениями (30 сообщений в секунду - лимит Telegram)
                if (i < subscribers.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 35));
                }
                // Отправляем прогресс каждые 10 сообщений
                if ((i + 1) % 10 === 0) {
                    await this.bot.sendMessage(adminChatId, `📊 Прогресс: ${i + 1}/${subscribers.length} (✅ ${successCount}, ❌ ${errorCount})`, { parse_mode: "Markdown" });
                }
            }
            // Финальный отчёт
            const finalMessage = `
✅ **Рассылка завершена!**

📊 **Статистика:**
• Всего получателей: ${subscribers.length}
• Успешно доставлено: ${successCount}
• Ошибки доставки: ${errorCount}
• Эффективность: ${Math.round((successCount / subscribers.length) * 100)}%

${errorCount > 0
                ? "⚠️ Некоторые сообщения не доставлены (пользователи могли заблокировать бота)."
                : "🎉 Все сообщения успешно доставлены!"}
`;
            await this.bot.sendMessage(adminChatId, finalMessage, {
                parse_mode: "Markdown",
            });
            logger.info(`Admin: Рассылка завершена. Успешно: ${successCount}, ошибок: ${errorCount}`);
        }
        catch (error) {
            logger.error("Admin: Ошибка выполнения рассылки:", error);
            throw error;
        }
    }
    /**
     * Обработка inline отписки через callback
     */
    async handleInlineUnsubscribe(callbackQuery, targetChatId) {
        const chatId = callbackQuery.message?.chat.id;
        if (!chatId) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: "❌ Ошибка получения чата",
            });
            return;
        }
        try {
            logger.info(`Admin: Inline отписка пользователя ${targetChatId} от админа ${callbackQuery.from.id}`);
            // Проверяем, существует ли подписчик
            const subscribers = this.subscriptionManager.getSubscribers();
            const targetSubscriber = subscribers.find((sub) => sub.chatId === targetChatId);
            if (!targetSubscriber) {
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: `❌ Пользователь ${targetChatId} не найден`,
                    show_alert: true,
                });
                return;
            }
            // Выполняем отписку
            const success = await this.subscriptionManager.unsubscribe(targetChatId);
            if (success) {
                const username = targetSubscriber.username
                    ? `@${targetSubscriber.username}`
                    : "нет username";
                const firstName = targetSubscriber.firstName || "нет имени";
                // Ответ на callback
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: `✅ ${firstName} отписан`,
                });
                // Обновляем сообщение - удаляем кнопку отписанного пользователя
                await this.updateSubscribersMessage(chatId, callbackQuery.message?.message_id);
                // Отправляем подтверждающее сообщение
                const confirmMessage = `
✅ **Пользователь отписан через inline кнопку**

👤 **Информация:**
• Имя: ${firstName}
• Username: ${username}
• Chat ID: \`${targetChatId}\`

📧 Пользователь больше не будет получать уведомления.
`;
                await this.bot.sendMessage(chatId, confirmMessage, {
                    parse_mode: "Markdown",
                });
                logger.info(`Admin: Пользователь ${targetChatId} отписан через inline кнопку админом ${callbackQuery.from.id}`);
            }
            else {
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: `❌ Не удалось отписать пользователя`,
                    show_alert: true,
                });
            }
        }
        catch (error) {
            logger.error("Admin: Ошибка inline отписки пользователя:", error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: "❌ Произошла ошибка при отписке",
                show_alert: true,
            });
        }
    }
    /**
     * Обновление сообщения со списком подписчиков
     */
    async updateSubscribersMessage(chatId, messageId) {
        if (!messageId)
            return;
        try {
            const subscribers = this.subscriptionManager.getSubscribers();
            if (subscribers.length === 0) {
                await this.bot.editMessageText("📝 *Список подписчиков пуст*\n\nВсе пользователи отписаны.", {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: "Markdown",
                });
                return;
            }
            // Берем только первые 5 для обновления (чтобы не превысить лимит кнопок)
            const displaySubscribers = subscribers.slice(0, 5);
            const { text, keyboard } = this.createSubscribersMessageWithButtons(displaySubscribers, 1, 1);
            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: keyboard,
                },
            });
        }
        catch (error) {
            logger.error("Admin: Ошибка обновления сообщения подписчиков:", error);
        }
    }
    /**
     * Админская команда: отписка пользователя по Chat ID
     */
    async handleAdminUnsubscribeCommand(msg) {
        const chatId = msg.chat.id;
        try {
            logger.info(`Admin: Запрос отписки от админа ${msg.from?.id}`);
            // Извлекаем Chat ID из команды
            const text = msg.text || "";
            const match = text.match(/\/admin_unsubscribe\s+(\d+)/);
            if (!match || !match[1]) {
                const helpMessage = `
❌ *Неверный формат команды*

📝 **Правильное использование:**
\`/admin_unsubscribe <Chat_ID>\`

**Пример:**
\`/admin_unsubscribe 123456789\`

💡 **Как найти Chat ID:**
• Посмотрите в списке подписчиков (/admin_subscribers)
• Chat ID указан для каждого пользователя

⚠️ **Внимание:** Операция необратима!
`;
                await this.bot.sendMessage(chatId, helpMessage, {
                    parse_mode: "Markdown",
                });
                return;
            }
            const targetChatId = parseInt(match[1], 10);
            // Проверяем, существует ли подписчик
            const subscribers = this.subscriptionManager.getSubscribers();
            const targetSubscriber = subscribers.find((sub) => sub.chatId === targetChatId);
            if (!targetSubscriber) {
                await this.bot.sendMessage(chatId, `❌ Пользователь с Chat ID \`${targetChatId}\` не найден среди подписчиков.`, { parse_mode: "Markdown" });
                return;
            }
            // Выполняем отписку
            const success = await this.subscriptionManager.unsubscribe(targetChatId);
            if (success) {
                const username = targetSubscriber.username
                    ? `@${targetSubscriber.username}`
                    : "нет username";
                const firstName = targetSubscriber.firstName || "нет имени";
                const successMessage = `
✅ **Пользователь успешно отписан**

👤 **Информация:**
• Имя: ${firstName}
• Username: ${username}
• Chat ID: \`${targetChatId}\`
• Дата подписки: ${formatDateForDisplay(targetSubscriber.subscribedAt)}

📧 Пользователь больше не будет получать автоматические уведомления.
`;
                await this.bot.sendMessage(chatId, successMessage, {
                    parse_mode: "Markdown",
                });
                logger.info(`Admin: Пользователь ${targetChatId} отписан админом ${msg.from?.id}`);
            }
            else {
                await this.bot.sendMessage(chatId, `❌ Не удалось отписать пользователя \`${targetChatId}\`. Возможно, он уже был отписан.`, { parse_mode: "Markdown" });
            }
        }
        catch (error) {
            logger.error("Admin: Ошибка отписки пользователя:", error);
            await this.bot.sendMessage(chatId, `❌ Ошибка при отписке пользователя: ${error.message}`, { parse_mode: "Markdown" });
        }
    }
    /**
     * Админская команда: массовая отписка всех пользователей
     */
    async handleAdminUnsubscribeAllCommand(msg) {
        const chatId = msg.chat.id;
        try {
            logger.info(`Admin: Запрос массовой отписки от админа ${msg.from?.id}`);
            const subscribers = this.subscriptionManager.getSubscribers();
            if (subscribers.length === 0) {
                await this.bot.sendMessage(chatId, "📝 *Нет активных подписчиков*\n\nСписок подписчиков уже пуст.", { parse_mode: "Markdown" });
                return;
            }
            // Подтверждение массовой отписки
            const confirmMessage = `
🚨 **МАССОВАЯ ОТПИСКА - ПОДТВЕРЖДЕНИЕ**

⚠️ **ВНИМАНИЕ! ОПАСНАЯ ОПЕРАЦИЯ!**

📊 **Будут отписаны:**
• Всего подписчиков: ${subscribers.length}
• Все пользователи лишатся уведомлений
• Операция **НЕОБРАТИМА**

🔴 **Последствия:**
• Пользователям нужно будет подписаться заново
• История подписок сохранится в БД
• Автоматические уведомления прекратятся

❓ Вы действительно хотите отписать **ВСЕХ** пользователей?

Для подтверждения отправьте: \`/confirm_unsubscribe_all\`
Время ожидания: 5 минут
`;
            await this.bot.sendMessage(chatId, confirmMessage, {
                parse_mode: "Markdown",
            });
            // Сохраняем запрос для подтверждения
            this.pendingUnsubscribeAll = {
                adminChatId: chatId,
                timestamp: Date.now(),
                subscriberCount: subscribers.length,
            };
            // Удаляем pending unsubscribe через 5 минут
            setTimeout(() => {
                if (this.pendingUnsubscribeAll &&
                    this.pendingUnsubscribeAll.timestamp ===
                        this.pendingUnsubscribeAll.timestamp) {
                    this.pendingUnsubscribeAll = undefined;
                }
            }, 5 * 60 * 1000);
        }
        catch (error) {
            logger.error("Admin: Ошибка подготовки массовой отписки:", error);
            await this.bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`, { parse_mode: "Markdown" });
        }
    }
    /**
     * Подтверждение массовой отписки
     */
    async handleConfirmUnsubscribeAllCommand(msg) {
        const chatId = msg.chat.id;
        try {
            if (!this.pendingUnsubscribeAll) {
                await this.bot.sendMessage(chatId, "❌ Нет ожидающих массовых отписок для подтверждения.", { parse_mode: "Markdown" });
                return;
            }
            if (this.pendingUnsubscribeAll.adminChatId !== chatId) {
                await this.bot.sendMessage(chatId, "❌ Вы можете подтверждать только свои операции.", { parse_mode: "Markdown" });
                return;
            }
            // Проверяем, не истёк ли срок действия (5 минут)
            const now = Date.now();
            const age = now - this.pendingUnsubscribeAll.timestamp;
            if (age > 5 * 60 * 1000) {
                this.pendingUnsubscribeAll = undefined;
                await this.bot.sendMessage(chatId, "❌ Время ожидания подтверждения истекло (5 минут). Повторите команду.", { parse_mode: "Markdown" });
                return;
            }
            // Выполняем массовую отписку
            const { subscriberCount } = this.pendingUnsubscribeAll;
            this.pendingUnsubscribeAll = undefined;
            await this.executeUnsubscribeAll(chatId, subscriberCount);
        }
        catch (error) {
            logger.error("Admin: Ошибка подтверждения массовой отписки:", error);
            await this.bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`, { parse_mode: "Markdown" });
        }
    }
    /**
     * Выполнение массовой отписки
     */
    async executeUnsubscribeAll(adminChatId, expectedCount) {
        try {
            const subscribers = this.subscriptionManager.getSubscribers();
            await this.bot.sendMessage(adminChatId, `🚀 Начинаю массовую отписку ${subscribers.length} пользователей...`, { parse_mode: "Markdown" });
            let successCount = 0;
            let errorCount = 0;
            // Отписываем всех пользователей
            for (let i = 0; i < subscribers.length; i++) {
                const subscriber = subscribers[i];
                if (!subscriber) {
                    continue;
                }
                try {
                    const success = await this.subscriptionManager.unsubscribe(subscriber.chatId);
                    if (success) {
                        successCount++;
                    }
                    else {
                        errorCount++;
                    }
                    // Отправляем прогресс каждые 5 операций
                    if ((i + 1) % 5 === 0) {
                        await this.bot.sendMessage(adminChatId, `📊 Прогресс: ${i + 1}/${subscribers.length} (✅ ${successCount}, ❌ ${errorCount})`, { parse_mode: "Markdown" });
                    }
                }
                catch (error) {
                    errorCount++;
                    logger.warn(`Admin: Не удалось отписать пользователя ${subscriber.chatId}:`, error);
                }
            }
            // Финальный отчёт
            const finalMessage = `
✅ **Массовая отписка завершена!**

📊 **Статистика:**
• Ожидалось отписок: ${expectedCount}
• Фактически обработано: ${subscribers.length}
• Успешно отписано: ${successCount}
• Ошибки: ${errorCount}
• Эффективность: ${Math.round((successCount / subscribers.length) * 100)}%

${errorCount > 0
                ? "⚠️ Некоторые пользователи не были отписаны из-за ошибок."
                : "🎉 Все пользователи успешно отписаны!"}

📝 **Что произошло:**
• Все подписчики помечены как неактивные в БД
• История подписок сохранена для аналитики
• Автоматические уведомления прекращены
• Пользователи могут подписаться заново через /subscribe
`;
            await this.bot.sendMessage(adminChatId, finalMessage, {
                parse_mode: "Markdown",
            });
            logger.info(`Admin: Массовая отписка завершена. Успешно: ${successCount}, ошибок: ${errorCount}`);
        }
        catch (error) {
            logger.error("Admin: Ошибка выполнения массовой отписки:", error);
            throw error;
        }
    }
    /**
     * Инициализация системы подписок
     */
    async initializeSubscriptions() {
        try {
            await this.subscriptionManager.initialize();
            this.startNotificationChecker();
            logger.info("Telegram: Система подписок инициализирована");
        }
        catch (error) {
            logger.error("Telegram: Ошибка инициализации подписок:", error);
        }
    }
    /**
     * Запуск фонового процесса проверки новых отключений
     */
    startNotificationChecker() {
        // Проверяем каждые 6 часов (6 * 60 * 60 * 1000 мс)
        const INTERVAL_MS = 6 * 60 * 60 * 1000;
        this.notificationInterval = setInterval(async () => {
            await this.checkForNewOutagesAndNotify();
        }, INTERVAL_MS);
        logger.info("Telegram: Запущен фоновый процесс проверки отключений (каждые 6 часов)");
    }
    /**
     * Остановка фонового процесса уведомлений
     */
    stopNotificationChecker() {
        if (this.notificationInterval) {
            clearInterval(this.notificationInterval);
            this.notificationInterval = undefined;
            logger.info("Telegram: Остановлен фоновый процесс проверки отключений");
        }
    }
    /**
     * Проверка новых отключений и отправка уведомлений
     */
    async checkForNewOutagesAndNotify() {
        try {
            logger.info("Telegram: Запуск проверки новых отключений");
            const subscribers = this.subscriptionManager.getSubscribers();
            if (subscribers.length === 0) {
                logger.info("Telegram: Нет подписчиков, пропускаем проверку");
                return;
            }
            // Получаем актуальные отключения
            const outages = await getPowerOutagesQuick(30);
            const newOutages = filterValidOutages(outages);
            // Проверяем наличие новых результатов (до обновления данных)
            const hasNewOutages = this.subscriptionManager.hasNewResults(newOutages);
            // Обновляем информацию о последней проверке
            await this.subscriptionManager.updateLastCheck(newOutages);
            if (hasNewOutages && newOutages.length > 0) {
                logger.info(`Telegram: Найдены новые отключения (${newOutages.length}), отправляем уведомления`);
                // Отправляем уведомления всем подписчикам
                for (const subscriber of subscribers) {
                    await this.sendNotificationToSubscriber(subscriber.chatId, newOutages);
                }
            }
            else {
                logger.info("Telegram: Новых отключений не найдено");
            }
        }
        catch (error) {
            logger.error("Telegram: Ошибка при проверке новых отключений:", error);
        }
    }
    /**
     * Отправка уведомления подписчику
     */
    async sendNotificationToSubscriber(chatId, outages) {
        try {
            const message = `
🔔 *Уведомление о новых отключениях*

📍 Место: ${MY_PLACE}
📊 Найдено: ${outages.length} ${outages.length === 1 ? "отключение" : "отключений"}
📅 Проверено: ${formatDateForDisplay(new Date())}

Используйте /search\\_new для получения подробного отчета.
`;
            await this.bot.sendMessage(chatId, message, {
                parse_mode: "Markdown",
            });
            await this.subscriptionManager.updateLastNotified(chatId);
            logger.info(`Telegram: Отправлено уведомление подписчику ${chatId}`);
        }
        catch (error) {
            logger.error(`Telegram: Ошибка отправки уведомления подписчику ${chatId}:`, error);
        }
    }
    /**
     * Обработка команды /subscribe
     */
    async handleSubscribeCommand(msg) {
        const chatId = msg.chat.id;
        const username = msg.from?.username;
        const firstName = msg.from?.first_name;
        try {
            logger.info(`Telegram: Попытка подписки от пользователя ${chatId} (@${username || "unknown"})`);
            const success = await this.subscriptionManager.subscribe(chatId, username, firstName);
            if (success) {
                const message = `
✅ *Подписка активирована!*

🔔 Вы будете получать уведомления о новых отключениях в районе ${MY_PLACE}.

⏰ Проверка происходит каждые 6 часов.
📲 Уведомления приходят только при появлении новых результатов.

Для отключения используйте команду /unsubscribe
`;
                await this.bot.sendMessage(chatId, message, {
                    parse_mode: "Markdown",
                });
            }
            else {
                await this.bot.sendMessage(chatId, "ℹ️ Вы уже подписаны на уведомления о новых отключениях.", { parse_mode: "Markdown" });
            }
        }
        catch (error) {
            logger.error("Telegram: Ошибка при оформлении подписки:", error);
            await this.bot.sendMessage(chatId, `❌ Произошла ошибка при оформлении подписки:\n\`${error.message}\``, { parse_mode: "Markdown" });
        }
    }
    /**
     * Обработка команды /unsubscribe
     */
    async handleUnsubscribeCommand(msg) {
        const chatId = msg.chat.id;
        try {
            logger.info(`Telegram: Попытка отписки от пользователя ${chatId}`);
            const success = await this.subscriptionManager.unsubscribe(chatId);
            if (success) {
                const message = `
✅ *Подписка отключена*

🔕 Вы больше не будете получать автоматические уведомления о новых отключениях.

Для повторной подписки используйте команду /subscribe
`;
                await this.bot.sendMessage(chatId, message, {
                    parse_mode: "Markdown",
                });
            }
            else {
                await this.bot.sendMessage(chatId, "ℹ️ Вы не были подписаны на уведомления.", { parse_mode: "Markdown" });
            }
        }
        catch (error) {
            logger.error("Telegram: Ошибка при отписке:", error);
            await this.bot.sendMessage(chatId, `❌ Произошла ошибка при отписке:\n\`${error.message}\``, { parse_mode: "Markdown" });
        }
    }
    /**
     * Обработка команды /get
     */
    async handleGetCommand(msg) {
        const chatId = msg.chat.id;
        try {
            logger.info(`Telegram: Запрос последнего отчета от пользователя ${msg.from?.username || msg.from?.id}`);
            // Получаем информацию о последнем отчете
            const reportInfo = await getLatestReportInfo();
            if (!reportInfo) {
                await this.bot.sendMessage(chatId, "📄 Отчеты не найдены.\n\nИспользуйте команду /search или /search\\_new для создания нового отчета.", { parse_mode: "Markdown" });
                return;
            }
            // Отправляем информацию об отчете
            const infoMessage = `
📄 *Последний отчет найден*

📋 Файл: \`${reportInfo.name}\`
📅 Создан: ${formatDateForDisplay(reportInfo.createdAt)}
📊 Размер: ${Math.round(reportInfo.size / 1024)} КБ

Отправляю файл...
`;
            await this.bot.sendMessage(chatId, infoMessage, {
                parse_mode: "Markdown",
            });
            // Отправляем файл отчета
            await this.bot.sendDocument(chatId, reportInfo.path, {
                caption: `📄 Последний отчет об отключениях`,
            });
            logger.info(`Telegram: Отправлен отчет ${reportInfo.name}`);
        }
        catch (error) {
            logger.error("Telegram: Ошибка при получении отчета:", error);
            await this.bot.sendMessage(chatId, `❌ Произошла ошибка при получении отчета:\n\`${error.message}\``, { parse_mode: "Markdown" });
        }
    }
    /**
     * Обработка команд поиска
     */
    async handleSearchCommand(msg, onlyNew) {
        const chatId = msg.chat.id;
        const commandName = onlyNew ? "/search_new" : "/search";
        try {
            // Отправляем сообщение о начале поиска
            const processingMsg = await this.bot.sendMessage(chatId, `🔍 Выполняю поиск отключений для ${MY_PLACE}...`);
            logger.info(`Telegram: Начат поиск ${commandName} от пользователя ${msg.from?.username || msg.from?.id}`);
            // Выполняем поиск
            const outages = await getPowerOutagesQuick(30);
            let filteredOutages = outages;
            let messageText = "";
            if (onlyNew) {
                // Фильтруем только актуальные отключения
                filteredOutages = filterValidOutages(outages);
                messageText = `
🔌 *Поиск актуальных отключений завершен*

📍 Место: ${MY_PLACE}
📊 Всего найдено: ${outages.length} отключений
✅ Актуальных: ${filteredOutages.length} отключений
📅 Проверка: ${formatDateForDisplay(new Date())}
`;
            }
            else {
                messageText = `
🔌 *Поиск отключений завершен*

📍 Место: ${MY_PLACE}  
📊 Найдено: ${outages.length} отключений
📅 Время поиска: ${formatDateForDisplay(new Date())}
`;
            }
            // Удаляем сообщение о процессе
            await this.bot.deleteMessage(chatId, processingMsg.message_id);
            // Отправляем результат
            await this.bot.sendMessage(chatId, messageText, {
                parse_mode: "Markdown",
            });
            if (filteredOutages.length > 0) {
                // Создаем и сохраняем отчет
                const reportPath = await saveReport(filteredOutages, `telegram-report-${onlyNew ? "new-" : ""}${Date.now()}`);
                // Отправляем файл отчета
                await this.bot.sendDocument(chatId, reportPath, {
                    caption: `📄 Отчет об отключениях (${filteredOutages.length} записей)`,
                });
                // Отправляем краткую информацию о найденных отключениях
                const summary = this.createOutagesSummary(filteredOutages, onlyNew);
                await this.bot.sendMessage(chatId, summary, {
                    parse_mode: "Markdown",
                });
            }
            else {
                await this.bot.sendMessage(chatId, `✅ ${onlyNew ? "Актуальных отключений" : "Отключений"} не найдено!`);
            }
            logger.info(`Telegram: Поиск ${commandName} завершен. Найдено: ${filteredOutages.length}/${outages.length}`);
        }
        catch (error) {
            logger.error(`Telegram: Ошибка при выполнении ${commandName}:`, error);
            await this.bot.sendMessage(chatId, `❌ Произошла ошибка при поиске отключений:\n\`${error.message}\``, { parse_mode: "Markdown" });
        }
    }
    /**
     * Создание краткой сводки по отключениям
     */
    createOutagesSummary(outages, onlyNew) {
        const maxShow = 5; // Показываем максимум 5 отключений
        let summary = `
📋 *${onlyNew ? "Актуальные отключения" : "Найденные отключения"}:*

`;
        outages.slice(0, maxShow).forEach((outage, index) => {
            summary += `${index + 1}. **${outage.place}**\n`;
            summary += `   📍 ${outage.addresses || "Адрес не указан"}\n`;
            summary += `   ⏰ ${outage.dateFrom || "Время не указано"}\n`;
            if (outage.dateTo && outage.dateTo !== "-") {
                summary += `   🔄 ${outage.dateTo}\n`;
            }
            summary += `\n`;
        });
        if (outages.length > maxShow) {
            summary += `_... и еще ${outages.length - maxShow} отключений_\n`;
        }
        return summary;
    }
    /**
     * Запуск бота
     */
    start() {
        if (this.isPolling) {
            console.log("⚠️ Бот уже запущен");
            return;
        }
        this.bot.startPolling();
        this.isPolling = true;
        console.log("🤖 Telegram бот запущен");
        logger.info("Telegram бот успешно запущен");
    }
    /**
     * Остановка бота
     */
    stop() {
        if (!this.isPolling) {
            console.log("⚠️ Бот не запущен");
            return;
        }
        this.bot.stopPolling();
        this.stopNotificationChecker();
        this.subscriptionManager.close();
        this.isPolling = false;
        console.log("🛑 Telegram бот остановлен");
        logger.info("Telegram бот остановлен");
    }
    /**
     * Проверка статуса бота
     */
    isRunning() {
        return this.isPolling;
    }
}
//# sourceMappingURL=telegramBot.js.map