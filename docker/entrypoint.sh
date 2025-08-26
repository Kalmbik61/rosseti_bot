#!/bin/bash

# Entrypoint script для Telegram бота парсера Россети

set -e

echo "🚀 Запуск контейнера парсера Россети..."

# Проверка обязательных переменных окружения
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "❌ Ошибка: Не установлена переменная TELEGRAM_BOT_TOKEN"
    echo "💡 Убедитесь, что вы создали .env файл с токеном бота"
    exit 1
fi

# Создание необходимых директорий если они не существуют
mkdir -p /app/data /app/logs /app/reports

# Проверка доступности директорий
if [ ! -w /app/data ]; then
    echo "❌ Ошибка: Нет прав записи в директорию /app/data"
    exit 1
fi

if [ ! -w /app/logs ]; then
    echo "❌ Ошибка: Нет прав записи в директорию /app/logs"
    exit 1
fi

if [ ! -w /app/reports ]; then
    echo "❌ Ошибка: Нет прав записи в директорию /app/reports"
    exit 1
fi

echo "✅ Проверки прошли успешно"

# Проверка и установка Playwright браузеров при необходимости
CHROMIUM_PATH="/home/botuser/.cache/ms-playwright/chromium_headless_shell"
if [ ! -d "$CHROMIUM_PATH" ] || [ -z "$(ls -A $CHROMIUM_PATH 2>/dev/null)" ]; then
    echo "🌐 Установка Playwright браузеров..."
    npx playwright install chromium --with-deps
    echo "✅ Playwright браузеры установлены"
else
    echo "✅ Playwright браузеры уже установлены"
fi

# Запуск нужной команды
case "$1" in
    "bot")
        echo "🤖 Запуск Telegram бота..."
        exec node public/bot.js
        ;;
    "api")
        echo "🔧 Запуск API демо..."
        exec node public/index.js
        ;;
    "test")
        echo "🧪 Запуск тестов..."
        exec node public/tests/test.js
        ;;
    "bash")
        echo "🐚 Запуск bash сессии..."
        exec /bin/bash
        ;;
    *)
        echo "❓ Неизвестная команда: $1"
        echo "📋 Доступные команды:"
        echo "  bot   - Запуск Telegram бота (по умолчанию)"
        echo "  api   - Запуск API демо"
        echo "  test  - Запуск тестов"
        echo "  bash  - Запуск bash сессии"
        echo ""
        echo "🤖 Запуск бота по умолчанию..."
        exec node public/bot.js
        ;;
esac
