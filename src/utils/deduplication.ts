/**
 * Утилиты для дедупликации данных об отключениях
 */

import type { PowerOutageInfo } from "./types.js";
import { logger } from "./logger.js";

/**
 * Дедупликация отключений по дате для Приозерья
 * Оставляет только уникальные записи по дате для интересующих нас мест
 */
export function deduplicateOutagesByDate(
  outages: PowerOutageInfo[]
): PowerOutageInfo[] {
  if (outages.length === 0) {
    return outages;
  }

  const dateMap = new Map<string, PowerOutageInfo>();
  let removedCount = 0;

  for (const outage of outages) {
    // Создаем ключ для дедупликации на основе даты
    const dateKey = extractDateKey(outage.dateFrom);

    if (dateKey) {
      if (dateMap.has(dateKey)) {
        // Дубликат найден - пропускаем
        removedCount++;
        logger.debug(
          `Дедупликация: пропущен дубликат для даты ${dateKey}, место: ${outage.place}`
        );
      } else {
        // Первая запись для этой даты
        dateMap.set(dateKey, outage);
      }
    } else {
      // Если не удалось извлечь дату, оставляем запись
      logger.warn(
        `Дедупликация: не удалось извлечь дату из "${outage.dateFrom}", оставляем запись`
      );
      // Используем полную строку как ключ для таких случаев
      const fallbackKey = `no_date_${JSON.stringify(outage)}`;
      if (!dateMap.has(fallbackKey)) {
        dateMap.set(fallbackKey, outage);
      }
    }
  }

  const deduplicated = Array.from(dateMap.values());

  if (removedCount > 0) {
    logger.info(
      `Дедупликация: удалено ${removedCount} дубликатов, осталось ${deduplicated.length} уникальных записей`
    );
  }

  return deduplicated;
}

/**
 * Извлечение ключа даты для дедупликации
 * Парсит различные форматы дат и возвращает нормализованный ключ
 */
function extractDateKey(dateString: string): string | null {
  if (!dateString || dateString.trim() === "-" || dateString.trim() === "") {
    return null;
  }

  try {
    // Ищем дату в формате дд.мм.гггг
    const dateMatch = dateString.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dateMatch) {
      const day = dateMatch[1]!.padStart(2, "0");
      const month = dateMatch[2]!.padStart(2, "0");
      const year = dateMatch[3];
      return `${year}-${month}-${day}`;
    }

    // Ищем дату в формате гггг-мм-дд
    const isoMatch = dateString.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return dateString.substring(0, 10); // YYYY-MM-DD
    }

    // Ищем дату в формате дд/мм/гггг
    const slashMatch = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashMatch) {
      const day = slashMatch[1]!.padStart(2, "0");
      const month = slashMatch[2]!.padStart(2, "0");
      const year = slashMatch[3];
      return `${year}-${month}-${day}`;
    }

    // Если ничего не подошло, возвращаем null
    return null;
  } catch (error) {
    logger.warn(`Ошибка при парсинге даты "${dateString}":`, error);
    return null;
  }
}

/**
 * Дедупликация с дополнительной проверкой по месту
 * Более строгая дедупликация, учитывающая и дату, и место
 */
export function deduplicateOutagesByDateAndPlace(
  outages: PowerOutageInfo[]
): PowerOutageInfo[] {
  if (outages.length === 0) {
    return outages;
  }

  const combined = new Map<string, PowerOutageInfo>();
  let removedCount = 0;

  for (const outage of outages) {
    const dateKey = extractDateKey(outage.dateFrom);
    const placeKey = normalizePlace(outage.place);

    // Комбинированный ключ: дата + место
    const combinedKey = `${dateKey || "no_date"}_${placeKey}`;

    if (combined.has(combinedKey)) {
      removedCount++;
      logger.debug(
        `Дедупликация (дата+место): пропущен дубликат "${combinedKey}"`
      );
    } else {
      combined.set(combinedKey, outage);
    }
  }

  const deduplicated = Array.from(combined.values());

  if (removedCount > 0) {
    logger.info(
      `Дедупликация (дата+место): удалено ${removedCount} дубликатов, осталось ${deduplicated.length} записей`
    );
  }

  return deduplicated;
}

/**
 * Нормализация названия места для сравнения
 */
function normalizePlace(place: string): string {
  if (!place) return "unknown";

  return place
    .toLowerCase()
    .trim()
    .replace(/[её]/g, "е") // Приозерье = Приозёрье
    .replace(/\s+/g, "_") // пробелы в подчеркивания
    .replace(/[^а-яё\w]/g, ""); // только буквы и цифры
}

/**
 * Статистика дедупликации
 */
export function getDeduplicationStats(
  original: PowerOutageInfo[],
  deduplicated: PowerOutageInfo[]
): {
  originalCount: number;
  deduplicatedCount: number;
  removedCount: number;
  deduplicationRatio: number;
} {
  const removedCount = original.length - deduplicated.length;
  const deduplicationRatio =
    original.length > 0 ? removedCount / original.length : 0;

  return {
    originalCount: original.length,
    deduplicatedCount: deduplicated.length,
    removedCount,
    deduplicationRatio: Math.round(deduplicationRatio * 100) / 100,
  };
}
