/**
 * Утилиты для работы с файлами отчетов
 */

/**
 * Получение последнего отчета из папки reports
 */
export async function getLatestReport(): Promise<string | null> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");

    const reportsDir = path.resolve("reports");

    // Проверяем существование папки reports
    try {
      await fs.access(reportsDir);
    } catch {
      return null; // Папка не существует
    }

    // Читаем содержимое папки
    const files = await fs.readdir(reportsDir);

    // Фильтруем только .md файлы
    const mdFiles = files.filter(
      (file) =>
        file.endsWith(".md") && !file.startsWith(".") && file.includes("report")
    );

    if (mdFiles.length === 0) {
      return null; // Нет отчетов
    }

    // Получаем статистику файлов для сортировки по времени создания
    const filesWithStats = await Promise.all(
      mdFiles.map(async (file) => {
        const fullPath = path.join(reportsDir, file);
        const stats = await fs.stat(fullPath);
        return {
          file,
          fullPath,
          mtime: stats.mtime,
        };
      })
    );

    // Сортируем по времени модификации (новые сначала)
    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Возвращаем путь к самому новому файлу
    return filesWithStats.length > 0 ? filesWithStats[0]!.fullPath : null;
  } catch (error) {
    console.error("Ошибка при поиске последнего отчета:", error);
    return null;
  }
}

/**
 * Получение информации о последнем отчете
 */
export async function getLatestReportInfo(): Promise<{
  path: string;
  name: string;
  size: number;
  createdAt: Date;
} | null> {
  try {
    const latestReportPath = await getLatestReport();

    if (!latestReportPath) {
      return null;
    }

    const fs = await import("fs/promises");
    const path = await import("path");

    const stats = await fs.stat(latestReportPath);
    const fileName = path.basename(latestReportPath);

    return {
      path: latestReportPath,
      name: fileName,
      size: stats.size,
      createdAt: stats.mtime,
    };
  } catch (error) {
    console.error("Ошибка при получении информации об отчете:", error);
    return null;
  }
}

/**
 * Ротация отчетов - удаляет старые файлы, оставляя только maxFiles самых новых
 */
export async function rotateReports(maxFiles: number = 10): Promise<void> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const { logger } = await import("./logger.js");

    const reportsDir = path.resolve("reports");

    // Проверяем существование папки reports
    try {
      await fs.access(reportsDir);
    } catch {
      return; // Папка не существует, нечего ротировать
    }

    // Читаем содержимое папки
    const files = await fs.readdir(reportsDir);

    // Фильтруем только .md файлы отчетов
    const reportFiles = files.filter(
      (file) =>
        file.endsWith(".md") && !file.startsWith(".") && file.includes("report")
    );

    if (reportFiles.length <= maxFiles) {
      return; // Файлов меньше лимита, ротация не нужна
    }

    // Получаем статистику файлов для сортировки по времени создания
    const filesWithStats = await Promise.all(
      reportFiles.map(async (file) => {
        const fullPath = path.join(reportsDir, file);
        const stats = await fs.stat(fullPath);
        return {
          file,
          fullPath,
          mtime: stats.mtime,
        };
      })
    );

    // Сортируем по времени модификации (новые сначала)
    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Удаляем файлы сверх лимита
    const filesToDelete = filesWithStats.slice(maxFiles);

    if (filesToDelete.length > 0) {
      logger.info(
        `FileUtils: Ротация отчетов - удаляем ${filesToDelete.length} старых файлов`
      );

      for (const fileInfo of filesToDelete) {
        try {
          await fs.unlink(fileInfo.fullPath);
          logger.info(`FileUtils: Удален старый отчет: ${fileInfo.file}`);
        } catch (error) {
          logger.error(
            `FileUtils: Ошибка удаления файла ${fileInfo.file}:`,
            error
          );
        }
      }

      logger.info(
        `FileUtils: Ротация завершена. Осталось отчетов: ${
          filesWithStats.length - filesToDelete.length
        }`
      );
    }
  } catch (error) {
    console.error("Ошибка при ротации отчетов:", error);
  }
}
