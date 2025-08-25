/**
 * Простая конфигурация для парсера Россети
 */
import dotenv from "dotenv";
// Загружаем переменные из .env файла
dotenv.config();
// Получаем токен бота из переменной окружения
export const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const ADMIN_CHAT_ID = Number(process.env.TELEGRAM_ADMIN_CHAT);
export const MY_PLACE = "Приозерье";
/**
 * Список chat_id администраторов бота
 * Добавьте сюда свой chat_id для получения админских прав
 */
export const ADMIN_CHAT_IDS = [
    // Добавьте свой chat_id сюда
    // Пример: 123456789
    ADMIN_CHAT_ID,
];
/**
 * Форматирование даты для URL
 */
export function formatDate(date) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}
/**
 * Создание URL для поиска
 */
/**
 * Кодирование строки в windows-1251 для URL
 */
function encodeWindows1251(str) {
    // Простая карта для основных русских символов в windows-1251
    const charMap = {
        А: "%C0",
        Б: "%C1",
        В: "%C2",
        Г: "%C3",
        Д: "%C4",
        Е: "%C5",
        Ё: "%A8",
        Ж: "%C6",
        З: "%C7",
        И: "%C8",
        Й: "%C9",
        К: "%CA",
        Л: "%CB",
        М: "%CC",
        Н: "%CD",
        О: "%CE",
        П: "%CF",
        Р: "%D0",
        С: "%D1",
        Т: "%D2",
        У: "%D3",
        Ф: "%D4",
        Х: "%D5",
        Ц: "%D6",
        Ч: "%D7",
        Ш: "%D8",
        Щ: "%D9",
        Ъ: "%DA",
        Ы: "%DB",
        Ь: "%DC",
        Э: "%DD",
        Ю: "%DE",
        Я: "%DF",
        а: "%E0",
        б: "%E1",
        в: "%E2",
        г: "%E3",
        д: "%E4",
        е: "%E5",
        ё: "%B8",
        ж: "%E6",
        з: "%E7",
        и: "%E8",
        й: "%E9",
        к: "%EA",
        л: "%EB",
        м: "%EC",
        н: "%ED",
        о: "%EE",
        п: "%EF",
        р: "%F0",
        с: "%F1",
        т: "%F2",
        у: "%F3",
        ф: "%F4",
        х: "%F5",
        ц: "%F6",
        ч: "%F7",
        ш: "%F8",
        щ: "%F9",
        ъ: "%FA",
        ы: "%FB",
        ь: "%FC",
        э: "%FD",
        ю: "%FE",
        я: "%FF",
        " ": "%20",
        ".": ".",
    };
    return str
        .split("")
        .map((char) => charMap[char] || char)
        .join("");
}
export function buildSearchUrl(dateFrom, dateTo, district = "Мясниковский", places = "х.Ленинаван") {
    const baseUrl = "https://dp.rosseti-yug.ru/res/";
    // Формируем URL с кодированием windows-1251
    const params = [
        "state=549",
        `district=${encodeWindows1251(district)}`,
        `places=${encodeWindows1251(places)}`,
        "street=",
        `dateFrom=${formatDate(dateFrom)}`,
        `dateTo=${formatDate(dateTo)}`,
        "filter_set=%CF%EE%EA%E0%E7%E0%F2%FC", // "Показать"
    ];
    return baseUrl + "?" + params.join("&");
}
//# sourceMappingURL=config.js.map