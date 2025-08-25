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

# Запуск нужной команды
case "$1" in
    "bot")
        echo "🤖 Запуск Telegram бота..."
        exec node dist/bot.js
        ;;
    "api")
        echo "🔧 Запуск API демо..."
        exec node dist/index.js
        ;;
    "test")
        echo "🧪 Запуск тестов..."
        exec node dist/tests/test.js
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
        exec node dist/bot.js
        ;;
esac
