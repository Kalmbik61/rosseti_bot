/**
 * Управление подписками на уведомления о новых отключениях с SQLite
 */
import type { PowerOutageInfo } from "./types.js";
export interface Subscriber {
    chatId: number;
    username?: string | undefined;
    firstName?: string | undefined;
    subscribedAt: Date;
    lastNotified?: Date | undefined;
}
export declare class SubscriptionManager {
    private db;
    constructor();
    /**
     * Инициализация менеджера подписок
     */
    initialize(): Promise<void>;
    /**
     * Добавление подписчика
     */
    subscribe(chatId: number, username?: string, firstName?: string): Promise<boolean>;
    /**
     * Удаление подписчика
     */
    unsubscribe(chatId: number): Promise<boolean>;
    /**
     * Получение списка всех подписчиков
     */
    getSubscribers(): Subscriber[];
    /**
     * Проверка подписки пользователя
     */
    isSubscribed(chatId: number): boolean;
    /**
     * Обновление времени последней проверки и результатов
     */
    updateLastCheck(results: PowerOutageInfo[]): Promise<void>;
    /**
     * Получение информации о последней проверке
     */
    getLastCheckInfo(): {
        lastCheck?: Date | undefined;
        lastResults: PowerOutageInfo[];
    };
    /**
     * Проверка наличия новых результатов
     */
    hasNewResults(currentResults: PowerOutageInfo[]): boolean;
    /**
     * Обновление времени последнего уведомления для подписчика
     */
    updateLastNotified(chatId: number): Promise<void>;
    /**
     * Получение статистики подписок
     */
    getStats(): {
        totalSubscribers: number;
        activeSubscribers: number;
        lastCheck?: Date | undefined;
        lastResultsCount: number;
    };
    /**
     * Закрытие соединения с БД
     */
    close(): void;
    /**
     * Оптимизация БД
     */
    vacuum(): void;
}
//# sourceMappingURL=subscriptions.d.ts.map