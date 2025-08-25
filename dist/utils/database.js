/**
 * Менеджер базы данных SQLite для подписок
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { logger } from "./logger.js";
export class DatabaseManager {
    db;
    dbPath;
    constructor() {
        // Создаем путь к БД в папке data
        this.dbPath = path.join(process.cwd(), "data", "subscriptions.db");
        // Создаем папку data если её нет
        const dataDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        // Инициализируем БД
        this.db = new Database(this.dbPath);
        // Включаем WAL режим для лучшей производительности
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("foreign_keys = ON");
        logger.info(`Database: Подключение к БД ${this.dbPath}`);
    }
    /**
     * Инициализация БД и создание таблиц
     */
    async initialize() {
        try {
            this.createTables();
            logger.info("Database: БД успешно инициализирована");
        }
        catch (error) {
            logger.error("Database: Ошибка инициализации БД:", error);
            throw error;
        }
    }
    /**
     * Создание таблиц
     */
    createTables() {
        // Таблица подписчиков
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER UNIQUE NOT NULL,
        username TEXT,
        first_name TEXT,
        subscribed_at TEXT NOT NULL,
        last_notified TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Индексы для быстрого поиска
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_subscribers_chat_id ON subscribers(chat_id);
      CREATE INDEX IF NOT EXISTS idx_subscribers_active ON subscribers(is_active);
    `);
        // Таблица настроек
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Таблица истории проверок
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS check_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        check_time TEXT NOT NULL,
        results_count INTEGER NOT NULL,
        results_hash TEXT NOT NULL,
        results_data TEXT, -- JSON данные результатов
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Индекс для быстрого поиска последних проверок
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_check_history_time ON check_history(check_time DESC);
    `);
        logger.info("Database: Таблицы созданы/проверены");
    }
    /**
     * Добавление подписчика
     */
    addSubscriber(chatId, username, firstName) {
        try {
            const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO subscribers (chat_id, username, first_name, subscribed_at)
        VALUES (?, ?, ?, ?)
      `);
            const result = stmt.run(chatId, username || null, firstName || null, new Date().toISOString());
            const success = result.changes > 0;
            if (success) {
                logger.info(`Database: Добавлен подписчик ${chatId} (@${username || "unknown"})`);
            }
            else {
                logger.info(`Database: Подписчик ${chatId} уже существует`);
            }
            return success;
        }
        catch (error) {
            logger.error("Database: Ошибка добавления подписчика:", error);
            throw error;
        }
    }
    /**
     * Удаление подписчика (мягкое удаление)
     */
    removeSubscriber(chatId) {
        try {
            const stmt = this.db.prepare(`
        UPDATE subscribers 
        SET is_active = 0, updated_at = ? 
        WHERE chat_id = ? AND is_active = 1
      `);
            const result = stmt.run(new Date().toISOString(), chatId);
            const success = result.changes > 0;
            if (success) {
                logger.info(`Database: Отключен подписчик ${chatId}`);
            }
            else {
                logger.info(`Database: Подписчик ${chatId} не найден или уже отключен`);
            }
            return success;
        }
        catch (error) {
            logger.error("Database: Ошибка удаления подписчика:", error);
            throw error;
        }
    }
    /**
     * Получение всех активных подписчиков
     */
    getActiveSubscribers() {
        try {
            const stmt = this.db.prepare(`
        SELECT id, chat_id as chatId, username, first_name as firstName, 
               subscribed_at as subscribedAt, last_notified as lastNotified, is_active as isActive
        FROM subscribers 
        WHERE is_active = 1 
        ORDER BY subscribed_at ASC
      `);
            return stmt.all();
        }
        catch (error) {
            logger.error("Database: Ошибка получения подписчиков:", error);
            throw error;
        }
    }
    /**
     * Проверка подписки пользователя
     */
    isSubscribed(chatId) {
        try {
            const stmt = this.db.prepare(`
        SELECT 1 FROM subscribers 
        WHERE chat_id = ? AND is_active = 1
      `);
            return stmt.get(chatId) !== undefined;
        }
        catch (error) {
            logger.error("Database: Ошибка проверки подписки:", error);
            throw error;
        }
    }
    /**
     * Обновление времени последнего уведомления
     */
    updateLastNotified(chatId) {
        try {
            const stmt = this.db.prepare(`
        UPDATE subscribers 
        SET last_notified = ?, updated_at = ?
        WHERE chat_id = ? AND is_active = 1
      `);
            const now = new Date().toISOString();
            stmt.run(now, now, chatId);
        }
        catch (error) {
            logger.error("Database: Ошибка обновления времени уведомления:", error);
            throw error;
        }
    }
    /**
     * Сохранение результатов проверки
     */
    saveCheckResults(results) {
        try {
            // Создаем хеш результатов для быстрого сравнения
            const resultsHash = this.hashResults(results);
            const resultsData = JSON.stringify(results);
            const stmt = this.db.prepare(`
        INSERT INTO check_history (check_time, results_count, results_hash, results_data)
        VALUES (?, ?, ?, ?)
      `);
            stmt.run(new Date().toISOString(), results.length, resultsHash, resultsData);
            // Очищаем старые записи (оставляем только последние 100)
            this.db.exec(`
        DELETE FROM check_history 
        WHERE id NOT IN (
          SELECT id FROM check_history 
          ORDER BY check_time DESC 
          LIMIT 100
        )
      `);
            logger.info(`Database: Сохранены результаты проверки (${results.length} записей)`);
        }
        catch (error) {
            logger.error("Database: Ошибка сохранения результатов:", error);
            throw error;
        }
    }
    /**
     * Получение последних результатов проверки
     */
    getLastCheckResults() {
        try {
            const stmt = this.db.prepare(`
        SELECT check_time, results_data
        FROM check_history 
        ORDER BY check_time DESC 
        LIMIT 1
      `);
            const record = stmt.get();
            if (!record) {
                return { results: [] };
            }
            return {
                checkTime: new Date(record.check_time),
                results: JSON.parse(record.results_data),
            };
        }
        catch (error) {
            logger.error("Database: Ошибка получения последних результатов:", error);
            return { results: [] };
        }
    }
    /**
     * Проверка на наличие новых результатов
     */
    hasNewResults(currentResults) {
        try {
            const currentHash = this.hashResults(currentResults);
            const stmt = this.db.prepare(`
        SELECT results_hash 
        FROM check_history 
        ORDER BY check_time DESC 
        LIMIT 1
      `);
            const record = stmt.get();
            if (!record) {
                return currentResults.length > 0; // Первая проверка
            }
            return record.results_hash !== currentHash;
        }
        catch (error) {
            logger.error("Database: Ошибка проверки новых результатов:", error);
            return true; // В случае ошибки считаем что есть изменения
        }
    }
    /**
     * Получение статистики
     */
    getStats() {
        try {
            // Общее количество подписчиков
            const totalStmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM subscribers
      `);
            const total = totalStmt.get().count;
            // Активные подписчики
            const activeStmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM subscribers WHERE is_active = 1
      `);
            const active = activeStmt.get().count;
            // Последняя проверка
            const lastCheckStmt = this.db.prepare(`
        SELECT check_time, results_count 
        FROM check_history 
        ORDER BY check_time DESC 
        LIMIT 1
      `);
            const lastCheck = lastCheckStmt.get();
            return {
                totalSubscribers: total,
                activeSubscribers: active,
                lastCheckTime: lastCheck ? new Date(lastCheck.check_time) : undefined,
                lastResultsCount: lastCheck?.results_count || 0,
            };
        }
        catch (error) {
            logger.error("Database: Ошибка получения статистики:", error);
            return {
                totalSubscribers: 0,
                activeSubscribers: 0,
                lastCheckTime: undefined,
                lastResultsCount: 0,
            };
        }
    }
    /**
     * Создание простого хеша результатов для сравнения
     */
    hashResults(results) {
        if (results.length === 0) {
            return "empty";
        }
        // Создаем строку из ключевых полей для хеширования
        const hashString = results
            .map((r) => `${r.place}|${r.dateFrom}|${r.dateTo}|${r.addresses}`)
            .sort()
            .join("||");
        // Простой hash функция
        let hash = 0;
        for (let i = 0; i < hashString.length; i++) {
            const char = hashString.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Конвертируем в 32-битное число
        }
        return hash.toString(36);
    }
    /**
     * Закрытие соединения с БД
     */
    close() {
        try {
            this.db.close();
            logger.info("Database: Соединение с БД закрыто");
        }
        catch (error) {
            logger.error("Database: Ошибка закрытия БД:", error);
        }
    }
    /**
     * Оптимизация БД
     */
    vacuum() {
        try {
            this.db.exec("VACUUM;");
            logger.info("Database: БД оптимизирована");
        }
        catch (error) {
            logger.error("Database: Ошибка оптимизации БД:", error);
        }
    }
}
//# sourceMappingURL=database.js.map