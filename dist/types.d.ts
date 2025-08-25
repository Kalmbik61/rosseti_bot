/**
 * Типы для парсера Россети
 */
export interface PriozeryeRow {
    /** Вариант написания населенного пункта */
    settlementVariant: "Приозерье" | "Приозёрье";
    /** Данные всех колонок строки */
    columns: string[];
    /** Индекс колонки где найдено Приозерье */
    foundInColumn: number;
    /** HTML строки для отладки */
    rawHtml: string;
}
export interface PriozeryeSearchResult {
    /** Найденные строки с Приозерьем */
    rows: PriozeryeRow[];
    /** Общее количество строк в таблицах */
    totalRows: number;
    /** Найдено совпадений */
    matchesFound: number;
}
/** Информация об отключении для конкретного места */
export interface PowerOutageInfo {
    /** Район (Ячейка 1) */
    district: string;
    /** Место (Ячейка 2) */
    place: string;
    /** Адреса (Ячейка 3) */
    addresses: string;
    /** Дата и время начала отключения (Ячейка 4 + Ячейка 5) */
    dateFrom: string;
    /** Дата и время окончания отключения (Ячейка 6 + Ячейка 7) */
    dateTo: string;
    /** Информация об энергии (Ячейка 8 + Ячейка 9) */
    energy: string;
    /** Полная строка с данными для отладки */
    fullRowData: string[];
}
//# sourceMappingURL=types.d.ts.map