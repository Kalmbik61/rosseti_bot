/**
 * Простой парсер для поиска данных по ${MY_PLACE}
 */

import { chromium, Browser, Page } from "playwright";
import {
  logger,
  buildSearchUrl,
  MY_PLACE,
  findMyPlaceInRow,
  findPriozeryeInRow,
  extractPowerOutageInfo,
  ParserCallLogger,
} from "./utils/index.js";
import type {
  PriozeryeRow,
  PriozeryeSearchResult,
  PowerOutageInfo,
} from "./utils/types.js";

/**
 * Главная функция поиска ${MY_PLACE}
 * @param url - URL для поиска
 * @returns Результат с найденными строками
 */
export async function findPriozeryeInTables(
  url: string
): Promise<PriozeryeSearchResult> {
  const callLogger = new ParserCallLogger(
    "findPriozeryeInTables",
    url,
    "GET",
    {},
    MY_PLACE
  );

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    logger.info(`Переход на страницу: ${url}`);

    // Переходим на страницу
    await page.goto(url, {
      waitUntil: "domcontentloaded", // Быстрее чем networkidle
      timeout: 60000, // Увеличиваем timeout
    });

    // Ожидаем загрузки таблиц
    await page.waitForSelector("table", { timeout: 20000 });

    // Ищем строки с Приозерьем
    const result = await searchPriozeryeInPage(page);

    logger.info(
      `Поиск завершен. Найдено ${result.matchesFound} строк с ${MY_PLACE}`
    );

    // Логируем успешный результат
    await callLogger.logSuccess(result.rows, {
      tablesFound: result.totalRows > 0 ? 1 : 0,
      totalRows: result.totalRows,
    });

    return result;
  } catch (error) {
    // Логируем ошибку
    await callLogger.logError(error as Error);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Поиск строк с ${MY_PLACE} на странице
 */
async function searchPriozeryeInPage(
  page: Page
): Promise<PriozeryeSearchResult> {
  const tables = await page.$$("table");
  logger.info(`Найдено таблиц: ${tables.length}`);

  const foundRows: PriozeryeRow[] = [];
  let totalRows = 0;

  for (const [tableIndex, table] of tables.entries()) {
    const rows = await table.$$("tr");
    totalRows += rows.length;

    logger.info(`Найдено строк в таблице ${tableIndex + 1}: ${rows.length}`);

    for (const [rowIndex, row] of rows.entries()) {
      const cells = await row.$$("td");

      // Пропускаем строки без ячеек (заголовки)
      if (cells.length === 0) continue;

      // Получаем текст всех ячеек
      const cellTexts = await Promise.all(
        cells.map(async (cell) => {
          const text = await cell.textContent();
          return text?.trim() || "";
        })
      );

      // Проверяем, есть ли ${MY_PLACE} в строке
      const priozeryeMatch = findPriozeryeInRow(cellTexts);

      if (priozeryeMatch) {
        const rawHtml = await row.innerHTML();

        foundRows.push({
          settlementVariant: priozeryeMatch.variant,
          columns: cellTexts,
          foundInColumn: priozeryeMatch.columnIndex,
          rawHtml,
        });

        logger.debug(
          `Найдено ${priozeryeMatch.variant} в таблице ${
            tableIndex + 1
          }, строке ${rowIndex + 1}, колонке ${priozeryeMatch.columnIndex + 1}`
        );
      }
    }
  }

  return {
    rows: foundRows,
    totalRows,
    matchesFound: foundRows.length,
  };
}

/**
 * Основная функция поиска отключений по MY_PLACE
 * @param url - URL для поиска
 * @returns Массив объектов с информацией об отключениях
 */
export async function findPowerOutages(
  url: string
): Promise<PowerOutageInfo[]> {
  const callLogger = new ParserCallLogger(
    "findPowerOutages",
    url,
    "GET",
    {},
    MY_PLACE
  );

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    console.log(`\n🌐 СГЕНЕРИРОВАННЫЙ URL:`);
    console.log(url);
    console.log(`========================\n`);

    logger.info(`Переход на страницу: ${url}`);

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForSelector("table", { timeout: 20000 });

    const powerOutages = await searchPowerOutagesInPage(page);

    logger.info(
      `Найдено ${powerOutages.length} записей с отключениями для ${MY_PLACE}`
    );

    // Логируем успешный результат
    await callLogger.logSuccess(powerOutages, {
      tablesFound: powerOutages.length > 0 ? 1 : 0,
    });

    return powerOutages;
  } catch (error) {
    // Логируем ошибку
    await callLogger.logError(error as Error);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Поиск отключений на странице
 */
async function searchPowerOutagesInPage(
  page: Page
): Promise<PowerOutageInfo[]> {
  const tables = await page.$$("table");
  logger.info(`Найдено таблиц: ${tables.length}`);

  const powerOutages: PowerOutageInfo[] = [];

  for (const [tableIndex, table] of tables.entries()) {
    const rows = await table.$$("tr");

    for (const row of rows) {
      const cells = await row.$$("td");

      if (cells.length === 0) continue;

      const cellTexts = await Promise.all(
        cells.map(async (cell) => {
          const text = await cell.textContent();
          return text?.trim() || "";
        })
      );

      const placeColumnIndex = findMyPlaceInRow(cellTexts);

      if (placeColumnIndex !== null) {
        const outageInfo = extractPowerOutageInfo(cellTexts);
        powerOutages.push(outageInfo);

        logger.debug(
          `Найдено отключение для ${MY_PLACE}: ${JSON.stringify(outageInfo)}`
        );
      }
    }
  }

  return powerOutages;
}

/**
 * Быстрый поиск за последние N дней
 */
export async function quickFindPriozerie(
  days: number = 30
): Promise<PriozeryeRow[]> {
  const today = new Date();
  const dateFrom = new Date(today);
  dateFrom.setDate(today.getDate() - days);

  const url = buildSearchUrl(dateFrom, today);
  const callLogger = new ParserCallLogger(
    "quickFind",
    url,
    "GET",
    { days },
    MY_PLACE
  );

  try {
    const result = await findPriozeryeInTables(url);

    // Не логируем здесь, так как findPriozeryeInTables уже логирует
    return result.rows;
  } catch (error) {
    await callLogger.logError(error as Error);
    throw error;
  }
}

/**
 * Быстрый поиск отключений для MY_PLACE за последние N дней
 */
export async function quickFindPowerOutages(
  days: number = 30
): Promise<PowerOutageInfo[]> {
  const today = new Date();
  const dateFrom = new Date(today);
  dateFrom.setDate(today.getDate() - days);

  const url = buildSearchUrl(dateFrom, today);
  const callLogger = new ParserCallLogger(
    "quickFind",
    url,
    "GET",
    { days },
    MY_PLACE
  );

  try {
    const result = await findPowerOutages(url);

    // Не логируем здесь, так как findPowerOutages уже логирует
    return result;
  } catch (error) {
    await callLogger.logError(error as Error);
    throw error;
  }
}

// Экспорт для обратной совместимости
export { buildSearchUrl };
