/**
 * Утилиты для создания Markdown отчетов
 */

import { MY_PLACE } from "../config.js";
import type { PowerOutageInfo } from "./types.js";

/**
 * Экранирование специальных символов для Telegram Markdown
 */
export function escapeMarkdownV2(text: string): string {
  // Символы, которые нужно экранировать в MarkdownV2
  const specialChars = /([_*\[\]()~`>#+=|{}.!-])/g;
  return text.replace(specialChars, "\\$1");
}

/**
 * Безопасное экранирование для обычного Markdown (как используется в боте)
 */
export function escapeMarkdown(text: string): string {
  // Основные символы, которые могут конфликтовать в базовом Markdown
  return text
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#")
    .replace(/\+/g, "\\+")
    .replace(/=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\./g, "\\.")
    .replace(/!/g, "\\!");
}

/**
 * Создание отчета об отключениях в формате Markdown
 */
export function createPowerOutageMarkdownReport(
  outages: PowerOutageInfo[]
): string {
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
  }, {} as Record<string, number>);

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
export async function savePowerOutageReport(
  outages: PowerOutageInfo[],
  filename?: string
): Promise<string> {
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

  // Сохраняем данные об отключениях в БД
  try {
    const { DatabaseManager } = await import("./database.js");
    const db = new DatabaseManager();
    await db.initialize();

    const savedCount = db.saveOutages(outages, filename);
    if (savedCount > 0) {
      console.log(`📊 Сохранено в БД: ${savedCount} новых отключений`);
    }

    db.close();
  } catch (error) {
    console.error("⚠️ Ошибка при сохранении в БД:", error);
    // Не бросаем ошибку, так как основная задача (сохранение файла) выполнена
  }

  // Выполняем ротацию отчетов (сохраняем максимум 10 файлов)
  try {
    const { rotateReports } = await import("./fileUtils.js");
    await rotateReports(10);
  } catch (error) {
    console.error("⚠️ Ошибка при ротации отчетов:", error);
    // Не бросаем ошибку, так как основная задача (сохранение) выполнена
  }

  return fullPath;
}
