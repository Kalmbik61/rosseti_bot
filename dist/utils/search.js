/**
 * Утилиты для поиска и обработки данных
 */
import { MY_PLACE } from "../config.js";
/**
 * Поиск места MY_PLACE в строке таблицы
 */
export function findMyPlaceInRow(cellTexts) {
    const searchPlace = MY_PLACE.toLowerCase().trim();
    for (const [index, text] of cellTexts.entries()) {
        const normalizedText = text.toLowerCase().trim();
        if (normalizedText.includes(searchPlace)) {
            return index;
        }
    }
    return null;
}
/**
 * Поиск ${MY_PLACE} в строке таблицы
 */
export function findPriozeryeInRow(cellTexts) {
    for (const [index, text] of cellTexts.entries()) {
        const normalizedText = text.toLowerCase().trim();
        if (normalizedText.includes(MY_PLACE.toLowerCase())) {
            // Определяем точный вариант написания
            const variant = text.toLowerCase().includes(MY_PLACE.toLowerCase())
                ? MY_PLACE
                : MY_PLACE;
            return { variant, columnIndex: index };
        }
    }
    return null;
}
//# sourceMappingURL=search.js.map