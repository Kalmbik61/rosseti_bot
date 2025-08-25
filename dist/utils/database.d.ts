/**
 * Менеджер базы данных SQLite для подписок
 */
import type { PowerOutageInfo } from "./types.js";
export interface SubscriberRecord {
    id: number;
    chatId: number;
    username?: string;
    firstName?: string;
    subscribedAt: string;
    lastNotified?: string;
    isActive: boolean;
}
export interface SubscriptionSettings {
    key: string;
    value: string;
    updatedAt: string;
}
export interface LastCheckRecord {
    id: number;
    checkTime: string;
    resultsCount: number;
    resultsHash: string;
}
export declare class DatabaseManager {
    private db;
    private dbPath;
    constructor();
    /**
     * Инициализация БД и создание таблиц
     */
    initialize(): Promise<void>;
    /**
     * Создание таблиц
     */
    private createTables;
    /**
     * Добавление подписчика
     */
    addSubscriber(chatId: number, username?: string, firstName?: string): boolean;
    /**
     * Удаление подписчика (мягкое удаление)
     */
    removeSubscriber(chatId: number): boolean;
    /**
     * Получение всех активных подписчиков
     */
    getActiveSubscribers(): SubscriberRecord[];
    /**
     * Проверка подписки пользователя
     */
    isSubscribed(chatId: number): boolean;
    /**
     * Обновление времени последнего уведомления
     */
    updateLastNotified(chatId: number): void;
    /**
     * Сохранение результатов проверки
     */
    saveCheckResults(results: PowerOutageInfo[]): void;
    /**
     * Получение последних результатов проверки
     */
    getLastCheckResults(): {
        checkTime?: Date;
        results: PowerOutageInfo[];
    };
    /**
     * Проверка на наличие новых результатов
     */
    hasNewResults(currentResults: PowerOutageInfo[]): boolean;
    /**
     * Получение статистики
     */
    getStats(): {
        totalSubscribers: number;
        activeSubscribers: number;
        lastCheckTime?: Date | undefined;
        lastResultsCount: number;
    };
    /**
     * Создание простого хеша результатов для сравнения
     */
    private hashResults;
    /**
     * Закрытие соединения с БД
     */
    close(): void;
    /**
     * Оптимизация БД
     */
    vacuum(): void;
}
//# sourceMappingURL=database.d.ts.map