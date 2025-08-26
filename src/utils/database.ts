/**
 * Менеджер базы данных SQLite для подписок
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { logger } from "./logger.js";
import type { PowerOutageInfo } from "./types.js";

export interface SubscriberRecord {
  id: number;
  chatId: number;
  username?: string;
  firstName?: string;
  subscribedAt: string; // ISO строка
  lastNotified?: string; // ISO строка
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
  resultsHash: string; // MD5 хеш результатов для быстрого сравнения
}

export interface PowerOutageRecord {
  id: number;
  district?: string;
  place?: string;
  addresses?: string;
  dateFrom?: string;
  dateTo?: string;
  energy?: string;
  reportFile?: string;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}

export class DatabaseManager {
  private db: Database.Database;
  private dbPath: string;

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
  async initialize(): Promise<void> {
    try {
      this.createTables();
      logger.info("Database: БД успешно инициализирована");
    } catch (error) {
      logger.error("Database: Ошибка инициализации БД:", error);
      throw error;
    }
  }

  /**
   * Создание таблиц
   */
  private createTables(): void {
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

    // Таблица отключений электроэнергии
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS power_outages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        district TEXT,
        place TEXT,
        addresses TEXT,
        date_from TEXT,
        date_to TEXT,
        energy TEXT,
        report_file TEXT, -- имя файла отчета
        content_hash TEXT, -- хеш для дедупликации
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Индексы для таблицы отключений
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_outages_district ON power_outages(district);
      CREATE INDEX IF NOT EXISTS idx_outages_place ON power_outages(place);
      CREATE INDEX IF NOT EXISTS idx_outages_date_from ON power_outages(date_from);
      CREATE INDEX IF NOT EXISTS idx_outages_created_at ON power_outages(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_outages_hash ON power_outages(content_hash);
    `);

    logger.info("Database: Таблицы созданы/проверены");
  }

  /**
   * Добавление подписчика
   */
  addSubscriber(
    chatId: number,
    username?: string,
    firstName?: string
  ): boolean {
    try {
      // Сначала проверяем, существует ли уже запись
      const checkStmt = this.db.prepare(`
        SELECT is_active FROM subscribers WHERE chat_id = ?
      `);
      const existingRecord = checkStmt.get(chatId) as
        | { is_active: number }
        | undefined;

      if (existingRecord) {
        if (existingRecord.is_active === 1) {
          // Пользователь уже активен
          logger.info(`Database: Подписчик ${chatId} уже активен`);
          return false;
        } else {
          // Пользователь отписан - реактивируем его
          const updateStmt = this.db.prepare(`
            UPDATE subscribers 
            SET is_active = 1, 
                username = ?, 
                first_name = ?, 
                subscribed_at = ?,
                updated_at = ?
            WHERE chat_id = ?
          `);

          const result = updateStmt.run(
            username || null,
            firstName || null,
            new Date().toISOString(),
            new Date().toISOString(),
            chatId
          );

          const success = result.changes > 0;
          if (success) {
            logger.info(
              `Database: Реактивирован подписчик ${chatId} (@${
                username || "unknown"
              })`
            );
          }
          return success;
        }
      } else {
        // Новый пользователь - создаем запись
        const insertStmt = this.db.prepare(`
          INSERT INTO subscribers (chat_id, username, first_name, subscribed_at)
          VALUES (?, ?, ?, ?)
        `);

        const result = insertStmt.run(
          chatId,
          username || null,
          firstName || null,
          new Date().toISOString()
        );

        const success = result.changes > 0;
        if (success) {
          logger.info(
            `Database: Добавлен новый подписчик ${chatId} (@${
              username || "unknown"
            })`
          );
        }
        return success;
      }
    } catch (error) {
      logger.error("Database: Ошибка добавления подписчика:", error);
      throw error;
    }
  }

  /**
   * Удаление подписчика (мягкое удаление)
   */
  removeSubscriber(chatId: number): boolean {
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
      } else {
        logger.info(`Database: Подписчик ${chatId} не найден или уже отключен`);
      }

      return success;
    } catch (error) {
      logger.error("Database: Ошибка удаления подписчика:", error);
      throw error;
    }
  }

  /**
   * Получение всех активных подписчиков
   */
  getActiveSubscribers(): SubscriberRecord[] {
    try {
      const stmt = this.db.prepare(`
        SELECT id, chat_id as chatId, username, first_name as firstName, 
               subscribed_at as subscribedAt, last_notified as lastNotified, is_active as isActive
        FROM subscribers 
        WHERE is_active = 1 
        ORDER BY subscribed_at ASC
      `);

      return stmt.all() as SubscriberRecord[];
    } catch (error) {
      logger.error("Database: Ошибка получения подписчиков:", error);
      throw error;
    }
  }

  /**
   * Проверка подписки пользователя
   */
  isSubscribed(chatId: number): boolean {
    try {
      const stmt = this.db.prepare(`
        SELECT 1 FROM subscribers 
        WHERE chat_id = ? AND is_active = 1
      `);

      return stmt.get(chatId) !== undefined;
    } catch (error) {
      logger.error("Database: Ошибка проверки подписки:", error);
      throw error;
    }
  }

  /**
   * Обновление времени последнего уведомления
   */
  updateLastNotified(chatId: number): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE subscribers 
        SET last_notified = ?, updated_at = ?
        WHERE chat_id = ? AND is_active = 1
      `);

      const now = new Date().toISOString();
      stmt.run(now, now, chatId);
    } catch (error) {
      logger.error("Database: Ошибка обновления времени уведомления:", error);
      throw error;
    }
  }

  /**
   * Сохранение результатов проверки
   */
  saveCheckResults(results: PowerOutageInfo[]): void {
    try {
      // Создаем хеш результатов для быстрого сравнения
      const resultsHash = this.hashResults(results);
      const resultsData = JSON.stringify(results);

      const stmt = this.db.prepare(`
        INSERT INTO check_history (check_time, results_count, results_hash, results_data)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(
        new Date().toISOString(),
        results.length,
        resultsHash,
        resultsData
      );

      // Очищаем старые записи (оставляем только последние 100)
      this.db.exec(`
        DELETE FROM check_history 
        WHERE id NOT IN (
          SELECT id FROM check_history 
          ORDER BY check_time DESC 
          LIMIT 100
        )
      `);

      logger.info(
        `Database: Сохранены результаты проверки (${results.length} записей)`
      );
    } catch (error) {
      logger.error("Database: Ошибка сохранения результатов:", error);
      throw error;
    }
  }

  /**
   * Получение последних результатов проверки
   */
  getLastCheckResults(): { checkTime?: Date; results: PowerOutageInfo[] } {
    try {
      const stmt = this.db.prepare(`
        SELECT check_time, results_data
        FROM check_history 
        ORDER BY check_time DESC 
        LIMIT 1
      `);

      const record = stmt.get() as
        | { check_time: string; results_data: string }
        | undefined;

      if (!record) {
        return { results: [] };
      }

      return {
        checkTime: new Date(record.check_time),
        results: JSON.parse(record.results_data),
      };
    } catch (error) {
      logger.error("Database: Ошибка получения последних результатов:", error);
      return { results: [] };
    }
  }

  /**
   * Проверка на наличие новых результатов
   */
  hasNewResults(currentResults: PowerOutageInfo[]): boolean {
    try {
      const currentHash = this.hashResults(currentResults);

      const stmt = this.db.prepare(`
        SELECT results_hash 
        FROM check_history 
        ORDER BY check_time DESC 
        LIMIT 1
      `);

      const record = stmt.get() as { results_hash: string } | undefined;

      if (!record) {
        return currentResults.length > 0; // Первая проверка
      }

      return record.results_hash !== currentHash;
    } catch (error) {
      logger.error("Database: Ошибка проверки новых результатов:", error);
      return true; // В случае ошибки считаем что есть изменения
    }
  }

  /**
   * Получение статистики
   */
  getStats(): {
    totalSubscribers: number;
    activeSubscribers: number;
    lastCheckTime?: Date | undefined;
    lastResultsCount: number;
  } {
    try {
      // Общее количество подписчиков
      const totalStmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM subscribers
      `);
      const total = (totalStmt.get() as { count: number }).count;

      // Активные подписчики
      const activeStmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM subscribers WHERE is_active = 1
      `);
      const active = (activeStmt.get() as { count: number }).count;

      // Последняя проверка
      const lastCheckStmt = this.db.prepare(`
        SELECT check_time, results_count 
        FROM check_history 
        ORDER BY check_time DESC 
        LIMIT 1
      `);
      const lastCheck = lastCheckStmt.get() as
        | { check_time: string; results_count: number }
        | undefined;

      return {
        totalSubscribers: total,
        activeSubscribers: active,
        lastCheckTime: lastCheck ? new Date(lastCheck.check_time) : undefined,
        lastResultsCount: lastCheck?.results_count || 0,
      };
    } catch (error) {
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
  private hashResults(results: PowerOutageInfo[]): string {
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
   * Сохранение отключений в БД
   */
  saveOutages(outages: PowerOutageInfo[], reportFile?: string): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO power_outages (
          district, place, addresses, date_from, date_to, energy, 
          report_file, content_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let savedCount = 0;
      const now = new Date().toISOString();

      for (const outage of outages) {
        const contentHash = this.hashSingleOutage(outage);

        // Проверяем существование записи с таким же хешем
        const existing = this.db
          .prepare(
            `
          SELECT id FROM power_outages WHERE content_hash = ?
        `
          )
          .get(contentHash);

        if (!existing) {
          const result = stmt.run(
            outage.district || null,
            outage.place || null,
            outage.addresses || null,
            outage.dateFrom || null,
            outage.dateTo || null,
            outage.energy || null,
            reportFile || null,
            contentHash,
            now,
            now
          );

          if (result.changes > 0) {
            savedCount++;
          }
        }
      }

      if (savedCount > 0) {
        logger.info(`Database: Сохранено ${savedCount} новых отключений`);
      }

      return savedCount;
    } catch (error) {
      logger.error("Database: Ошибка сохранения отключений:", error);
      throw error;
    }
  }

  /**
   * Поиск отключений в БД
   */
  searchOutages(filters: {
    district?: string;
    place?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }): PowerOutageRecord[] {
    try {
      let query = `
        SELECT 
          id, district, place, addresses, 
          date_from as dateFrom, date_to as dateTo, energy, 
          report_file as reportFile, content_hash as contentHash,
          created_at as createdAt, updated_at as updatedAt
        FROM power_outages 
        WHERE 1=1
      `;
      const params: any[] = [];

      if (filters.district) {
        query += ` AND district LIKE ?`;
        params.push(`%${filters.district}%`);
      }

      if (filters.place) {
        query += ` AND place LIKE ?`;
        params.push(`%${filters.place}%`);
      }

      if (filters.dateFrom) {
        query += ` AND date_from >= ?`;
        params.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        query += ` AND date_to <= ?`;
        params.push(filters.dateTo);
      }

      query += ` ORDER BY created_at DESC`;

      if (filters.limit) {
        query += ` LIMIT ?`;
        params.push(filters.limit);
      }

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as PowerOutageRecord[];

      return rows;
    } catch (error) {
      logger.error("Database: Ошибка поиска отключений:", error);
      throw error;
    }
  }

  /**
   * Получение статистики по отключениям
   */
  getOutagesStats(): {
    totalOutages: number;
    uniqueDistricts: number;
    uniquePlaces: number;
    lastOutageDate?: string;
  } {
    try {
      const totalStmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM power_outages
      `);
      const total = totalStmt.get() as { count: number };

      const districtsStmt = this.db.prepare(`
        SELECT COUNT(DISTINCT district) as count FROM power_outages WHERE district IS NOT NULL
      `);
      const districts = districtsStmt.get() as { count: number };

      const placesStmt = this.db.prepare(`
        SELECT COUNT(DISTINCT place) as count FROM power_outages WHERE place IS NOT NULL
      `);
      const places = placesStmt.get() as { count: number };

      const lastDateStmt = this.db.prepare(`
        SELECT date_from FROM power_outages 
        WHERE date_from IS NOT NULL 
        ORDER BY created_at DESC 
        LIMIT 1
      `);
      const lastDate = lastDateStmt.get() as { date_from: string } | undefined;

      const result = {
        totalOutages: total.count,
        uniqueDistricts: districts.count,
        uniquePlaces: places.count,
        ...(lastDate?.date_from && { lastOutageDate: lastDate.date_from }),
      };

      return result;
    } catch (error) {
      logger.error("Database: Ошибка получения статистики отключений:", error);
      throw error;
    }
  }

  /**
   * Удаление отключений по фильтру (для тестов и очистки)
   */
  deleteOutages(filter: { reportFile?: string }): number {
    try {
      let query = `DELETE FROM power_outages WHERE 1=1`;
      const params: any[] = [];

      if (filter.reportFile) {
        query += ` AND report_file LIKE ?`;
        params.push(`%${filter.reportFile}%`);
      }

      const stmt = this.db.prepare(query);
      const result = stmt.run(...params);

      logger.info(`Database: Удалено ${result.changes} записей отключений`);
      return result.changes;
    } catch (error) {
      logger.error("Database: Ошибка удаления отключений:", error);
      throw error;
    }
  }

  /**
   * Создание хеша для одного отключения
   */
  private hashSingleOutage(outage: PowerOutageInfo): string {
    const hashString = `${outage.place || ""}|${outage.dateFrom || ""}|${
      outage.dateTo || ""
    }|${outage.addresses || ""}`;

    // Простая hash функция
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
  close(): void {
    try {
      this.db.close();
      logger.info("Database: Соединение с БД закрыто");
    } catch (error) {
      logger.error("Database: Ошибка закрытия БД:", error);
    }
  }

  /**
   * Получение настройки из базы данных
   */
  getSetting(key: string): string | null {
    try {
      const stmt = this.db.prepare(`
        SELECT value FROM settings WHERE key = ?
      `);
      const result = stmt.get(key) as { value: string } | undefined;
      return result?.value || null;
    } catch (error) {
      logger.error(`Database: Ошибка получения настройки ${key}:`, error);
      throw error;
    }
  }

  /**
   * Сохранение настройки в базу данных
   */
  setSetting(key: string, value: string): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
      `);

      stmt.run(key, value, new Date().toISOString());

      logger.info(`Database: Сохранена настройка ${key} = ${value}`);
    } catch (error) {
      logger.error(`Database: Ошибка сохранения настройки ${key}:`, error);
      throw error;
    }
  }

  /**
   * Оптимизация БД
   */
  vacuum(): void {
    try {
      this.db.exec("VACUUM;");
      logger.info("Database: БД оптимизирована");
    } catch (error) {
      logger.error("Database: Ошибка оптимизации БД:", error);
    }
  }
}
