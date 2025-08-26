/**
 * Запуск Telegram бота для мониторинга отключений
 */

import { PowerOutageBot } from "./telegramBot.js";
import { logger } from "./utils/index.js";
import { BOT_TOKEN } from "./config.js";
import fs from "fs";
import path from "path";

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

// 🛡️ Защита от множественных экземпляров бота
const INSTANCE_ID = process.env.BOT_INSTANCE_ID || "default";
const LOCK_FILE = path.join(process.cwd(), "data", `.bot_lock_${INSTANCE_ID}`);

// Проверяем, не запущен ли уже бот
if (fs.existsSync(LOCK_FILE)) {
  try {
    const lockContent = fs.readFileSync(LOCK_FILE, "utf8");
    const { pid, startTime } = JSON.parse(lockContent);

    // Проверяем, существует ли процесс
    try {
      process.kill(pid, 0); // Проверка без реального убийства процесса
      console.error(
        `❌ Бот уже запущен с PID ${pid} (instance: ${INSTANCE_ID})`
      );
      console.log("🔍 Если это ошибка, удалите файл блокировки:");
      console.log(`   rm ${LOCK_FILE}`);
      process.exit(1);
    } catch (error) {
      // Процесс не существует, удаляем старый lock файл
      logger.info(`Удаляем устаревший lock файл для PID ${pid}`);
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (error) {
    // Некорректный lock файл, удаляем
    fs.unlinkSync(LOCK_FILE);
  }
}

// Создаем lock файл
const lockData = {
  pid: process.pid,
  startTime: new Date().toISOString(),
  instanceId: INSTANCE_ID,
  botToken: BOT_TOKEN.substring(0, 10) + "...", // Частичный токен для идентификации
};

fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
fs.writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2));

logger.info(
  `🔒 Создан lock файл для экземпляра ${INSTANCE_ID} (PID: ${process.pid})`
);

// Создаем и запускаем бота
const bot = new PowerOutageBot(BOT_TOKEN);

// Функция очистки lock файла
const cleanupLockFile = () => {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
      logger.info(`🔓 Lock файл удален: ${LOCK_FILE}`);
    }
  } catch (error) {
    logger.error("Ошибка при удалении lock файла:", error);
  }
};

// Обработка сигналов для корректного завершения
process.on("SIGINT", () => {
  console.log("\n🛑 Получен сигнал завершения...");
  bot.stop();
  cleanupLockFile();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Получен сигнал завершения...");
  bot.stop();
  cleanupLockFile();
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
  cleanupLockFile();
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
