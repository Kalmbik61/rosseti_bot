/**
 * Экспорт всех утилит
 */

// Конфигурация
export {
  buildSearchUrl,
  formatDate,
  MY_PLACE,
  ADMIN_CHAT_IDS,
} from "../config.js";

// Логгер
export { logger } from "./logger.js";

// Поиск и обработка
export { findMyPlaceInRow, findPriozeryeInRow } from "./search.js";

// Извлечение данных
export { extractPowerOutageInfo } from "./extractor.js";

// Отчеты
export { formatPriozeryeReport } from "./reports.js";

// Markdown
export {
  createPowerOutageMarkdownReport,
  savePowerOutageReport,
  escapeMarkdown,
  escapeMarkdownV2,
} from "./markdown.js";

// Логирование вызовов
export { ParserCallLogger, saveParserCallLog } from "./callLogger.js";

// Работа с датами
export {
  isOutageValid,
  filterValidOutages,
  formatDateForDisplay,
} from "./dateUtils.js";

// Дедупликация
export {
  deduplicateOutagesByDate,
  deduplicateOutagesByDateAndPlace,
  getDeduplicationStats,
} from "./deduplication.js";

// Работа с файлами
export {
  getLatestReport,
  getLatestReportInfo,
  rotateReports,
} from "./fileUtils.js";

// Подписки
export { SubscriptionManager } from "./subscriptions.js";
export { DatabaseManager } from "./database.js";
export type { Subscriber } from "./subscriptions.js";
export type { PowerOutageRecord } from "./database.js";
export type {
  SubscriberRecord,
  SubscriptionSettings,
  LastCheckRecord,
} from "./database.js";

// Типы
export type {
  PriozeryeRow,
  PriozeryeSearchResult,
  PowerOutageInfo,
  ParserCallLog,
} from "./types.js";
