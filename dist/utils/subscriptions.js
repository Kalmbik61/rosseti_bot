/**
 * Управление подписками на уведомления о новых отключениях с SQLite
 */
import { DatabaseManager } from "./database.js";
import { logger } from "./logger.js";
export class SubscriptionManager {
    db;
    constructor() {
        this.db = new DatabaseManager();
    }
    /**
     * Инициализация менеджера подписок
     */
    async initialize() {
        try {
            await this.db.initialize();
            logger.info("SubscriptionManager: Инициализация завершена");
        }
        catch (error) {
            logger.error("SubscriptionManager: Ошибка инициализации:", error);
            throw error;
        }
    }
    /**
     * Добавление подписчика
     */
    async subscribe(chatId, username, firstName) {
        try {
            return this.db.addSubscriber(chatId, username, firstName);
        }
        catch (error) {
            logger.error("SubscriptionManager: Ошибка добавления подписчика:", error);
            throw error;
        }
    }
    /**
     * Удаление подписчика
     */
    async unsubscribe(chatId) {
        try {
            return this.db.removeSubscriber(chatId);
        }
        catch (error) {
            logger.error("SubscriptionManager: Ошибка удаления подписчика:", error);
            throw error;
        }
    }
    /**
     * Получение списка всех подписчиков
     */
    getSubscribers() {
        try {
            const records = this.db.getActiveSubscribers();
            return records.map((record) => ({
                chatId: record.chatId,
                username: record.username,
                firstName: record.firstName,
                subscribedAt: new Date(record.subscribedAt),
                lastNotified: record.lastNotified
                    ? new Date(record.lastNotified)
                    : undefined,
            }));
        }
        catch (error) {
            logger.error("SubscriptionManager: Ошибка получения подписчиков:", error);
            return [];
        }
    }
    /**
     * Проверка подписки пользователя
     */
    isSubscribed(chatId) {
        try {
            return this.db.isSubscribed(chatId);
        }
        catch (error) {
            logger.error("SubscriptionManager: Ошибка проверки подписки:", error);
            return false;
        }
    }
    /**
     * Обновление времени последней проверки и результатов
     */
    async updateLastCheck(results) {
        try {
            this.db.saveCheckResults(results);
        }
        catch (error) {
            logger.error("SubscriptionManager: Ошибка обновления последней проверки:", error);
            throw error;
        }
    }
    /**
     * Получение информации о последней проверке
     */
    getLastCheckInfo() {
        try {
            const result = this.db.getLastCheckResults();
            return {
                lastCheck: result.checkTime,
                lastResults: result.results,
            };
        }
        catch (error) {
            logger.error("SubscriptionManager: Ошибка получения последней проверки:", error);
            return { lastResults: [] };
        }
    }
    /**
     * Проверка наличия новых результатов
     */
    hasNewResults(currentResults) {
        try {
            return this.db.hasNewResults(currentResults);
        }
        catch (error) {
            logger.error("SubscriptionManager: Ошибка проверки новых результатов:", error);
            return true; // В случае ошибки считаем что есть изменения
        }
    }
    /**
     * Обновление времени последнего уведомления для подписчика
     */
    async updateLastNotified(chatId) {
        try {
            this.db.updateLastNotified(chatId);
        }
        catch (error) {
            logger.error("SubscriptionManager: Ошибка обновления времени уведомления:", error);
        }
    }
    /**
     * Получение статистики подписок
     */
    getStats() {
        try {
            return this.db.getStats();
        }
        catch (error) {
            logger.error("SubscriptionManager: Ошибка получения статистики:", error);
            return {
                totalSubscribers: 0,
                activeSubscribers: 0,
                lastCheck: undefined,
                lastResultsCount: 0,
            };
        }
    }
    /**
     * Закрытие соединения с БД
     */
    close() {
        try {
            this.db.close();
        }
        catch (error) {
            logger.error("SubscriptionManager: Ошибка закрытия БД:", error);
        }
    }
    /**
     * Оптимизация БД
     */
    vacuum() {
        try {
            this.db.vacuum();
        }
        catch (error) {
            logger.error("SubscriptionManager: Ошибка оптимизации БД:", error);
        }
    }
}
//# sourceMappingURL=subscriptions.js.map