/**
 * Тест аналитики пользователей: запись взаимодействий и вывод метрик
 */

import { DatabaseManager } from "../utils/database.js";

async function runUserAnalyticsTest(): Promise<void> {
  const db = new DatabaseManager();
  await db.initialize();

  // Эмулируем взаимодействия от нескольких пользователей
  const now = new Date();

  const interactions: Array<{
    chatId: number;
    username?: string;
    firstName?: string;
    command: string;
    offsetDays?: number;
  }> = [
    { chatId: 101, username: "alice", firstName: "Alice", command: "/start" },
    { chatId: 101, username: "alice", firstName: "Alice", command: "/search" },
    { chatId: 102, username: "bob", firstName: "Bob", command: "/start" },
    { chatId: 102, username: "bob", firstName: "Bob", command: "/get" },
    {
      chatId: 103,
      username: "carol",
      firstName: "Carol",
      command: "/search_new",
    },
    // Старые взаимодействия (неделя назад)
    {
      chatId: 104,
      username: "dave",
      firstName: "Dave",
      command: "/start",
      offsetDays: 7,
    },
    {
      chatId: 104,
      username: "dave",
      firstName: "Dave",
      command: "/help",
      offsetDays: 7,
    },
  ];

  // Вставляем записи (используем публичный метод для актуальной даты)
  for (const i of interactions) {
    // Запись текущим временем через публичный метод
    db.recordUserInteraction(i.chatId, i.command, i.username, i.firstName);
  }

  // Получаем и печатаем метрики
  const stats = db.getUserStats();
  /* eslint-disable no-console */
  console.log("\n👥 Метрики пользователей:");
  console.log(`• Всего пользователей: ${stats.totalUsers}`);
  console.log(`• Активных за месяц: ${stats.activeThisMonth}`);
  console.log(`• Активных за неделю: ${stats.activeThisWeek}`);
  console.log(`• Активных сегодня: ${stats.activeToday}`);
  console.log(`• Новых за месяц: ${stats.newUsersThisMonth}`);
  console.log(`• Новых за неделю: ${stats.newUsersThisWeek}`);
  console.log(`• Новых сегодня: ${stats.newUsersToday}`);

  if (stats.topCommands.length > 0) {
    console.log("\n📋 Топ команд (за месяц):");
    for (const { command, count } of stats.topCommands) {
      console.log(`- ${command}: ${count}`);
    }
  }

  db.close();
}

// Запуск
runUserAnalyticsTest().catch((err) => {
  console.error("❌ Ошибка теста аналитики:", err);
  process.exit(1);
});
