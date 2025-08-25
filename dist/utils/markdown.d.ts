/**
 * Утилиты для создания Markdown отчетов
 */
import type { PowerOutageInfo } from "./types.js";
/**
 * Создание отчета об отключениях в формате Markdown
 */
export declare function createPowerOutageMarkdownReport(outages: PowerOutageInfo[]): string;
/**
 * Сохранение отчета в файл .md
 */
export declare function savePowerOutageReport(outages: PowerOutageInfo[], filename?: string): Promise<string>;
//# sourceMappingURL=markdown.d.ts.map