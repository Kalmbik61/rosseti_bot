/**
 * Утилиты для работы с файлами отчетов
 */
/**
 * Получение последнего отчета из папки reports
 */
export declare function getLatestReport(): Promise<string | null>;
/**
 * Получение информации о последнем отчете
 */
export declare function getLatestReportInfo(): Promise<{
    path: string;
    name: string;
    size: number;
    createdAt: Date;
} | null>;
//# sourceMappingURL=fileUtils.d.ts.map