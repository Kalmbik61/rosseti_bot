/**
 * Утилиты для работы с датами
 */
/**
 * Проверка является ли отключение актуальным (сегодня или в будущем)
 */
export function isOutageValid(outageDate) {
    if (!outageDate || outageDate.trim() === "-" || outageDate.trim() === "") {
        return false;
    }
    try {
        // Извлекаем дату из строки (может содержать время)
        const dateMatch = outageDate.match(/(\d{1,2}\.?\d{1,2}\.?\d{4})/);
        if (!dateMatch) {
            return false;
        }
        const dateStr = dateMatch[1];
        if (!dateStr) {
            return false;
        }
        const dateParts = dateStr.split(".");
        if (dateParts.length !== 3 ||
            !dateParts[0] ||
            !dateParts[1] ||
            !dateParts[2]) {
            return false;
        }
        // Парсим дату в формате дд.мм.гггг
        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1; // месяцы в JS начинаются с 0
        const year = parseInt(dateParts[2], 10);
        const outageDateTime = new Date(year, month, day);
        const today = new Date();
        // Обнуляем время для сравнения только дат
        today.setHours(0, 0, 0, 0);
        outageDateTime.setHours(0, 0, 0, 0);
        // Отключение валидно если дата сегодня или в будущем
        return outageDateTime >= today;
    }
    catch (error) {
        console.warn(`Не удалось распарсить дату отключения: ${outageDate}`);
        return false;
    }
}
/**
 * Фильтрация отключений по актуальности
 */
export function filterValidOutages(outages) {
    return outages.filter((outage) => isOutageValid(outage.dateFrom));
}
/**
 * Форматирование даты для отображения
 */
export function formatDateForDisplay(date) {
    return date.toLocaleDateString("ru-RU", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
//# sourceMappingURL=dateUtils.js.map