/**
 * Утилиты для работы с файлами отчетов
 */
/**
 * Получение последнего отчета из папки reports
 */
export async function getLatestReport() {
    try {
        const fs = await import("fs/promises");
        const path = await import("path");
        const reportsDir = path.resolve("reports");
        // Проверяем существование папки reports
        try {
            await fs.access(reportsDir);
        }
        catch {
            return null; // Папка не существует
        }
        // Читаем содержимое папки
        const files = await fs.readdir(reportsDir);
        // Фильтруем только .md файлы
        const mdFiles = files.filter((file) => file.endsWith(".md") && !file.startsWith(".") && file.includes("report"));
        if (mdFiles.length === 0) {
            return null; // Нет отчетов
        }
        // Получаем статистику файлов для сортировки по времени создания
        const filesWithStats = await Promise.all(mdFiles.map(async (file) => {
            const fullPath = path.join(reportsDir, file);
            const stats = await fs.stat(fullPath);
            return {
                file,
                fullPath,
                mtime: stats.mtime,
            };
        }));
        // Сортируем по времени модификации (новые сначала)
        filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
        // Возвращаем путь к самому новому файлу
        return filesWithStats.length > 0 ? filesWithStats[0].fullPath : null;
    }
    catch (error) {
        console.error("Ошибка при поиске последнего отчета:", error);
        return null;
    }
}
/**
 * Получение информации о последнем отчете
 */
export async function getLatestReportInfo() {
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
    }
    catch (error) {
        console.error("Ошибка при получении информации об отчете:", error);
        return null;
    }
}
//# sourceMappingURL=fileUtils.js.map