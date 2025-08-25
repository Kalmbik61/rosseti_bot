/**
 * Утилиты для создания Markdown отчетов
 */
import { MY_PLACE } from "../config.js";
/**
 * Создание отчета об отключениях в формате Markdown
 */
export function createPowerOutageMarkdownReport(outages) {
    const now = new Date();
    const dateStr = now.toLocaleDateString("ru-RU");
    const timeStr = now.toLocaleTimeString("ru-RU");
    let markdown = `# Отчет об отключениях электроэнергии\n\n`;
    markdown += `**Дата формирования отчета:** ${dateStr} ${timeStr}\n`;
    markdown += `**Поиск по месту:** ${MY_PLACE}\n`;
    markdown += `**Найдено записей:** ${outages.length}\n\n`;
    if (outages.length === 0) {
        markdown += `❌ Данные об отключениях для ${MY_PLACE} не найдены.\n`;
        return markdown;
    }
    markdown += `## Таблица отключений\n\n`;
    // Создаем заголовок таблицы
    markdown += `| № | Район | Место | Адреса | Дата/время начала | Дата/время окончания | Информация об энергии |\n`;
    markdown += `|---|-------|-------|--------|-------------------|---------------------|---------------------|\n`;
    // Добавляем строки данных
    outages.forEach((outage, index) => {
        const num = index + 1;
        const district = outage.district || "-";
        const place = outage.place || "-";
        const addresses = outage.addresses || "-";
        const dateFrom = outage.dateFrom || "-";
        const dateTo = outage.dateTo || "-";
        const energy = outage.energy || "-";
        markdown += `| ${num} | ${district} | ${place} | ${addresses} | ${dateFrom} | ${dateTo} | ${energy} |\n`;
    });
    markdown += `\n## Статистика\n\n`;
    markdown += `- **Общее количество отключений:** ${outages.length}\n`;
    // Группировка по районам
    const districtStats = outages.reduce((acc, outage) => {
        const district = outage.district || "Не указан";
        acc[district] = (acc[district] || 0) + 1;
        return acc;
    }, {});
    markdown += `- **По районам:**\n`;
    Object.entries(districtStats).forEach(([district, count]) => {
        markdown += `  - ${district}: ${count} записей\n`;
    });
    markdown += `\n---\n`;
    markdown += `*Отчет сгенерирован автоматически системой парсинга отключений*\n`;
    return markdown;
}
/**
 * Сохранение отчета в файл .md
 */
export async function savePowerOutageReport(outages, filename) {
    const fs = await import("fs/promises");
    const path = await import("path");
    // Убеждаемся что папка reports существует
    const reportsDir = path.resolve("reports");
    await fs.mkdir(reportsDir, { recursive: true });
    // Генерируем имя файла если не указано
    if (!filename) {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
        const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "-"); // HH-MM-SS
        filename = `power-outages-report-${dateStr}-${timeStr}.md`;
    }
    // Убеждаемся что файл имеет расширение .md
    if (!filename.endsWith(".md")) {
        filename += ".md";
    }
    const markdown = createPowerOutageMarkdownReport(outages);
    const fullPath = path.join(reportsDir, filename);
    await fs.writeFile(fullPath, markdown, "utf-8");
    console.log(`📄 Отчет сохранен в файл: ${fullPath}`);
    return fullPath;
}
//# sourceMappingURL=markdown.js.map