/**
 * Простая конфигурация для парсера Россети
 */
export declare const BOT_TOKEN: string | undefined;
export declare const ADMIN_CHAT_ID: number;
export declare const MY_PLACE = "\u041F\u0440\u0438\u043E\u0437\u0435\u0440\u044C\u0435";
/**
 * Список chat_id администраторов бота
 * Добавьте сюда свой chat_id для получения админских прав
 */
export declare const ADMIN_CHAT_IDS: number[];
/**
 * Форматирование даты для URL
 */
export declare function formatDate(date: Date): string;
export declare function buildSearchUrl(dateFrom: Date, dateTo: Date, district?: string, places?: string): string;
//# sourceMappingURL=config.d.ts.map