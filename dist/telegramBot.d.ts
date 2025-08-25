/**
 * Telegram бот для управления парсером отключений
 */
export declare class PowerOutageBot {
    private bot;
    private isPolling;
    private subscriptionManager;
    private notificationInterval?;
    private pendingBroadcast?;
    private pendingUnsubscribeAll?;
    constructor(token: string);
    /**
     * Настройка меню команд бота
     */
    private setupBotMenu;
    /**
     * Настройка команд бота
     */
    private setupCommands;
    /**
     * Проверка прав администратора
     */
    private isAdmin;
    /**
     * Отправка сообщения об отказе в доступе
     */
    private sendAccessDeniedMessage;
    /**
     * Админская команда: статистика
     */
    private handleAdminStatsCommand;
    /**
     * Админская команда: список подписчиков с интерактивными кнопками
     */
    private handleAdminSubscribersCommand;
    /**
     * Создание сообщения со списком подписчиков и кнопками
     */
    private createSubscribersMessageWithButtons;
    /**
     * Админская команда: массовая рассылка
     */
    private handleAdminBroadcastCommand;
    /**
     * Выполнение массовой рассылки
     */
    private performBroadcast;
    /**
     * Подтверждение массовой рассылки
     */
    private handleConfirmBroadcastCommand;
    /**
     * Выполнение массовой рассылки
     */
    private executeBroadcast;
    /**
     * Обработка inline отписки через callback
     */
    private handleInlineUnsubscribe;
    /**
     * Обновление сообщения со списком подписчиков
     */
    private updateSubscribersMessage;
    /**
     * Админская команда: отписка пользователя по Chat ID
     */
    private handleAdminUnsubscribeCommand;
    /**
     * Админская команда: массовая отписка всех пользователей
     */
    private handleAdminUnsubscribeAllCommand;
    /**
     * Подтверждение массовой отписки
     */
    private handleConfirmUnsubscribeAllCommand;
    /**
     * Выполнение массовой отписки
     */
    private executeUnsubscribeAll;
    /**
     * Инициализация системы подписок
     */
    private initializeSubscriptions;
    /**
     * Запуск фонового процесса проверки новых отключений
     */
    private startNotificationChecker;
    /**
     * Остановка фонового процесса уведомлений
     */
    private stopNotificationChecker;
    /**
     * Проверка новых отключений и отправка уведомлений
     */
    private checkForNewOutagesAndNotify;
    /**
     * Отправка уведомления подписчику
     */
    private sendNotificationToSubscriber;
    /**
     * Обработка команды /subscribe
     */
    private handleSubscribeCommand;
    /**
     * Обработка команды /unsubscribe
     */
    private handleUnsubscribeCommand;
    /**
     * Обработка команды /get
     */
    private handleGetCommand;
    /**
     * Обработка команд поиска
     */
    private handleSearchCommand;
    /**
     * Создание краткой сводки по отключениям
     */
    private createOutagesSummary;
    /**
     * Запуск бота
     */
    start(): void;
    /**
     * Остановка бота
     */
    stop(): void;
    /**
     * Проверка статуса бота
     */
    isRunning(): boolean;
}
//# sourceMappingURL=telegramBot.d.ts.map