/**
 * Утилита для логирования вызовов парсера
 */
import type { PowerOutageInfo, PriozeryeRow, ParserCallLog } from "./types.js";
/**
 * Сохранение лога вызова в файл
 */
export declare function saveParserCallLog(log: ParserCallLog): Promise<string>;
/**
 * Создание логгера для отслеживания вызовов парсера
 */
export declare class ParserCallLogger {
    private callId;
    private startTime;
    private callType;
    private request;
    private searchTarget;
    constructor(callType: ParserCallLog["callType"], url: string, method?: string, parameters?: Record<string, any>, searchTarget?: string);
    /**
     * Завершение вызова с успешным результатом
     */
    logSuccess(data: PowerOutageInfo[] | PriozeryeRow[], metadata?: Partial<ParserCallLog["metadata"]>): Promise<string>;
    /**
     * Завершение вызова с ошибкой
     */
    logError(error: Error, metadata?: Partial<ParserCallLog["metadata"]>): Promise<string>;
    /**
     * Получение ID текущего вызова
     */
    getCallId(): string;
}
//# sourceMappingURL=callLogger.d.ts.map