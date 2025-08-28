/**
 * Telegram бот для управления парсером отключений
 */

import TelegramBot from "node-telegram-bot-api";
import {
  getPowerOutagesQuick,
  saveReport,
  createMarkdownReport,
} from "./index.js";
import {
  filterValidOutages,
  formatDateForDisplay,
  MY_PLACE,
  logger,
  getLatestReportInfo,
  SubscriptionManager,
  DatabaseManager,
  ADMIN_CHAT_IDS,
  escapeMarkdown,
  scheduler,
} from "./utils/index.js";
import type { PowerOutageInfo } from "./utils/types.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

export class PowerOutageBot {
  private bot: TelegramBot;
  private isPolling: boolean = false;
  private subscriptionManager: SubscriptionManager;
  private notificationInterval?: NodeJS.Timeout | undefined;
  private pendingBroadcast?:
    | {
        message: string;
        adminChatId: number;
        timestamp: number;
      }
    | undefined;
  private pendingUnsubscribeAll?:
    | {
        adminChatId: number;
        timestamp: number;
        subscriberCount: number;
      }
    | undefined;

  /**
   * Получение версии приложения из package.json или переменной окружения
   */
  private getAppVersion(): string {
    try {
      // Сначала проверяем переменную окружения (для Docker/Dokploy)
      if (process.env.APP_VERSION) {
        return process.env.APP_VERSION;
      }

      // Если переменной нет, читаем из package.json
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const packageJsonPath = join(__dirname, "..", "package.json");
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      return packageJson.version || "неизвестная";
    } catch (error) {
      logger.error("Ошибка при получении версии приложения:", error);
      return "неизвестная";
    }
  }

  constructor(token: string) {
    this.bot = new TelegramBot(token, { polling: false });
    this.subscriptionManager = new SubscriptionManager();
    this.setupCommands();
    this.setupBotMenu();
    this.initializeSubscriptions();
  }

  /**
   * Настройка меню команд бота
   */
  private async setupBotMenu(): Promise<void> {
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
        {
          command: "admin_search",
          description: "🔍 Поиск отключений в БД",
        },
        {
          command: "admin_analytics",
          description: "📈 Аналитика отключений",
        },
        {
          command: "admin_set_interval",
          description: "⏰ Настройка интервала проверки (в часах)",
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
          } catch (error) {
            logger.warn(
              `Не удалось установить админское меню для ${adminId}:`,
              error
            );
          }
        }
      }

      logger.info("Telegram: Меню команд успешно настроено");
      logger.info(
        `Telegram: Админское меню настроено для ${ADMIN_CHAT_IDS.length} администраторов`
      );
    } catch (error) {
      logger.error("Telegram: Ошибка при настройке меню команд:", error);
    }
  }

  /**
   * Настройка команд бота
   */
  private setupCommands(): void {
    // Универсальный перехватчик админских команд
    this.bot.onText(/\/(admin_.*|confirm_.*)/, async (msg) => {
      if (!this.isAdmin(msg.from?.id)) {
        await this.sendAccessDeniedMessage(msg.chat.id);
        logger.warn(
          `Попытка доступа к админской команде от неавторизованного пользователя ${
            msg.from?.id
          } (${msg.from?.username || "unknown"}): ${msg.text}`
        );
        return;
      }
      // Если админ - команды обрабатываются специфическими обработчиками ниже
    });

    // Команда /start
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;

      // Записываем взаимодействие для аналитики
      this.recordUserInteraction(
        chatId,
        "/start",
        msg.from?.username,
        msg.from?.first_name
      );

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
      // Записываем взаимодействие для аналитики
      this.recordUserInteraction(
        msg.chat.id,
        "/get",
        msg.from?.username,
        msg.from?.first_name
      );
      await this.handleGetCommand(msg);
    });

    // Команда /help
    this.bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      const isAdmin = this.isAdmin(msg.from?.id);

      // Записываем взаимодействие для аналитики
      this.recordUserInteraction(
        chatId,
        "/help",
        msg.from?.username,
        msg.from?.first_name
      );

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
• Автоматическая проверка новых отключений каждые ${this.subscriptionManager.getUpdateInterval()} час${
        this.subscriptionManager.getUpdateInterval() === 1
          ? ""
          : this.subscriptionManager.getUpdateInterval() < 5
          ? "а"
          : "ов"
      }
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

