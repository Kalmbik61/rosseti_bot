/**
 * Управление подписками на уведомления о новых отключениях с SQLite
 */

import { DatabaseManager } from "./database.js";
import { logger } from "./logger.js";
import type { PowerOutageInfo } from "./types.js";

export interface Subscriber {
  chatId: number;
  username?: string | undefined;
  firstName?: string | undefined;
  subscribedAt: Date;
  lastNotified?: Date | undefined;
}

export class SubscriptionManager {
  private db: DatabaseManager;

  constructor() {
    this.db = new DatabaseManager();
  }

  /**
   * Инициализация менеджера подписок
   */
  async initialize(): Promise<void> {
    try {
      await this.db.initialize();
      logger.info("SubscriptionManager: Инициализация завершена");
    } catch (error) {
      logger.error("SubscriptionManager: Ошибка инициализации:", error);
      throw error;
    }
  }

  /**
   * Добавление подписчика
   */
  async subscribe(
    chatId: number,
    username?: string,
    firstName?: string
  ): Promise<boolean> {
    try {
      return this.db.addSubscriber(chatId, username, firstName);
    } catch (error) {
      logger.error("SubscriptionManager: Ошибка добавления подписчика:", error);
      throw error;
    }
  }

  /**
   * Удаление подписчика
   */
  async unsubscribe(chatId: number): Promise<boolean> {
    try {
      return this.db.removeSubscriber(chatId);
    } catch (error) {
      logger.error("SubscriptionManager: Ошибка удаления подписчика:", error);
      throw error;
    }
  }

  /**
   * Получение списка всех подписчиков
   */
  getSubscribers(): Subscriber[] {
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
    } catch (error) {
      logger.error("SubscriptionManager: Ошибка получения подписчиков:", error);
      return [];
    }
  }

  /**
   * Проверка подписки пользователя
   */
  isSubscribed(chatId: number): boolean {
    try {
      return this.db.isSubscribed(chatId);
    } catch (error) {
      logger.error("SubscriptionManager: Ошибка проверки подписки:", error);
      return false;
    }
  }

  /**
   * Обновление времени последней проверки и результатов
   */
  async updateLastCheck(results: PowerOutageInfo[]): Promise<void> {
    try {
      this.db.saveCheckResults(results);
    } catch (error) {
      logger.error(
        "SubscriptionManager: Ошибка обновления последней проверки:",
        error
      );
      throw error;
    }
  }

  /**
   * Получение информации о последней проверке
   */
  getLastCheckInfo(): {
    lastCheck?: Date | undefined;
    lastResults: PowerOutageInfo[];
  } {
    try {
      const result = this.db.getLastCheckResults();
      return {
        lastCheck: result.checkTime,
        lastResults: result.results,
      };
    } catch (error) {
      logger.error(
        "SubscriptionManager: Ошибка получения последней проверки:",
        error
      );
      return { lastResults: [] };
    }
  }

  /**
   * Проверка наличия новых результатов
   */
  hasNewResults(currentResults: PowerOutageInfo[]): boolean {
    try {
      return this.db.hasNewResults(currentResults);
    } catch (error) {
      logger.error(
        "SubscriptionManager: Ошибка проверки новых результатов:",
        error
      );
      return true; // В случае ошибки считаем что есть изменения
    }
  }

  /**
   * Обновление времени последнего уведомления для подписчика
   */
  async updateLastNotified(chatId: number): Promise<void> {
    try {
      this.db.updateLastNotified(chatId);
    } catch (error) {
      logger.error(
        "SubscriptionManager: Ошибка обновления времени уведомления:",
        error
      );
    }
  }

  /**
   * Получение статистики подписок
   */
  getStats(): {
    totalSubscribers: number;
    activeSubscribers: number;
    lastCheck?: Date | undefined;
    lastResultsCount: number;
  } {
    try {
      return this.db.getStats();
    } catch (error) {
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
  close(): void {
    try {
      this.db.close();
    } catch (error) {
      logger.error("SubscriptionManager: Ошибка закрытия БД:", error);
    }
  }

  /**
   * Оптимизация БД
   */
  /**
   * Получение текущего интервала обновления (в часах)
   */
  getUpdateInterval(): number {
    try {
      const intervalStr = this.db.getSetting("update_interval_hours");
      return intervalStr ? parseInt(intervalStr, 10) : 6; // По умолчанию 6 часов
    } catch (error) {
      logger.error("SubscriptionManager: Ошибка получения интервала:", error);
      return 6; // Значение по умолчанию
    }
  }

  /**
   * Установка интервала обновления (в часах)
   */
  setUpdateInterval(hours: number): void {
    try {
      if (hours < 1 || hours > 24) {
        throw new Error("Интервал должен быть от 1 до 24 часов");
      }

      this.db.setSetting("update_interval_hours", hours.toString());
      logger.info(
        `SubscriptionManager: Установлен интервал обновления: ${hours} часов`
      );
    } catch (error) {
      logger.error("SubscriptionManager: Ошибка установки интервала:", error);
      throw error;
    }
  }

  vacuum(): void {
    try {
      this.db.vacuum();
    } catch (error) {
      logger.error("SubscriptionManager: Ошибка оптимизации БД:", error);
    }
  }
}
