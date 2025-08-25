/**
 * Утилиты для извлечения данных из таблиц
 */
/**
 * Извлечение информации об отключении из строки таблицы
 */
export function extractPowerOutageInfo(cellTexts) {
    // Извлекаем данные по позициям ячеек
    const district = cellTexts[0] || ""; // Ячейка 1
    const place = cellTexts[1] || ""; // Ячейка 2
    const addresses = cellTexts[2] || ""; // Ячейка 3
    // Объединяем ячейки 4 и 5 для dateFrom
    const dateFromCell4 = cellTexts[3] || "";
    const dateFromCell5 = cellTexts[4] || "";
    const dateFrom = `${dateFromCell4} ${dateFromCell5}`.trim();
    // Объединяем ячейки 6 и 7 для dateTo
    const dateToCell6 = cellTexts[5] || "";
    const dateToCell7 = cellTexts[6] || "";
    const dateTo = `${dateToCell6} ${dateToCell7}`.trim();
    // Объединяем ячейки 8 и 9 для energy
    const energyCell8 = cellTexts[7] || "";
    const energyCell9 = cellTexts[8] || "";
    const energy = `${energyCell8} ${energyCell9}`.trim();
    return {
        district,
        place,
        addresses,
        dateFrom,
        dateTo,
        energy,
        fullRowData: cellTexts,
    };
}
//# sourceMappingURL=extractor.js.map