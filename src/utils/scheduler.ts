/**
 * Планировщик для автоматических задач
 */

import cron from "node-cron";
import { logger } from "./logger.js";
import { backupManager } from "./backup.js";

export interface ScheduleTask {
  name: string;
  schedule: string;
  description: string;
  enabled: boolean;
  lastRun?: Date | undefined;
  nextRun?: Date | undefined;
}

export class Scheduler {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private taskConfigs: Map<string, ScheduleTask> = new Map();

  constructor() {
    logger.info("Scheduler: Инициализация планировщика");
  }

  /**
   * Добавление задачи автоматического бэкапа
   */
  addBackupTask(schedule: string = "0 3 * * *"): void {
    const taskName = "auto-backup";

    this.removeTask(taskName);

    const task = cron.schedule(
      schedule,
      async () => {
        try {
          logger.info("Scheduler: Запуск автоматического бэкапа");
          await backupManager.autoBackup();

          this.updateTaskLastRun(taskName);
          logger.info("Scheduler: Автоматический бэкап завершен");
        } catch (error) {
          logger.error("Scheduler: Ошибка автоматического бэкапа:", error);
        }
      },
      {
        scheduled: false,
        timezone: "Europe/Moscow",
      }
    );

    this.tasks.set(taskName, task);
    this.taskConfigs.set(taskName, {
      name: taskName,
      schedule,
      description: "Автоматическое создание бэкапа базы данных",
      enabled: false,
    });

    logger.info(
      `Scheduler: Добавлена задача бэкапа с расписанием: ${schedule}`
    );
  }

  /**
   * Запуск задачи
   */
  startTask(taskName: string): boolean {
    const task = this.tasks.get(taskName);
    const config = this.taskConfigs.get(taskName);

    if (!task || !config) {
      logger.error(`Scheduler: Задача '${taskName}' не найдена`);
      return false;
    }

    try {
      task.start();
      config.enabled = true;
      config.nextRun = this.getNextRunDate(config.schedule);

      logger.info(`Scheduler: Задача '${taskName}' запущена`);
      return true;
    } catch (error) {
      logger.error(`Scheduler: Ошибка запуска задачи '${taskName}':`, error);
      return false;
    }
  }

  /**
   * Остановка задачи
   */
  stopTask(taskName: string): boolean {
    const task = this.tasks.get(taskName);
    const config = this.taskConfigs.get(taskName);

    if (!task || !config) {
      logger.error(`Scheduler: Задача '${taskName}' не найдена`);
      return false;
    }

    try {
      task.stop();
      config.enabled = false;
      config.nextRun = undefined as Date | undefined;

      logger.info(`Scheduler: Задача '${taskName}' остановлена`);
      return true;
    } catch (error) {
      logger.error(`Scheduler: Ошибка остановки задачи '${taskName}':`, error);
      return false;
    }
  }

  /**
   * Удаление задачи
   */
  removeTask(taskName: string): boolean {
    const task = this.tasks.get(taskName);

    if (task) {
      try {
        if ("destroy" in task) {
          (task as any).destroy();
        } else {
          task.stop();
        }
        this.tasks.delete(taskName);
        this.taskConfigs.delete(taskName);

        logger.info(`Scheduler: Задача '${taskName}' удалена`);
        return true;
      } catch (error) {
        logger.error(`Scheduler: Ошибка удаления задачи '${taskName}':`, error);
        return false;
      }
    }

    return false;
  }

  /**
   * Получение списка всех задач
   */
  getAllTasks(): ScheduleTask[] {
    return Array.from(this.taskConfigs.values());
  }

  /**
   * Получение информации о задаче
   */
  getTask(taskName: string): ScheduleTask | undefined {
    return this.taskConfigs.get(taskName);
  }

  /**
   * Обновление времени последнего запуска
   */
  private updateTaskLastRun(taskName: string): void {
    const config = this.taskConfigs.get(taskName);
    if (config) {
      config.lastRun = new Date();
      config.nextRun = this.getNextRunDate(config.schedule);
    }
  }

  /**
   * Вычисление следующего времени запуска
   */
  private getNextRunDate(schedule: string): Date | undefined {
    try {
      // Простое вычисление следующего запуска для стандартных cron выражений
      const now = new Date();
      const parts = schedule.split(" ");

      if (parts.length !== 5) {
        return undefined;
      }

      const [minute, hour, day, month, weekday] = parts;

      // Для ежедневного бэкапа в 3:00
      if (
        minute === "0" &&
        hour === "3" &&
        day === "*" &&
        month === "*" &&
        weekday === "*"
      ) {
        const nextRun = new Date(now);
        nextRun.setHours(3, 0, 0, 0);

        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }

        return nextRun;
      }

      // Для еженедельного бэкапа в воскресенье в 2:00
      if (
        minute === "0" &&
        hour === "2" &&
        day === "*" &&
        month === "*" &&
        weekday === "0"
      ) {
        const nextRun = new Date(now);
        nextRun.setHours(2, 0, 0, 0);

        const dayOfWeek = now.getDay();
        const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;

        if (dayOfWeek === 0 && now.getHours() >= 2) {
          nextRun.setDate(nextRun.getDate() + 7);
        } else {
          nextRun.setDate(nextRun.getDate() + daysUntilSunday);
        }

        return nextRun;
      }

      // Для интервальных задач (каждые N часов)
      if (hour && hour.includes("*/")) {
        const hourInterval = parseInt(hour.replace("*/", ""));
        const nextRun = new Date(now);
        const currentHour = now.getHours();
        const nextHour =
          Math.ceil((currentHour + 1) / hourInterval) * hourInterval;

        if (nextHour >= 24) {
          nextRun.setDate(nextRun.getDate() + 1);
          nextRun.setHours(nextHour - 24, 0, 0, 0);
        } else {
          nextRun.setHours(nextHour, 0, 0, 0);
        }

        return nextRun;
      }

      return undefined;
    } catch (error) {
      logger.error("Scheduler: Ошибка вычисления следующего запуска:", error);
      return undefined;
    }
  }

  /**
   * Запуск всех активных задач
   */
  startAll(): void {
    logger.info("Scheduler: Запуск всех активных задач");

    for (const [taskName, config] of this.taskConfigs) {
      if (config.enabled) {
        this.startTask(taskName);
      }
    }
  }

  /**
   * Остановка всех задач
   */
  stopAll(): void {
    logger.info("Scheduler: Остановка всех задач");

    for (const taskName of this.tasks.keys()) {
      this.stopTask(taskName);
    }
  }

  /**
   * Проверка валидности cron выражения
   */
  isValidCronExpression(expression: string): boolean {
    return cron.validate(expression);
  }

  /**
   * Получение статистики планировщика
   */
  getStats(): {
    totalTasks: number;
    activeTasks: number;
    lastBackup?: Date | undefined;
    nextBackup?: Date | undefined;
  } {
    const tasks = this.getAllTasks();
    const backupTask = this.getTask("auto-backup");

    return {
      totalTasks: tasks.length,
      activeTasks: tasks.filter((t) => t.enabled).length,
      lastBackup: backupTask?.lastRun || undefined,
      nextBackup: backupTask?.nextRun || undefined,
    };
  }

  /**
   * Остановка планировщика
   */
  shutdown(): void {
    logger.info("Scheduler: Остановка планировщика");
    this.stopAll();

    for (const task of this.tasks.values()) {
      if ("destroy" in task) {
        (task as any).destroy();
      } else {
        task.stop();
      }
    }

    this.tasks.clear();
    this.taskConfigs.clear();
  }
}

// Экспортируем singleton instance
export const scheduler = new Scheduler();
