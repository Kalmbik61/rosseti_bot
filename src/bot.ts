/**
 * Запуск Telegram бота для мониторинга отключений
 */

import { PowerOutageBot } from "./telegramBot.js";
import { logger } from "./utils/index.js";
import { BOT_TOKEN } from "./config.js";

if (!BOT_TOKEN) {
  console.error(
    "❌ Ошибка: Не указан TELEGRAM_BOT_TOKEN в переменных окружения"
  );
  console.log("\n📋 Способы установки токена:");
  console.log("1. Создайте файл .env в корне проекта и добавьте:");
  console.log("   TELEGRAM_BOT_TOKEN=your_bot_token_here");
  console.log("2. Или экспортируйте переменную:");
  console.log("   export TELEGRAM_BOT_TOKEN=your_bot_token_here");
  console.log("\n💡 Получите токен у @BotFather в Telegram");
  process.exit(1);
}

// Создаем и запускаем бота
const bot = new PowerOutageBot(BOT_TOKEN);

// Обработка сигналов для корректного завершения
process.on("SIGINT", () => {
  console.log("\n🛑 Получен сигнал завершения...");
  bot.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Получен сигнал завершения...");
  bot.stop();
  process.exit(0);
});

// Обработка необработанных ошибок
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Необработанная ошибка Promise:", reason);
  console.error("Необработанная ошибка Promise:", reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Необработанное исключение:", error);
  console.error("Необработанное исключение:", error);
  bot.stop();
  process.exit(1);
});

// Запускаем бота
console.log("🚀 Запуск Telegram бота для мониторинга отключений...");
logger.info("Запуск Telegram бота");

try {
  bot.start();
  console.log("✅ Бот успешно запущен. Нажмите Ctrl+C для остановки.");
} catch (error) {
  console.error("❌ Ошибка при запуске бота:", error);
  logger.error("Ошибка при запуске бота:", error);
  process.exit(1);
}
