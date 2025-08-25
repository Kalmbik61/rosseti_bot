/**
 * Простой парсер для поиска данных по ${MY_PLACE}
 */
import { buildSearchUrl } from "./utils/index.js";
import type { PriozeryeRow, PriozeryeSearchResult, PowerOutageInfo } from "./utils/types.js";
/**
 * Главная функция поиска ${MY_PLACE}
 * @param url - URL для поиска
 * @returns Результат с найденными строками
 */
export declare function findPriozeryeInTables(url: string): Promise<PriozeryeSearchResult>;
/**
 * Основная функция поиска отключений по MY_PLACE
 * @param url - URL для поиска
 * @returns Массив объектов с информацией об отключениях
 */
export declare function findPowerOutages(url: string): Promise<PowerOutageInfo[]>;
/**
 * Быстрый поиск за последние N дней
 */
export declare function quickFindPriozerie(days?: number): Promise<PriozeryeRow[]>;
/**
 * Быстрый поиск отключений для MY_PLACE за последние N дней
 */
export declare function quickFindPowerOutages(days?: number): Promise<PowerOutageInfo[]>;
export { buildSearchUrl };
//# sourceMappingURL=parser.d.ts.map