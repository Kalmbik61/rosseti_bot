/**
 * Простое логирование для парсера Приозерья
 */
import winston from "winston";
export const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(winston.format.timestamp({
        format: "YYYY-MM-DD HH:mm:ss",
    }), winston.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
    ],
});
//# sourceMappingURL=logger.js.map