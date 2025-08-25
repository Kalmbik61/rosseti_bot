/**
 * Главный файл для поиска Приозерья
 * Простой API для получения данных
 */
import type { PriozeryeRow, PowerOutageInfo } from "./utils/types.js";
/**
 * Основная функция - ищет данные по Приозерью
 * @param dateFrom Дата начала поиска
 * @param dateTo Дата окончания поиска
 * @param district Район (по умолчанию "Мясниковский")
 * @returns Массив найденных строк с Приозерьем
 */
export declare function getPriozeryeData(dateFrom: Date, dateTo: Date, district?: string): Promise<PriozeryeRow[]>;
/**
 * Быстрый поиск за N дней назад
 * @param days Количество дней назад (по умолчанию 30)
 * @returns Массив найденных строк
 */
export declare function getPriozeryeQuick(days?: number): Promise<PriozeryeRow[]>;
/**
 * Получить данные и сформировать отчет
 * @param dateFrom Дата начала
 * @param dateTo Дата окончания
 * @returns Текстовый отчет
 */
export declare function getPriozeryeReport(dateFrom: Date, dateTo: Date): Promise<string>;
/**
 * Основная функция для поиска отключений по MY_PLACE
 * @param dateFrom Дата начала поиска
 * @param dateTo Дата окончания поиска
 * @param district Район (по умолчанию "Мясниковский")
 * @param places Место (по умолчанию "х.Ленинаван")
 * @returns Массив объектов с информацией об отключениях
 */
export declare function getPowerOutagesData(dateFrom: Date, dateTo: Date, district?: string, places?: string): Promise<PowerOutageInfo[]>;
/**
 * Быстрый поиск отключений за N дней назад
 * @param days Количество дней назад (по умолчанию 30)
 * @returns Массив объектов с информацией об отключениях
 */
export declare function getPowerOutagesQuick(days?: number): Promise<PowerOutageInfo[]>;
/**
 * Создание Markdown отчета об отключениях
 * @param outages Массив данных об отключениях
 * @returns Отчет в формате Markdown
 */
export declare function createMarkdownReport(outages: PowerOutageInfo[]): string;
/**
 * Сохранение отчета об отключениях в файл .md
 * @param outages Массив данных об отключениях
 * @param filename Имя файла (опционально)
 * @returns Путь к сохраненному файлу
 */
export declare function saveReport(outages: PowerOutageInfo[], filename?: string): Promise<string>;
/**
 * Экспорт типов
 */
export type { PriozeryeRow, PowerOutageInfo } from "./utils/types.js";
//# sourceMappingURL=index.d.ts.map