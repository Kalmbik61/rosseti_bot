/**
 * Утилита для создания и восстановления бэкапов SQLite базы данных
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger.js";
import { formatFileSize } from "./fileUtils.js";

export interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  createdAt: Date;
  isValid: boolean;
}

export class BackupManager {
  private dbPath: string;
  private backupDir: string;
  private maxBackups: number;

  constructor(dbPath?: string, backupDir?: string, maxBackups: number = 7) {
    this.dbPath =
      dbPath || path.join(process.cwd(), "data", "subscriptions.db");
    this.backupDir = backupDir || path.join(process.cwd(), "data", "backups");
    this.maxBackups = maxBackups;

    // Создаем папку для бэкапов если её нет
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      logger.info(`Backup: Создана папка для бэкапов ${this.backupDir}`);
    }
  }

  /**
   * Создание бэкапа базы данных
   */
  async createBackup(customName?: string): Promise<string> {
    try {
      // Проверяем существование исходной БД
      if (!fs.existsSync(this.dbPath)) {
        throw new Error(`База данных не найдена: ${this.dbPath}`);
      }

      // Генерируем имя файла бэкапа
      const timestamp =
        new Date().toISOString().replace(/[:.]/g, "-").split("T")[0] +
        "_" +
        (new Date().toTimeString().split(" ")[0] || "00-00-00").replace(
          /:/g,
          "-"
        );

      const backupName = customName || `backup_${timestamp}.db`;
      const backupPath = path.join(this.backupDir, backupName);

      // Создаем копию файла БД
      await fs.promises.copyFile(this.dbPath, backupPath);

      // Проверяем валидность созданного бэкапа
      const isValid = await this.validateBackup(backupPath);
      if (!isValid) {
        // Удаляем невалидный бэкап
        fs.unlinkSync(backupPath);
        throw new Error("Созданный бэкап оказался невалидным");
      }

      const stats = await fs.promises.stat(backupPath);
      logger.info(
        `Backup: Создан бэкап ${backupName} (${formatFileSize(stats.size)})`
      );

      // Очищаем старые бэкапы
      await this.cleanupOldBackups();

      return backupPath;
    } catch (error) {
      logger.error("Backup: Ошибка создания бэкапа:", error);
      throw error;
    }
  }

  /**
   * Восстановление из бэкапа
   */
  async restoreFromBackup(backupPath: string): Promise<void> {
    try {
      // Проверяем существование файла бэкапа
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Файл бэкапа не найден: ${backupPath}`);
      }

      // Проверяем валидность бэкапа
      const isValid = await this.validateBackup(backupPath);
      if (!isValid) {
        throw new Error("Файл бэкапа поврежден или невалиден");
      }

      // Создаем бэкап текущей БД перед восстановлением
      const currentDbExists = fs.existsSync(this.dbPath);
      let currentDbBackup: string | null = null;

      if (currentDbExists) {
        currentDbBackup = await this.createBackup("before_restore");
        logger.info("Backup: Создан бэкап текущей БД перед восстановлением");
      }

      try {
        // Восстанавливаем БД из бэкапа
        await fs.promises.copyFile(backupPath, this.dbPath);

        // Проверяем восстановленную БД
        const restoredIsValid = await this.validateBackup(this.dbPath);
        if (!restoredIsValid) {
          throw new Error("Восстановленная БД оказалась невалидной");
        }

        const stats = await fs.promises.stat(this.dbPath);
        logger.info(
          `Backup: БД успешно восстановлена из ${path.basename(
            backupPath
          )} (${formatFileSize(stats.size)})`
        );
      } catch (error) {
        // В случае ошибки восстанавливаем исходную БД
        if (currentDbBackup && fs.existsSync(currentDbBackup)) {
          await fs.promises.copyFile(currentDbBackup, this.dbPath);
          logger.info("Backup: Восстановлена исходная БД после ошибки");
        }
        throw error;
      }
    } catch (error) {
      logger.error("Backup: Ошибка восстановления из бэкапа:", error);
      throw error;
    }
  }

  /**
   * Получение списка доступных бэкапов
   */
  async listBackups(): Promise<BackupInfo[]> {
    try {
      if (!fs.existsSync(this.backupDir)) {
        return [];
      }

      const files = await fs.promises.readdir(this.backupDir);
      const backups: BackupInfo[] = [];

      for (const file of files) {
        if (file.endsWith(".db")) {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.promises.stat(filePath);
          const isValid = await this.validateBackup(filePath);

          backups.push({
            filename: file,
            path: filePath,
            size: stats.size,
            createdAt: stats.birthtime,
            isValid,
          });
        }
      }

      // Сортируем по дате создания (новые сверху)
      return backups.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
    } catch (error) {
      logger.error("Backup: Ошибка получения списка бэкапов:", error);
      return [];
    }
  }

  /**
   * Удаление старых бэкапов
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();
      const validBackups = backups.filter((b) => b.isValid);

      if (validBackups.length > this.maxBackups) {
        // Оставляем только maxBackups самых новых бэкапов
        const backupsToDelete = validBackups.slice(this.maxBackups);

        for (const backup of backupsToDelete) {
          await fs.promises.unlink(backup.path);
          logger.info(`Backup: Удален старый бэкап ${backup.filename}`);
        }
      }

      // Удаляем невалидные бэкапы
      const invalidBackups = backups.filter((b) => !b.isValid);
      for (const backup of invalidBackups) {
        await fs.promises.unlink(backup.path);
        logger.warn(`Backup: Удален невалидный бэкап ${backup.filename}`);
      }
    } catch (error) {
      logger.error("Backup: Ошибка очистки старых бэкапов:", error);
    }
  }

  /**
   * Проверка валидности файла БД
   */
  private async validateBackup(dbPath: string): Promise<boolean> {
    try {
      // Простая проверка - пытаемся открыть БД и выполнить простой запрос
      const { default: Database } = await import("better-sqlite3");
      const db = new Database(dbPath, { readonly: true });

      try {
        // Проверяем что это SQLite файл
        const result = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all();

        // Проверяем наличие основных таблиц
        const tableNames = result.map((r: any) => r.name);
        const requiredTables = [
          "subscribers",
          "settings",
          "check_history",
          "power_outages",
        ];
        const hasRequiredTables = requiredTables.every((table) =>
          tableNames.includes(table)
        );

        db.close();
        return hasRequiredTables;
      } catch (error) {
        db.close();
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Получение размера базы данных
   */
  async getDatabaseSize(): Promise<number> {
    try {
      if (!fs.existsSync(this.dbPath)) {
        return 0;
      }
      const stats = await fs.promises.stat(this.dbPath);
      return stats.size;
    } catch (error) {
      logger.error("Backup: Ошибка получения размера БД:", error);
      return 0;
    }
  }

  /**
   * Получение общего размера бэкапов
   */
  async getBackupsSize(): Promise<number> {
    try {
      const backups = await this.listBackups();
      return backups.reduce((total, backup) => total + backup.size, 0);
    } catch (error) {
      logger.error("Backup: Ошибка получения размера бэкапов:", error);
      return 0;
    }
  }

  /**
   * Автоматическое создание бэкапа (для cron)
   */
  async autoBackup(): Promise<void> {
    try {
      logger.info("Backup: Запуск автоматического бэкапа");

      const backupPath = await this.createBackup();
      const backups = await this.listBackups();
      const validBackups = backups.filter((b) => b.isValid);

      logger.info(
        `Backup: Автобэкап завершен. Всего валидных бэкапов: ${validBackups.length}`
      );
    } catch (error) {
      logger.error("Backup: Ошибка автоматического бэкапа:", error);
    }
  }

  /**
   * Экспорт настроек бэкапа
   */
  getBackupConfig(): {
    dbPath: string;
    backupDir: string;
    maxBackups: number;
  } {
    return {
      dbPath: this.dbPath,
      backupDir: this.backupDir,
      maxBackups: this.maxBackups,
    };
  }
}

// Экспортируем singleton instance
export const backupManager = new BackupManager();
