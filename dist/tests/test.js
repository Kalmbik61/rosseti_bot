/**
 * Простой тест для поиска Приозерья
 */
import { findPriozeryeInTables, quickFindPriozerie } from "../parser.js";
import { buildSearchUrl, formatPriozeryeReport } from "../utils/index.js";
async function testSimplePriozerie() {
    console.log("🔍 Простой поиск данных для Приозерья\n");
    try {
        // Тест 1: Быстрый поиск за 30 дней
        console.log("1️⃣ Быстрый поиск за 30 дней:");
        const quickResults = await quickFindPriozerie(30);
        console.log(`Найдено строк: ${quickResults.length}`);
        if (quickResults.length > 0) {
            const firstResult = quickResults[0];
            console.log("Первая найденная строка:");
            console.log(`  Вариант: ${firstResult.settlementVariant}`);
            console.log(`  Колонок: ${firstResult.columns.length}`);
            console.log(`  Найдено в колонке: ${firstResult.foundInColumn + 1}`);
            console.log("  Данные:", firstResult.columns.filter((col) => col.trim()));
        }
        // Тест 2: Поиск с конкретными датами
        console.log("\n2️⃣ Поиск с конкретными датами:");
        const dateFrom = new Date("2025-08-01");
        const dateTo = new Date("2025-08-31");
        const url = buildSearchUrl(dateFrom, dateTo);
        console.log(`URL: ${url}`);
        const detailedResult = await findPriozeryeInTables(url);
        console.log(`Всего строк в таблицах: ${detailedResult.totalRows}`);
        console.log(`Найдено совпадений: ${detailedResult.matchesFound}`);
        // Создаем отчет
        const report = formatPriozeryeReport(detailedResult.rows);
        console.log("\n📋 ОТЧЕТ:");
        console.log(report);
        // Сохраняем результаты
        if (detailedResult.rows.length > 0) {
            await saveSimpleResults(detailedResult.rows);
        }
        console.log("\n✅ Тест завершен успешно");
    }
    catch (error) {
        console.error("❌ Ошибка:", error.message);
    }
}
/**
 * Сохранение результатов в простом формате
 */
async function saveSimpleResults(rows) {
    try {
        const { promises: fs } = await import("fs");
        await fs.mkdir("reports/test-results", { recursive: true });
        const filename = `priozerie-simple-${new Date().toISOString().split("T")[0]}.json`;
        const filePath = `reports/test-results/${filename}`;
        const saveData = {
            timestamp: new Date().toISOString(),
            searchTarget: "Приозерье/Приозёрье",
            totalFound: rows.length,
            rows: rows.map((row) => ({
                variant: row.settlementVariant,
                foundInColumn: row.foundInColumn,
                columns: row.columns,
                // rawHtml исключаем для экономии места
            })),
        };
        await fs.writeFile(filePath, JSON.stringify(saveData, null, 2), "utf8");
        console.log(`💾 Результаты сохранены: ${filePath}`);
    }
    catch (error) {
        console.error("⚠️ Ошибка сохранения:", error.message);
    }
}
// Запуск теста
if (import.meta.url === `file://${process.argv[1]}`) {
    testSimplePriozerie().catch(console.error);
}
//# sourceMappingURL=test.js.map