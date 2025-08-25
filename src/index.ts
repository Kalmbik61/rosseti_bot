/**
 * Главный файл для поиска Приозерья
 * Простой API для получения данных
 */

import {
  findPriozeryeInTables,
  quickFindPriozerie,
  findPowerOutages,
  quickFindPowerOutages,
} from "./parser.js";
import {
  buildSearchUrl,
  formatPriozeryeReport,
  createPowerOutageMarkdownReport,
  savePowerOutageReport,
} from "./utils/index.js";
import type { PriozeryeRow, PowerOutageInfo } from "./utils/types.js";

/**
 * Основная функция - ищет данные по Приозерью
 * @param dateFrom Дата начала поиска
 * @param dateTo Дата окончания поиска
 * @param district Район (по умолчанию "Мясниковский")
 * @returns Массив найденных строк с Приозерьем
 */
export async function getPriozeryeData(
  dateFrom: Date,
  dateTo: Date,
  district: string = "Мясниковский"
): Promise<PriozeryeRow[]> {
  const url = buildSearchUrl(dateFrom, dateTo, district);
  const result = await findPriozeryeInTables(url);
  return result.rows;
}

/**
 * Быстрый поиск за N дней назад
 * @param days Количество дней назад (по умолчанию 30)
 * @returns Массив найденных строк
 */
export async function getPriozeryeQuick(
  days: number = 30
): Promise<PriozeryeRow[]> {
  return await quickFindPriozerie(days);
}

/**
 * Получить данные и сформировать отчет
 * @param dateFrom Дата начала
 * @param dateTo Дата окончания
 * @returns Текстовый отчет
 */
export async function getPriozeryeReport(
  dateFrom: Date,
  dateTo: Date
): Promise<string> {
  const rows = await getPriozeryeData(dateFrom, dateTo);
  return formatPriozeryeReport(rows);
}

/**
 * Основная функция для поиска отключений по MY_PLACE
 * @param dateFrom Дата начала поиска
 * @param dateTo Дата окончания поиска
 * @param district Район (по умолчанию "Мясниковский")
 * @param places Место (по умолчанию "х.Ленинаван")
 * @returns Массив объектов с информацией об отключениях
 */
export async function getPowerOutagesData(
  dateFrom: Date,
  dateTo: Date,
  district: string = "Мясниковский",
  places: string = "х.Ленинаван"
): Promise<PowerOutageInfo[]> {
  const url = buildSearchUrl(dateFrom, dateTo, district, places);
  return await findPowerOutages(url);
}

/**
 * Быстрый поиск отключений за N дней назад
 * @param days Количество дней назад (по умолчанию 30)
 * @returns Массив объектов с информацией об отключениях
 */
export async function getPowerOutagesQuick(
  days: number = 30
): Promise<PowerOutageInfo[]> {
  return await quickFindPowerOutages(days);
}

/**
 * Создание Markdown отчета об отключениях
 * @param outages Массив данных об отключениях
 * @returns Отчет в формате Markdown
 */
export function createMarkdownReport(outages: PowerOutageInfo[]): string {
  return createPowerOutageMarkdownReport(outages);
}

/**
 * Сохранение отчета об отключениях в файл .md
 * @param outages Массив данных об отключениях
 * @param filename Имя файла (опционально)
 * @returns Путь к сохраненному файлу
 */
export async function saveReport(
  outages: PowerOutageInfo[],
  filename?: string
): Promise<string> {
  return await savePowerOutageReport(outages, filename);
}

/**
 * Экспорт типов
 */
export type { PriozeryeRow, PowerOutageInfo } from "./utils/types.js";

/**
 * Демонстрация использования
 */
async function demo() {
  console.log("🔍 Демонстрация поиска отключений\n");

  try {
    // Быстрый поиск отключений
    console.log("Быстрый поиск отключений за 30 дней:");
    const quickOutages = await getPowerOutagesQuick(30);
    console.log(`Найдено: ${quickOutages.length} отключений`);

    // Показать найденные отключения
    if (quickOutages.length > 0) {
      console.log("\nНайденные отключения:");
      quickOutages.forEach((outage, index) => {
        console.log(`${index + 1}. Отключение:`);
        console.log(`   Район: ${outage.district}`);
        console.log(`   Место: ${outage.place}`);
        console.log(`   Адреса: ${outage.addresses}`);
        console.log(`   Начало: ${outage.dateFrom}`);
        console.log(`   Окончание: ${outage.dateTo}`);
        console.log(`   Энергия: ${outage.energy}`);
        console.log(`   Полные данные: ${outage.fullRowData.join(" | ")}\n`);
      });
    }

    // Поиск за конкретный период
    console.log("Поиск за август 2025:");
    const augustOutages = await getPowerOutagesData(
      new Date("2025-08-01"),
      new Date("2025-08-31")
    );
    console.log(`Найдено: ${augustOutages.length} отключений`);

    // Сохранение отчета в файл
    if (quickOutages.length > 0) {
      console.log("\n📄 Сохранение отчета в файл...");
      const reportPath = await saveReport(quickOutages, "отчет-отключения");
      console.log(`✅ Отчет сохранен: ${reportPath}`);
    }
  } catch (error) {
    console.error("Ошибка:", (error as Error).message);
  }
}

// Запуск демо если файл вызван напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  demo();
}
