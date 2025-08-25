/**
 * Утилиты для работы с датами
 */
/**
 * Проверка является ли отключение актуальным (сегодня или в будущем)
 */
export declare function isOutageValid(outageDate: string): boolean;
/**
 * Фильтрация отключений по актуальности
 */
export declare function filterValidOutages<T extends {
    dateFrom: string;
}>(outages: T[]): T[];
/**
 * Форматирование даты для отображения
 */
export declare function formatDateForDisplay(date: Date): string;
//# sourceMappingURL=dateUtils.d.ts.map