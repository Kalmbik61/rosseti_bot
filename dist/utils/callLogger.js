/**
 * Утилита для логирования вызовов парсера
 */
/**
 * Создание уникального ID для вызова
 */
function generateCallId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
}
/**
 * Создание имени файла лога
 */
function generateLogFilename(callId) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "-"); // HH-MM-SS
    return `parser-call-${dateStr}-${timeStr}-${callId}.json`;
}
/**
 * Сохранение лога вызова в файл
 */
export async function saveParserCallLog(log) {
    try {
        const fs = await import("fs/promises");
        const path = await import("path");
        // Убеждаемся что папка logs существует
        const logsDir = path.resolve("logs");
        await fs.mkdir(logsDir, { recursive: true });
        const filename = generateLogFilename(log.callId);
        const filepath = path.join(logsDir, filename);
        // Форматируем JSON с отступами для читаемости
        const jsonContent = JSON.stringify(log, null, 2);
        await fs.writeFile(filepath, jsonContent, "utf-8");
        console.log(`📝 Лог вызова сохранен: ${filepath}`);
        return filepath;
    }
    catch (error) {
        console.error("❌ Ошибка сохранения лога:", error.message);
        throw error;
    }
}
/**
 * Создание логгера для отслеживания вызовов парсера
 */
export class ParserCallLogger {
    callId;
    startTime;
    callType;
    request;
    searchTarget;
    constructor(callType, url, method = "GET", parameters, searchTarget = "Unknown") {
        this.callId = generateCallId();
        this.startTime = Date.now();
        this.callType = callType;
        this.request = {
            url,
            method,
            ...(parameters && { parameters }),
        };
        this.searchTarget = searchTarget;
        console.log(`🚀 Начат вызов парсера [${this.callId}]: ${callType}`);
    }
    /**
     * Завершение вызова с успешным результатом
     */
    async logSuccess(data, metadata) {
        const duration = Date.now() - this.startTime;
        const log = {
            callId: this.callId,
            timestamp: new Date(this.startTime).toISOString(),
            callType: this.callType,
            request: this.request,
            response: {
                success: true,
                duration,
                itemsFound: data.length,
                data,
            },
            metadata: {
                searchTarget: this.searchTarget,
                ...metadata,
            },
        };
        console.log(`✅ Вызов завершен успешно [${this.callId}]: найдено ${data.length} элементов за ${duration}мс`);
        return await saveParserCallLog(log);
    }
    /**
     * Завершение вызова с ошибкой
     */
    async logError(error, metadata) {
        const duration = Date.now() - this.startTime;
        const log = {
            callId: this.callId,
            timestamp: new Date(this.startTime).toISOString(),
            callType: this.callType,
            request: this.request,
            response: {
                success: false,
                duration,
                itemsFound: 0,
                error: error.message,
            },
            metadata: {
                searchTarget: this.searchTarget,
                ...metadata,
            },
        };
        console.log(`❌ Вызов завершен с ошибкой [${this.callId}]: ${error.message} за ${duration}мс`);
        return await saveParserCallLog(log);
    }
    /**
     * Получение ID текущего вызова
     */
    getCallId() {
        return this.callId;
    }
}
//# sourceMappingURL=callLogger.js.map