**/admin\\_set\\_interval** - Настройка интервала обновления
• Изменение частоты проверки отключений (1-24 часа)
• Формат: \`/admin_set_interval [часы]\`
• Все пользователи получат уведомление об изменении
`;
      }

      await this.bot.sendMessage(chatId, helpMessage, {
        parse_mode: "Markdown",
      });
    });

    // Команда /subscribe
    this.bot.onText(/\/subscribe|\/подписка/, async (msg) => {
      // Записываем взаимодействие для аналитики
      this.recordUserInteraction(
        msg.chat.id,
        "/subscribe",
        msg.from?.username,
        msg.from?.first_name
      );
      await this.handleSubscribeCommand(msg);
    });

    // Команда /unsubscribe
    this.bot.onText(/\/unsubscribe|\/отписка/, async (msg) => {
      // Записываем взаимодействие для аналитики
      this.recordUserInteraction(
        msg.chat.id,
        "/unsubscribe",
        msg.from?.username,
        msg.from?.first_name
      );
      await this.handleUnsubscribeCommand(msg);
    });

    // Админские команды
    this.bot.onText(/\/admin_stats/, async (msg) => {
      if (this.isAdmin(msg.from?.id)) {
        await this.handleAdminStatsCommand(msg);
      } else {
        await this.sendAccessDeniedMessage(msg.chat.id);
      }
    });

    this.bot.onText(/\/admin_subscribers/, async (msg) => {
      if (this.isAdmin(msg.from?.id)) {
        await this.handleAdminSubscribersCommand(msg);
      } else {
        await this.sendAccessDeniedMessage(msg.chat.id);
      }
    });

    this.bot.onText(/\/admin_broadcast/, async (msg) => {
      if (this.isAdmin(msg.from?.id)) {
        await this.handleAdminBroadcastCommand(msg);
      } else {
        await this.sendAccessDeniedMessage(msg.chat.id);
      }
    });

    this.bot.onText(/\/confirm_broadcast/, async (msg) => {
      if (this.isAdmin(msg.from?.id)) {
        await this.handleConfirmBroadcastCommand(msg);
      } else {
        await this.sendAccessDeniedMessage(msg.chat.id);
      }
    });

    this.bot.onText(/\/admin_unsubscribe/, async (msg) => {
      if (this.isAdmin(msg.from?.id)) {
        await this.handleAdminUnsubscribeCommand(msg);
      } else {
        await this.sendAccessDeniedMessage(msg.chat.id);
      }
    });

    this.bot.onText(/\/admin_unsubscribe_all/, async (msg) => {
      if (this.isAdmin(msg.from?.id)) {
        await this.handleAdminUnsubscribeAllCommand(msg);
      } else {
        await this.sendAccessDeniedMessage(msg.chat.id);
      }
    });

    this.bot.onText(/\/confirm_unsubscribe_all/, async (msg) => {
      if (this.isAdmin(msg.from?.id)) {
        await this.handleConfirmUnsubscribeAllCommand(msg);
      } else {
        await this.sendAccessDeniedMessage(msg.chat.id);
      }
    });

    this.bot.onText(/\/admin_set_interval/, async (msg) => {
      if (this.isAdmin(msg.from?.id)) {
        await this.handleAdminSetIntervalCommand(msg);
      } else {
        await this.sendAccessDeniedMessage(msg.chat.id);
      }
    });

    this.bot.onText(/\/admin_search/, async (msg) => {
      if (this.isAdmin(msg.from?.id)) {
        await this.handleAdminSearchCommand(msg);
      } else {
        await this.sendAccessDeniedMessage(msg.chat.id);
      }
    });

    this.bot.onText(/\/admin_analytics/, async (msg) => {
      if (this.isAdmin(msg.from?.id)) {
        await this.handleAdminAnalyticsCommand(msg);
      } else {
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
        } else {
          await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: "❌ Неизвестная команда",
          });
        }
      } catch (error) {
        logger.error("Telegram: Ошибка обработки callback:", error);
        await this.bot.answerCallbackQuery(callbackQuery.id, {
          text: "❌ Произошла ошибка",
          show_alert: true,
        });
      }
    });

    // Обработчик произвольных сообщений (не команд)
    this.bot.on("message", async (msg) => {
      // Игнорируем команды (они обрабатываются выше)
      if (msg.text?.startsWith("/")) {
        return;
      }

      // Игнорируем системные сообщения
      if (
        msg.new_chat_members ||
        msg.left_chat_member ||
        msg.group_chat_created
      ) {
        return;
      }

      const chatId = msg.chat.id;
      const helpMessage = `
🤖 *Rosseti Parser Bot*

Я работаю только с командами\\. 

📋 Для получения справки по всем доступным командам используйте:
/help

✨ Основные команды:
• /start \\- приветствие и информация
• /search \\- поиск отключений электричества
• /subscribe \\- подписаться на уведомления
• /unsubscribe \\- отписаться от уведомлений
`;

      await this.bot.sendMessage(chatId, helpMessage, {
        parse_mode: "MarkdownV2",
      });
    });
  }

  /**
   * Проверка прав администратора
   */
  private isAdmin(userId?: number): boolean {
    if (!userId) return false;

    return ADMIN_CHAT_IDS.includes(userId);
  }

  /**
   * Отправка сообщения об отказе в доступе
   */
  private async sendAccessDeniedMessage(chatId: number): Promise<void> {
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
  private async handleAdminStatsCommand(
    msg: TelegramBot.Message
  ): Promise<void> {
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
• Время: ${
        stats.lastCheck
          ? formatDateForDisplay(stats.lastCheck)
          : "Не проводилась"
      }
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
    } catch (error) {
      logger.error("Admin: Ошибка получения статистики:", error);
      await this.bot.sendMessage(
        chatId,
        `❌ Ошибка получения статистики: ${(error as Error).message}`,
        { parse_mode: "Markdown" }
      );
    }
  }

  /**
   * Админская команда: список подписчиков с интерактивными кнопками
   */
  private async handleAdminSubscribersCommand(
    msg: TelegramBot.Message
  ): Promise<void> {
    const chatId = msg.chat.id;

    try {
      logger.info(`Admin: Запрос списка подписчиков от админа ${msg.from?.id}`);

      const subscribers = this.subscriptionManager.getSubscribers();

      if (subscribers.length === 0) {
        await this.bot.sendMessage(
          chatId,
          "📝 *Список подписчиков пуст*\n\nНет активных подписчиков.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      // Показываем подписчиков порциями по 5 с кнопками
      const pageSize = 5;
      const totalPages = Math.ceil(subscribers.length / pageSize);

      for (let page = 0; page < totalPages; page++) {
        const start = page * pageSize;
        const end = start + pageSize;
        const pageSubscribers = subscribers.slice(start, end);

        const { text, keyboard } = this.createSubscribersMessageWithButtons(
          pageSubscribers,
          page + 1,
          totalPages,
          start
        );

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
    } catch (error) {
      logger.error("Admin: Ошибка получения списка подписчиков:", error);
      await this.bot.sendMessage(
        chatId,
        `❌ Ошибка получения списка подписчиков: ${(error as Error).message}`,
        { parse_mode: "Markdown" }
      );
    }
  }

  /**
   * Создание сообщения со списком подписчиков и кнопками
   */
  private createSubscribersMessageWithButtons(
    subscribers: Array<{
      chatId: number;
      username?: string | undefined;
      firstName?: string | undefined;
      subscribedAt: Date;
      lastNotified?: Date | undefined;
    }>,
    page: number,
    totalPages: number,
    startIndex: number = 0
  ): { text: string; keyboard: TelegramBot.InlineKeyboardButton[][] } {
    let message = `📝 *Список подписчиков* (страница ${page}/${totalPages})\n\n`;

    const keyboard: TelegramBot.InlineKeyboardButton[][] = [];

    subscribers.forEach((sub, index) => {
      const globalIndex = startIndex + index + 1;
      const username = sub.username ? `@${sub.username}` : "нет username";
      const firstName = sub.firstName || "нет имени";
      const subscribedDate = formatDateForDisplay(sub.subscribedAt);
      const lastNotified = sub.lastNotified
        ? formatDateForDisplay(sub.lastNotified)
        : "никогда";

      // Экранируем данные для безопасного отображения в Markdown
      const safeFirstName = escapeMarkdown(firstName);
      const safeUsername = escapeMarkdown(username);
      const safeSubscribedDate = escapeMarkdown(subscribedDate);
      const safeLastNotified = escapeMarkdown(lastNotified);

      // Текстовая информация
      message += `${globalIndex}\\. **${safeFirstName}** \\(${safeUsername}\\)\n`;
      message += `   💬 Chat ID: \`${sub.chatId}\`\n`;
      message += `   📅 Подписан: ${safeSubscribedDate}\n`;
      message += `   🔔 Последнее уведомление: ${safeLastNotified}\n\n`;

      // Кнопка для отписки (в кнопках экранирование не нужно)
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
  private async handleAdminBroadcastCommand(
    msg: TelegramBot.Message
  ): Promise<void> {
    const chatId = msg.chat.id;

    try {
      const message = `
📢 *Админ-панель: Массовая рассылка*

Для отправки сообщения всем подписчикам используйте команду:
\`/admin_broadcast <ваше сообщение>\`

**Пример:**
\`/admin_broadcast Внимание! Завтра планируется масштабное отключение электричества.\`

⚠️ **Внимание:** Сообщение будет отправлено ВСЕМ активным подписчикам (${
        this.subscriptionManager.getStats().activeSubscribers
      } чел.).
`;

      await this.bot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
      });

      // Проверяем, есть ли текст для рассылки
      const text = msg.text?.replace(/^\/admin_broadcast\s*/, "").trim();

      if (text && text.length > 0) {
        await this.performBroadcast(chatId, text);
      }
    } catch (error) {
      logger.error("Admin: Ошибка обработки команды рассылки:", error);
      await this.bot.sendMessage(
        chatId,
        `❌ Ошибка: ${(error as Error).message}`,
        { parse_mode: "Markdown" }
      );
    }
  }

  /**
   * Выполнение массовой рассылки
   */
  private async performBroadcast(
    adminChatId: number,
    message: string
  ): Promise<void> {
    try {
      const subscribers = this.subscriptionManager.getSubscribers();

      if (subscribers.length === 0) {
        await this.bot.sendMessage(
          adminChatId,
          "❌ Нет активных подписчиков для рассылки.",
          { parse_mode: "Markdown" }
        );
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
        if (
          this.pendingBroadcast &&
          this.pendingBroadcast.timestamp === this.pendingBroadcast.timestamp
        ) {
          this.pendingBroadcast = undefined;
        }
      }, 5 * 60 * 1000);
    } catch (error) {
      logger.error("Admin: Ошибка подготовки рассылки:", error);
      throw error;
    }
  }

  /**
   * Подтверждение массовой рассылки
   */
  private async handleConfirmBroadcastCommand(
    msg: TelegramBot.Message
  ): Promise<void> {
    const chatId = msg.chat.id;

    try {
      if (!this.pendingBroadcast) {
        await this.bot.sendMessage(
          chatId,
          "❌ Нет ожидающих рассылок для подтверждения.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      if (this.pendingBroadcast.adminChatId !== chatId) {
        await this.bot.sendMessage(
          chatId,
          "❌ Вы можете подтверждать только свои рассылки.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      // Проверяем, не истёк ли срок действия (5 минут)
      const now = Date.now();
      const age = now - this.pendingBroadcast.timestamp;
      if (age > 5 * 60 * 1000) {
        this.pendingBroadcast = undefined;
        await this.bot.sendMessage(
          chatId,
          "❌ Время ожидания подтверждения истекло (5 минут). Повторите команду рассылки.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      // Выполняем рассылку
      const { message } = this.pendingBroadcast;
      this.pendingBroadcast = undefined;

      await this.executeBroadcast(chatId, message);
    } catch (error) {
      logger.error("Admin: Ошибка подтверждения рассылки:", error);
      await this.bot.sendMessage(
        chatId,
        `❌ Ошибка: ${(error as Error).message}`,
        { parse_mode: "Markdown" }
      );
    }
  }

  /**
   * Выполнение массовой рассылки
   */
  private async executeBroadcast(
    adminChatId: number,
    message: string
  ): Promise<void> {
    try {
      const subscribers = this.subscriptionManager.getSubscribers();

      await this.bot.sendMessage(
        adminChatId,
        `🚀 Начинаю рассылку сообщения ${subscribers.length} подписчикам...`,
        { parse_mode: "Markdown" }
      );

      let successCount = 0;
      let errorCount = 0;

      // Рассылаем с небольшими задержками, чтобы не превысить лимиты Telegram
      for (let i = 0; i < subscribers.length; i++) {
        const subscriber = subscribers[i];

        if (!subscriber) {
          continue;
        }

        try {
          await this.bot.sendMessage(
            subscriber.chatId,
            `📢 *Сообщение от администратора:*\n\n${message}`,
            { parse_mode: "Markdown" }
          );

          successCount++;

          // Обновляем время последнего уведомления
          await this.subscriptionManager.updateLastNotified(subscriber.chatId);
        } catch (error) {
          errorCount++;
          logger.warn(
            `Admin: Не удалось отправить сообщение пользователю ${subscriber.chatId}:`,
            error
          );
        }

        // Задержка между сообщениями (30 сообщений в секунду - лимит Telegram)
        if (i < subscribers.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 35));
        }

        // Отправляем прогресс каждые 10 сообщений
        if ((i + 1) % 10 === 0) {
          await this.bot.sendMessage(
            adminChatId,
            `📊 Прогресс: ${i + 1}/${
              subscribers.length
            } (✅ ${successCount}, ❌ ${errorCount})`,
            { parse_mode: "Markdown" }
          );
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

${
  errorCount > 0
    ? "⚠️ Некоторые сообщения не доставлены (пользователи могли заблокировать бота)."
    : "🎉 Все сообщения успешно доставлены!"
}
`;

      await this.bot.sendMessage(adminChatId, finalMessage, {
        parse_mode: "Markdown",
      });

      logger.info(
        `Admin: Рассылка завершена. Успешно: ${successCount}, ошибок: ${errorCount}`
      );
    } catch (error) {
      logger.error("Admin: Ошибка выполнения рассылки:", error);
      throw error;
    }
  }

  /**
   * Обработка inline отписки через callback
   */
  private async handleInlineUnsubscribe(
    callbackQuery: TelegramBot.CallbackQuery,
    targetChatId: number
  ): Promise<void> {
    const chatId = callbackQuery.message?.chat.id;

    if (!chatId) {
      await this.bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Ошибка получения чата",
      });
      return;
    }

    try {
      logger.info(
        `Admin: Inline отписка пользователя ${targetChatId} от админа ${callbackQuery.from.id}`
      );

      // Проверяем, существует ли подписчик
      const subscribers = this.subscriptionManager.getSubscribers();
      const targetSubscriber = subscribers.find(
        (sub) => sub.chatId === targetChatId
      );

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
        await this.updateSubscribersMessage(
          chatId,
          callbackQuery.message?.message_id
        );

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

        logger.info(
          `Admin: Пользователь ${targetChatId} отписан через inline кнопку админом ${callbackQuery.from.id}`
        );
      } else {
        await this.bot.answerCallbackQuery(callbackQuery.id, {
          text: `❌ Не удалось отписать пользователя`,
          show_alert: true,
        });
      }
    } catch (error) {
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
  private async updateSubscribersMessage(
    chatId: number,
    messageId?: number
  ): Promise<void> {
    if (!messageId) return;

    try {
      const subscribers = this.subscriptionManager.getSubscribers();

      if (subscribers.length === 0) {
        await this.bot.editMessageText(
          "📝 *Список подписчиков пуст*\n\nВсе пользователи отписаны.",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
          }
        );
        return;
      }

      // Берем только первые 5 для обновления (чтобы не превысить лимит кнопок)
      const displaySubscribers = subscribers.slice(0, 5);
      const { text, keyboard } = this.createSubscribersMessageWithButtons(
        displaySubscribers,
        1,
        1
      );

      await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
    } catch (error) {
      logger.error("Admin: Ошибка обновления сообщения подписчиков:", error);
    }
  }

  /**
   * Админская команда: отписка пользователя по Chat ID
   */
  private async handleAdminUnsubscribeCommand(
    msg: TelegramBot.Message
  ): Promise<void> {
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
      const targetSubscriber = subscribers.find(
        (sub) => sub.chatId === targetChatId
      );

      if (!targetSubscriber) {
        await this.bot.sendMessage(
          chatId,
          `❌ Пользователь с Chat ID \`${targetChatId}\` не найден среди подписчиков.`,
          { parse_mode: "Markdown" }
        );
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

        logger.info(
          `Admin: Пользователь ${targetChatId} отписан админом ${msg.from?.id}`
        );
      } else {
        await this.bot.sendMessage(
          chatId,
          `❌ Не удалось отписать пользователя \`${targetChatId}\`. Возможно, он уже был отписан.`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (error) {
      logger.error("Admin: Ошибка отписки пользователя:", error);
      await this.bot.sendMessage(
        chatId,
        `❌ Ошибка при отписке пользователя: ${(error as Error).message}`,
        { parse_mode: "Markdown" }
      );
    }
  }

  /**
   * Админская команда: массовая отписка всех пользователей
   */
  private async handleAdminUnsubscribeAllCommand(
    msg: TelegramBot.Message
  ): Promise<void> {
    const chatId = msg.chat.id;

    try {
      logger.info(`Admin: Запрос массовой отписки от админа ${msg.from?.id}`);

      const subscribers = this.subscriptionManager.getSubscribers();

      if (subscribers.length === 0) {
        await this.bot.sendMessage(
          chatId,
          "📝 *Нет активных подписчиков*\n\nСписок подписчиков уже пуст.",
          { parse_mode: "Markdown" }
        );
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
        if (
          this.pendingUnsubscribeAll &&
          this.pendingUnsubscribeAll.timestamp ===
            this.pendingUnsubscribeAll.timestamp
        ) {
          this.pendingUnsubscribeAll = undefined;
        }
      }, 5 * 60 * 1000);
    } catch (error) {
      logger.error("Admin: Ошибка подготовки массовой отписки:", error);
      await this.bot.sendMessage(
        chatId,
        `❌ Ошибка: ${(error as Error).message}`,
        { parse_mode: "Markdown" }
      );
    }
  }

  /**
   * Подтверждение массовой отписки
   */
  private async handleConfirmUnsubscribeAllCommand(
    msg: TelegramBot.Message
  ): Promise<void> {
    const chatId = msg.chat.id;

    try {
      if (!this.pendingUnsubscribeAll) {
        await this.bot.sendMessage(
          chatId,
          "❌ Нет ожидающих массовых отписок для подтверждения.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      if (this.pendingUnsubscribeAll.adminChatId !== chatId) {
        await this.bot.sendMessage(
          chatId,
          "❌ Вы можете подтверждать только свои операции.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      // Проверяем, не истёк ли срок действия (5 минут)
      const now = Date.now();
      const age = now - this.pendingUnsubscribeAll.timestamp;
      if (age > 5 * 60 * 1000) {
        this.pendingUnsubscribeAll = undefined;
        await this.bot.sendMessage(
          chatId,
          "❌ Время ожидания подтверждения истекло (5 минут). Повторите команду.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      // Выполняем массовую отписку
      const { subscriberCount } = this.pendingUnsubscribeAll;
      this.pendingUnsubscribeAll = undefined;

      await this.executeUnsubscribeAll(chatId, subscriberCount);
    } catch (error) {
      logger.error("Admin: Ошибка подтверждения массовой отписки:", error);
      await this.bot.sendMessage(
        chatId,
        `❌ Ошибка: ${(error as Error).message}`,
        { parse_mode: "Markdown" }
      );
    }
  }

  /**
   * Выполнение массовой отписки
   */
  private async executeUnsubscribeAll(
    adminChatId: number,
    expectedCount: number
  ): Promise<void> {
    try {
      const subscribers = this.subscriptionManager.getSubscribers();

      await this.bot.sendMessage(
        adminChatId,
        `🚀 Начинаю массовую отписку ${subscribers.length} пользователей...`,
        { parse_mode: "Markdown" }
      );

      let successCount = 0;
      let errorCount = 0;

      // Отписываем всех пользователей
      for (let i = 0; i < subscribers.length; i++) {
        const subscriber = subscribers[i];

        if (!subscriber) {
          continue;
        }

        try {
          const success = await this.subscriptionManager.unsubscribe(
            subscriber.chatId
          );

          if (success) {
            successCount++;
          } else {
            errorCount++;
          }

          // Отправляем прогресс каждые 5 операций
          if ((i + 1) % 5 === 0) {
            await this.bot.sendMessage(
              adminChatId,
              `📊 Прогресс: ${i + 1}/${
                subscribers.length
              } (✅ ${successCount}, ❌ ${errorCount})`,
              { parse_mode: "Markdown" }
            );
          }
        } catch (error) {
          errorCount++;
          logger.warn(
            `Admin: Не удалось отписать пользователя ${subscriber.chatId}:`,
            error
          );
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

${
  errorCount > 0
    ? "⚠️ Некоторые пользователи не были отписаны из-за ошибок."
    : "🎉 Все пользователи успешно отписаны!"
}

📝 **Что произошло:**
• Все подписчики помечены как неактивные в БД
• История подписок сохранена для аналитики
• Автоматические уведомления прекращены
• Пользователи могут подписаться заново через /subscribe
`;

      await this.bot.sendMessage(adminChatId, finalMessage, {
        parse_mode: "Markdown",
      });

      logger.info(
        `Admin: Массовая отписка завершена. Успешно: ${successCount}, ошибок: ${errorCount}`
      );
    } catch (error) {
      logger.error("Admin: Ошибка выполнения массовой отписки:", error);
      throw error;
    }
  }

  /**
   * Обработка команды настройки интервала /admin_set_interval
   */
  private async handleAdminSetIntervalCommand(
    msg: TelegramBot.Message
  ): Promise<void> {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    try {
      // Проверяем формат команды
      const match = text.match(/\/admin_set_interval\s+(\d+)/);

      if (!match) {
        const currentInterval = this.subscriptionManager.getUpdateInterval();

        const helpMessage = `
⚙️ *Настройка интервала обновления*

📋 **Текущий интервал:** ${currentInterval} час${
          currentInterval === 1 ? "" : currentInterval < 5 ? "а" : "ов"
        }

📝 **Формат команды:**
\`/admin_set_interval [часы]\`

**Примеры:**
• \`/admin_set_interval 3\` - каждые 3 часа
• \`/admin_set_interval 12\` - каждые 12 часов
• \`/admin_set_interval 1\` - каждый час

⚠️ **Ограничения:** от 1 до 24 часов
📢 **Внимание:** Все пользователи получат уведомление об изменении
`;

        await this.bot.sendMessage(chatId, helpMessage, {
          parse_mode: "Markdown",
        });
        return;
      }

      const newInterval = parseInt(match[1]!, 10);
      const currentInterval = this.subscriptionManager.getUpdateInterval();

      // Проверяем диапазон
      if (newInterval < 1 || newInterval > 24) {
        await this.bot.sendMessage(
          chatId,
          "❌ Интервал должен быть от 1 до 24 часов",
          { parse_mode: "Markdown" }
        );
        return;
      }

      // Если интервал не изменился
      if (newInterval === currentInterval) {
        await this.bot.sendMessage(
          chatId,
          `ℹ️ Интервал уже установлен на ${newInterval} час${
            newInterval === 1 ? "" : newInterval < 5 ? "а" : "ов"
          }`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      // Устанавливаем новый интервал
      this.subscriptionManager.setUpdateInterval(newInterval);

      // Перезапускаем таймер с новым интервалом
      this.restartNotificationChecker();

      // Уведомляем администратора об успехе
      const adminMessage = `
✅ *Интервал обновления изменен!*

🕐 **Старый интервал:** ${currentInterval} час${
        currentInterval === 1 ? "" : currentInterval < 5 ? "а" : "ов"
      }
🕐 **Новый интервал:** ${newInterval} час${
        newInterval === 1 ? "" : newInterval < 5 ? "а" : "ов"
      }

📢 Все подписчики получат уведомление об изменении
⏰ Следующая проверка: через ${newInterval} час${
        newInterval === 1 ? "" : newInterval < 5 ? "а" : "ов"
      }
`;

      await this.bot.sendMessage(chatId, adminMessage, {
        parse_mode: "Markdown",
      });

      // Отправляем уведомление всем подписчикам
      await this.notifyUsersAboutIntervalChange(newInterval, currentInterval);
    } catch (error) {
      logger.error("Admin: Ошибка установки интервала:", error);
      await this.bot.sendMessage(
        chatId,
        `❌ Ошибка установки интервала: ${(error as Error).message}`,
        { parse_mode: "Markdown" }
      );
    }
  }

  /**
   * Уведомление всех пользователей об изменении интервала
   */
  private async notifyUsersAboutIntervalChange(
    newInterval: number,
    oldInterval: number
  ): Promise<void> {
    try {
      const subscribers = this.subscriptionManager.getSubscribers();

      if (subscribers.length === 0) {
        logger.info(
          "Admin: Нет подписчиков для уведомления об изменении интервала"
        );
        return;
      }

      const userMessage = `
🔄 *Обновление настроек уведомлений*

⏰ **Интервал проверки изменен:**
• Было: каждые ${oldInterval} час${
        oldInterval === 1 ? "" : oldInterval < 5 ? "а" : "ов"
      }
• Стало: каждые ${newInterval} час${
        newInterval === 1 ? "" : newInterval < 5 ? "а" : "ов"
      }

📱 Теперь вы будете получать уведомления о новых отключениях каждые ${newInterval} час${
        newInterval === 1 ? "" : newInterval < 5 ? "а" : "ов"
      }.

🔕 Для отключения уведомлений используйте /unsubscribe
`;

      let successCount = 0;
      let errorCount = 0;

      for (const subscriber of subscribers) {
        try {
          await this.bot.sendMessage(subscriber.chatId, userMessage, {
            parse_mode: "Markdown",
          });
          successCount++;
        } catch (error) {
          errorCount++;
          logger.warn(
            `Admin: Не удалось отправить уведомление об изменении интервала пользователю ${subscriber.chatId}:`,
            error
          );
        }
      }

      logger.info(
        `Admin: Уведомления об изменении интервала отправлены. Успешно: ${successCount}, ошибок: ${errorCount}`
      );

      // Уведомляем админов о результатах
      const adminNotification = `
📢 *Уведомления об изменении интервала отправлены*

📊 **Статистика:**
• Всего подписчиков: ${subscribers.length}
• Успешно отправлено: ${successCount}
• Ошибки: ${errorCount}
• Эффективность: ${Math.round((successCount / subscribers.length) * 100)}%
`;

      await this.notifyAdmins(adminNotification);
    } catch (error) {
      logger.error(
        "Admin: Ошибка уведомления пользователей об изменении интервала:",
        error
      );
    }
  }

  /**
   * Перезапуск системы проверки уведомлений с новым интервалом
   */
  private restartNotificationChecker(): void {
    try {
      // Останавливаем текущий таймер
      this.stopNotificationChecker();

      // Запускаем с новым интервалом
      this.startNotificationChecker();

      logger.info(
        "Admin: Система проверки уведомлений перезапущена с новым интервалом"
      );
    } catch (error) {
      logger.error("Admin: Ошибка перезапуска системы проверки:", error);
    }
  }

  /**
   * Инициализация системы подписок
   */
  private async initializeSubscriptions(): Promise<void> {
    try {
      await this.subscriptionManager.initialize();
      this.startNotificationChecker();
      logger.info("Telegram: Система подписок инициализирована");
    } catch (error) {
      logger.error("Telegram: Ошибка инициализации подписок:", error);
    }
  }

  /**
   * Запуск фонового процесса проверки новых отключений
   */
  private startNotificationChecker(): void {
    // Получаем настраиваемый интервал из базы данных
    const intervalHours = this.subscriptionManager.getUpdateInterval();
    const INTERVAL_MS = intervalHours * 60 * 60 * 1000;

    this.notificationInterval = setInterval(async () => {
      await this.checkForNewOutagesAndNotify();
    }, INTERVAL_MS);

    logger.info(
      `Telegram: Запущен фоновый процесс проверки отключений (каждые ${intervalHours} час${
        intervalHours === 1 ? "" : intervalHours < 5 ? "а" : "ов"
      })`
    );
  }

  /**
   * Остановка фонового процесса уведомлений
   */
  private stopNotificationChecker(): void {
    if (this.notificationInterval) {
      clearInterval(this.notificationInterval);
      this.notificationInterval = undefined;
      logger.info("Telegram: Остановлен фоновый процесс проверки отключений");
    }
  }

  /**
   * Проверка новых отключений и отправка уведомлений
   */
  private async checkForNewOutagesAndNotify(): Promise<void> {
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
        logger.info(
          `Telegram: Найдены новые отключения (${newOutages.length}), отправляем уведомления`
        );

        // Сохраняем отчет для команды /get
        try {
          const reportPath = await saveReport(
            newOutages,
            `subscription-report-${Date.now()}`
          );
          logger.info(`Telegram: Сохранен отчет по подписке: ${reportPath}`);
        } catch (error) {
          logger.error(
            "Telegram: Ошибка при сохранении отчета по подписке:",
            error
          );
        }

        // Отправляем уведомления всем подписчикам
        for (const subscriber of subscribers) {
          await this.sendNotificationToSubscriber(
            subscriber.chatId,
            newOutages
          );
        }
      } else {
        logger.info("Telegram: Новых отключений не найдено");
      }
    } catch (error) {
      logger.error("Telegram: Ошибка при проверке новых отключений:", error);
    }
  }

  /**
   * Отправка уведомления подписчику
   */
  private async sendNotificationToSubscriber(
    chatId: number,
    outages: PowerOutageInfo[]
  ): Promise<void> {
    try {
      // Основное сообщение с уведомлением
      const notificationMessage = `
🔔 *Уведомление о новых отключениях*

📍 Место: ${MY_PLACE}
📊 Найдено: ${outages.length} ${
        outages.length === 1 ? "отключение" : "отключений"
      }
📅 Проверено: ${formatDateForDisplay(new Date())}

Отчет сохранен. Используйте команду /get для получения полного отчета.
`;

      await this.bot.sendMessage(chatId, notificationMessage, {
        parse_mode: "Markdown",
      });

      // Отправляем краткую сводку по отключениям (как в командах search)
      if (outages.length > 0) {
        const summary = this.createOutagesSummary(outages, true);
        await this.bot.sendMessage(chatId, summary, {
          parse_mode: "Markdown",
        });
      }

      await this.subscriptionManager.updateLastNotified(chatId);
      logger.info(
        `Telegram: Отправлено уведомление подписчику ${chatId} с полной информацией об отключениях`
      );
    } catch (error) {
      logger.error(
        `Telegram: Ошибка отправки уведомления подписчику ${chatId}:`,
        error
      );
    }
  }

  /**
   * Отправка уведомления всем администраторам
   */
  private async notifyAdmins(message: string): Promise<void> {
    for (const adminChatId of ADMIN_CHAT_IDS) {
      try {
        await this.bot.sendMessage(adminChatId, message, {
          parse_mode: "Markdown",
        });
      } catch (error) {
        logger.error(
          `Telegram: Ошибка отправки уведомления админу ${adminChatId}:`,
          error
        );
      }
    }
  }

  /**
   * Обработка команды /subscribe
   */
  private async handleSubscribeCommand(
    msg: TelegramBot.Message
  ): Promise<void> {
    const chatId = msg.chat.id;
    const username = msg.from?.username;
    const firstName = msg.from?.first_name;

    try {
      logger.info(
        `Telegram: Попытка подписки от пользователя ${chatId} (@${
          username || "unknown"
        })`
      );

      const success = await this.subscriptionManager.subscribe(
        chatId,
        username,
        firstName
      );

      if (success) {
        // Получаем настраиваемый интервал из базы данных
        const intervalHours = this.subscriptionManager.getUpdateInterval();

        const message = `
✅ *Подписка активирована!*

🔔 Вы будете получать уведомления о новых отключениях в районе ${MY_PLACE}.

⏰ Проверка происходит каждые ${intervalHours} час${
          intervalHours === 1 ? "" : intervalHours < 5 ? "а" : "ов"
        }.
📲 Уведомления приходят только при появлении новых результатов.

Для отключения используйте команду /unsubscribe
`;

        await this.bot.sendMessage(chatId, message, {
          parse_mode: "Markdown",
        });

        // Уведомляем администраторов о новом подписчике
        const adminNotification = `
🆕 *Новый подписчик!*

👤 Пользователь: ${firstName || "Неизвестно"} ${
          username ? `(@${username})` : ""
        }
🆔 Chat ID: \`${chatId}\`
⏰ Время подписки: ${new Date().toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow",
        })}

📊 Всего активных подписчиков: ${
          this.subscriptionManager.getSubscribers().length
        }
`;

        await this.notifyAdmins(adminNotification);
      } else {
        await this.bot.sendMessage(
          chatId,
          "ℹ️ Вы уже подписаны на уведомления о новых отключениях.",
          { parse_mode: "Markdown" }
        );
      }
    } catch (error) {
      logger.error("Telegram: Ошибка при оформлении подписки:", error);

      await this.bot.sendMessage(
        chatId,
        `❌ Произошла ошибка при оформлении подписки:\n\`${
          (error as Error).message
        }\``,
        { parse_mode: "Markdown" }
      );
    }
  }

  /**
   * Обработка команды /unsubscribe
   */
  private async handleUnsubscribeCommand(
    msg: TelegramBot.Message
  ): Promise<void> {
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
      } else {
        await this.bot.sendMessage(
          chatId,
          "ℹ️ Вы не были подписаны на уведомления.",
          { parse_mode: "Markdown" }
        );
      }
    } catch (error) {
      logger.error("Telegram: Ошибка при отписке:", error);

      await this.bot.sendMessage(
        chatId,
        `❌ Произошла ошибка при отписке:\n\`${(error as Error).message}\``,
        { parse_mode: "Markdown" }
      );
    }
  }

  /**
   * Обработка команды /get
   */
  private async handleGetCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    try {
      logger.info(
        `Telegram: Запрос последнего отчета от пользователя ${
          msg.from?.username || msg.from?.id
        }`
      );

      // Получаем информацию о последнем отчете
      const reportInfo = await getLatestReportInfo();

      if (!reportInfo) {
        await this.bot.sendMessage(
          chatId,
          "📄 Отчеты не найдены.\n\nИспользуйте команду /search или /search\\_new для создания нового отчета.",
          { parse_mode: "Markdown" }
        );
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
    } catch (error) {
      logger.error("Telegram: Ошибка при получении отчета:", error);

      await this.bot.sendMessage(
        chatId,
        `❌ Произошла ошибка при получении отчета:\n\`${
          (error as Error).message
        }\``,
        { parse_mode: "Markdown" }
      );
    }
  }

  /**
   * Обработка команд поиска
   */
  private async handleSearchCommand(
    msg: TelegramBot.Message,
    onlyNew: boolean
  ): Promise<void> {
    const chatId = msg.chat.id;
    const commandName = onlyNew ? "/search_new" : "/search";

    // Записываем взаимодействие для аналитики
    this.recordUserInteraction(
      chatId,
      commandName,
      msg.from?.username,
      msg.from?.first_name
    );

    try {
      // Отправляем сообщение о начале поиска
      const processingMsg = await this.bot.sendMessage(
        chatId,
        `🔍 Выполняю поиск отключений для ${MY_PLACE}...`
      );

      logger.info(
        `Telegram: Начат поиск ${commandName} от пользователя ${
          msg.from?.username || msg.from?.id
        }`
      );

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
      } else {
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
        const reportPath = await saveReport(
          filteredOutages,
          `telegram-report-${onlyNew ? "new-" : ""}${Date.now()}`
        );

        // Отправляем файл отчета
        await this.bot.sendDocument(chatId, reportPath, {
          caption: `📄 Отчет об отключениях (${filteredOutages.length} записей)`,
        });

        // Отправляем краткую информацию о найденных отключениях
        const summary = this.createOutagesSummary(filteredOutages, onlyNew);
        await this.bot.sendMessage(chatId, summary, {
          parse_mode: "Markdown",
        });
      } else {
        await this.bot.sendMessage(
          chatId,
          `✅ ${onlyNew ? "Актуальных отключений" : "Отключений"} не найдено!`
        );
      }

      logger.info(
        `Telegram: Поиск ${commandName} завершен. Найдено: ${filteredOutages.length}/${outages.length}`
      );
    } catch (error) {
      logger.error(`Telegram: Ошибка при выполнении ${commandName}:`, error);

      await this.bot.sendMessage(
        chatId,
        `❌ Произошла ошибка при поиске отключений:\n\`${
          (error as Error).message
        }\``,
        { parse_mode: "Markdown" }
      );
    }
  }

  /**
   * Создание краткой сводки по отключениям
   */
  private createOutagesSummary(
    outages: PowerOutageInfo[],
    onlyNew: boolean
  ): string {
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
   * Админская команда: поиск отключений в БД
   */
  private async handleAdminSearchCommand(
    msg: TelegramBot.Message
  ): Promise<void> {
    const chatId = msg.chat.id;
    const messageText = msg.text;

    try {
      logger.info(`Admin: Запрос поиска отключений от админа ${msg.from?.id}`);

      // Парсим параметры поиска из сообщения
      const params = messageText?.split(" ").slice(1) || [];

      if (params.length === 0) {
        const helpMessage = `
🔍 *Поиск отключений в БД*

Использование:
\`/admin_search [параметры]\`

**Примеры:**
• \`/admin_search Приозерский\` - по району
• \`/admin_search место:Приозерск\` - по месту  
• \`/admin_search дата:15.01.2025\` - по дате
• \`/admin_search район:Приозерский место:Кузнечное\` - комбинированный поиск

**Параметры:**
• \`район:название\` - поиск по району
• \`место:название\` - поиск по месту
• \`дата:дд.мм.гггг\` - поиск по дате от
• \`лимит:число\` - максимум результатов (по умолчанию 10)
`;

        await this.bot.sendMessage(chatId, helpMessage, {
          parse_mode: "Markdown",
        });
        return;
      }

      // Парсим параметры
      const filters: any = { limit: 10 };

      for (const param of params) {
        if (param.includes(":")) {
          const [key, value] = param.split(":");
          switch (key?.toLowerCase()) {
            case "район":
            case "district":
              filters.district = value;
              break;
            case "место":
            case "place":
              filters.place = value;
              break;
            case "дата":
            case "date":
              filters.dateFrom = value;
              break;
            case "лимит":
            case "limit":
              filters.limit = parseInt(value || "10", 10);
              break;
          }
        } else {
          // Если нет двоеточия, считаем что это район
          filters.district = param;
        }
      }

      const db = new DatabaseManager();
      await db.initialize();

      const results = db.searchOutages(filters);
      db.close();

      if (results.length === 0) {
        await this.bot.sendMessage(
          chatId,
          "🔍 По вашему запросу ничего не найдено.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      let message = `🔍 *Результаты поиска* (найдено: ${results.length})\n\n`;

      results.forEach((result, index) => {
        const safePlace = escapeMarkdown(result.place || "Не указано");
        const safeDistrict = escapeMarkdown(result.district || "Не указан");
        const safeAddresses = escapeMarkdown(result.addresses || "Не указаны");
        const safeReportFile = escapeMarkdown(result.reportFile || "Нет");

        message += `${index + 1}\\. **${safePlace}** \\(${safeDistrict}\\)\n`;
        message += `   📍 Адреса: ${safeAddresses}\n`;
        message += `   📅 Период: ${result.dateFrom || "Не указан"} \\- ${
          result.dateTo || "Не указан"
        }\n`;
        message += `   📄 Отчет: ${safeReportFile}\n`;
        message += `   🕐 Добавлено: ${new Date(
          result.createdAt
        ).toLocaleDateString("ru-RU")}\n\n`;
      });

      await this.bot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      logger.error("Telegram: Ошибка при поиске отключений:", error);

      await this.bot.sendMessage(
        chatId,
        `❌ Произошла ошибка при поиске:\n\`${(error as Error).message}\``,
        { parse_mode: "Markdown" }
      );
    }
  }

  /**
   * Админская команда: аналитика отключений
   */
  private async handleAdminAnalyticsCommand(
    msg: TelegramBot.Message
  ): Promise<void> {
    const chatId = msg.chat.id;

    try {
      logger.info(`Admin: Запрос аналитики от админа ${msg.from?.id}`);

      const db = new DatabaseManager();
      await db.initialize();

      const stats = db.getOutagesStats();
      const userStats = db.getUserStats();

      // Получаем последние 5 отключений для примера
      const recentOutages = db.searchOutages({ limit: 5 });

      // Получаем топ районов
      const topDistricts = db.searchOutages({ limit: 100 });
      const districtCounts = topDistricts.reduce((acc, outage) => {
        const district = outage.district || "Не указан";
        acc[district] = (acc[district] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const sortedDistricts = Object.entries(districtCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

      db.close();

      let message = `📈 *Аналитика системы*\n\n`;

      message += `📊 **Статистика отключений:**\n`;
      message += `• Всего отключений: ${stats.totalOutages}\n`;
      message += `• Уникальных районов: ${stats.uniqueDistricts}\n`;
      message += `• Уникальных мест: ${stats.uniquePlaces}\n`;
      message += `• Последняя дата: ${
        stats.lastOutageDate || "Нет данных"
      }\n\n`;

      message += `👥 **Статистика пользователей:**\n`;
      message += `• Всего пользователей: ${userStats.totalUsers}\n`;
      message += `• Активных за месяц: ${userStats.activeThisMonth}\n`;
      message += `• Активных за неделю: ${userStats.activeThisWeek}\n`;
      message += `• Активных сегодня: ${userStats.activeToday}\n`;
      message += `• Новых за месяц: ${userStats.newUsersThisMonth}\n`;
      message += `• Новых за неделю: ${userStats.newUsersThisWeek}\n`;
      message += `• Новых сегодня: ${userStats.newUsersToday}\n\n`;

      if (sortedDistricts.length > 0) {
        message += `🏆 **Топ районов по количеству отключений:**\n`;
        sortedDistricts.forEach(([district, count], index) => {
          const safeDistrict = escapeMarkdown(district);
          message += `${index + 1}\\. ${safeDistrict}: ${count} отключений\n`;
        });
        message += `\n`;
      }

      if (userStats.topCommands.length > 0) {
        message += `📋 **Популярные команды (за месяц):**\n`;
        userStats.topCommands
          .slice(0, 5)
          .forEach(({ command, count }, index) => {
            const safeCommand = escapeMarkdown(command);
            message += `${
              index + 1
            }\\. ${safeCommand}: ${count} использований\n`;
          });
        message += `\n`;
      }

      if (recentOutages.length > 0) {
        message += `🕐 **Последние отключения:**\n`;
        recentOutages.slice(0, 3).forEach((outage, index) => {
          const safePlace = escapeMarkdown(outage.place || "Не указано");
          const safeDistrict = escapeMarkdown(outage.district || "Не указан");
          message += `${index + 1}\\. ${safePlace} \\(${safeDistrict}\\)\n`;
          message += `   📅 ${outage.dateFrom || "Не указана"}\n`;
        });
      }

      await this.bot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      logger.error("Telegram: Ошибка при получении аналитики:", error);

      await this.bot.sendMessage(
        chatId,
        `❌ Произошла ошибка при получении аналитики:\n\`${
          (error as Error).message
        }\``,
        { parse_mode: "Markdown" }
      );
    }
  }

  /**
   * Запись взаимодействия пользователя для аналитики
   */
  private recordUserInteraction(
    chatId: number,
    command: string,
    username?: string,
    firstName?: string
  ): void {
    try {
      const db = new DatabaseManager();
      db.recordUserInteraction(chatId, command, username, firstName);
      db.close();
    } catch (error) {
      // Не логируем ошибки аналитики, чтобы не засорять логи
      // logger.error("Bot: Ошибка записи аналитики:", error);
    }
  }

  /**
   * Проверка и уведомление об обновлении версии при старте
   */
  private async checkAndNotifyVersionUpdate(): Promise<void> {
    try {
      const currentVersion = this.getAppVersion();
      const lastVersion = this.subscriptionManager.getLastNotifiedVersion();

      // Если версия изменилась или это первый запуск
      if (lastVersion !== currentVersion && currentVersion !== "неизвестная") {
        logger.info(
          `Bot: Обнаружена новая версия ${currentVersion} (предыдущая: ${
            lastVersion || "неизвестна"
          })`
        );

        const subscribers = this.subscriptionManager.getSubscribers();

        if (subscribers.length > 0) {
          // Небольшая задержка перед отправкой уведомлений (даем боту полностью запуститься)
          setTimeout(async () => {
            await this.sendAutoUpdateNotification(currentVersion);
          }, 5000);
        }

        // Сохраняем текущую версию как уведомленную
        this.subscriptionManager.setLastNotifiedVersion(currentVersion);
      }
    } catch (error) {
      logger.error("Bot: Ошибка при проверке версии:", error);
    }
  }

  /**
   * Автоматическая отправка уведомления об обновлении всем подписчикам
   */
  private async sendAutoUpdateNotification(version: string): Promise<void> {
    try {
      const subscribers = this.subscriptionManager.getSubscribers();

      logger.info(
        `Bot: Отправка автоматических уведомлений об обновлении до версии ${version} - ${subscribers.length} подписчикам`
      );

      let successCount = 0;
      let errorCount = 0;

      const updateMessage = `
🚀 *Бот обновлен!*

📦 **Новая версия:** ${version}
✨ **Улучшения:**
• Повышена стабильность работы
• Улучшена производительность  
• Исправлены найденные ошибки

🔄 Все функции работают в обычном режиме.
Используйте /help для просмотра доступных команд.
`;

      // Рассылаем с задержками для соблюдения лимитов Telegram
      for (const subscriber of subscribers) {
        if (!subscriber) {
          continue;
        }

        try {
          await this.bot.sendMessage(subscriber.chatId, updateMessage, {
            parse_mode: "Markdown",
          });

          successCount++;

          // Обновляем время последнего уведомления
          await this.subscriptionManager.updateLastNotified(subscriber.chatId);
        } catch (error) {
          errorCount++;
          logger.warn(
            `Bot: Не удалось отправить уведомление об обновлении пользователю ${subscriber.chatId}:`,
            error
          );
        }

        // Задержка между сообщениями (30 сообщений в секунду - лимит Telegram)
        await new Promise((resolve) => setTimeout(resolve, 35));
      }

      logger.info(
        `Bot: Автоматические уведомления об обновлении до версии ${version} отправлены. Успешно: ${successCount}/${subscribers.length}`
      );

      // Уведомляем администраторов о результатах
      if (ADMIN_CHAT_IDS.length > 0) {
        const adminMessage = `
🚀 **Автоматические уведомления об обновлении отправлены**

📦 **Версия:** ${version}
📊 **Статистика:**
• Всего получателей: ${subscribers.length}
• Успешно доставлено: ${successCount}
• Ошибок доставки: ${errorCount}
• Успешность: ${Math.round((successCount / subscribers.length) * 100)}%
`;

        for (const adminId of ADMIN_CHAT_IDS) {
          try {
            await this.bot.sendMessage(adminId, adminMessage, {
              parse_mode: "Markdown",
            });
          } catch (error) {
            logger.warn(
              `Bot: Не удалось отправить отчет администратору ${adminId}:`,
              error
            );
          }
        }
      }
    } catch (error) {
      logger.error(
        "Bot: Ошибка при автоматической отправке уведомлений об обновлении:",
        error
      );
    }
  }

  /**
   * Форматирование размера файла
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Запуск бота
   */
  public start(): void {
    if (this.isPolling) {
      console.log("⚠️ Бот уже запущен");
      return;
    }

    this.bot.startPolling();
    this.isPolling = true;
    console.log("🤖 Telegram бот запущен");
    logger.info("Telegram бот успешно запущен");

    // Проверяем версию и отправляем уведомления при необходимости
    this.checkAndNotifyVersionUpdate();
  }

  /**
   * Остановка бота
   */
  public stop(): void {
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
  public isRunning(): boolean {
    return this.isPolling;
  }
}
