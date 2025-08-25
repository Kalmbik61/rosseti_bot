/**
 * Утилиты для создания текстовых отчетов
 */
import { MY_PLACE } from "../config.js";
/**
 * Создание отчета в простом формате
 */
export function formatPriozeryeReport(rows) {
    if (rows.length === 0) {
        return `❌ Данные для ${MY_PLACE} не найдены`;
    }
    let report = `📊 Найдено записей для ${MY_PLACE}: ${rows.length}\n\n`;
    rows.forEach((row, index) => {
        report += `${index + 1}. ${row.settlementVariant}\n`;
        // Показываем все колонки с данными
        row.columns.forEach((col, colIndex) => {
            if (col.trim()) {
                const marker = colIndex === row.foundInColumn ? "👉 " : "   ";
                report += `${marker}Колонка ${colIndex + 1}: ${col}\n`;
            }
        });
        report += "\n";
    });
    // Статистика по вариантам написания
    const variants = rows.reduce((acc, row) => {
        acc[row.settlementVariant] = (acc[row.settlementVariant] || 0) + 1;
        return acc;
    }, {});
    report += "📈 Варианты написания:\n";
    Object.entries(variants).forEach(([variant, count]) => {
        report += `   ${variant}: ${count} записей\n`;
    });
    return report;
}
//# sourceMappingURL=reports.js.map