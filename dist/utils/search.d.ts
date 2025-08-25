/**
 * Утилиты для поиска и обработки данных
 */
import { MY_PLACE } from "../config.js";
/**
 * Поиск места MY_PLACE в строке таблицы
 */
export declare function findMyPlaceInRow(cellTexts: string[]): number | null;
/**
 * Поиск ${MY_PLACE} в строке таблицы
 */
export declare function findPriozeryeInRow(cellTexts: string[]): {
    variant: typeof MY_PLACE;
    columnIndex: number;
} | null;
//# sourceMappingURL=search.d.ts.map