#!/bin/bash

# Скрипт для локального тестирования Docker

echo "🐳 Тестирование Docker локально..."

# Проверка наличия .env файла
if [ ! -f ".env" ]; then
    echo "❌ Файл .env не найден!"
    echo "💡 Скопируйте: cp env.example .env"
    echo "💡 И отредактируйте токены"
    exit 1
fi

# Проверка Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен!"
    exit 1
fi

echo "✅ Docker найден"

# Сборка образа
echo "🔨 Сборка Docker образа..."
docker build -t rosseti-parser-test .

if [ $? -ne 0 ]; then
    echo "❌ Ошибка сборки образа!"
    exit 1
fi

echo "✅ Образ собран успешно"

# Запуск контейнера
echo "🚀 Запуск контейнера..."
docker run -d \
  --name rosseti-parser-test \
  --env-file .env \
  -e NODE_ENV=development \
  rosseti-parser-test

if [ $? -ne 0 ]; then
    echo "❌ Ошибка запуска контейнера!"
    exit 1
fi

echo "✅ Контейнер запущен"

# Ожидание запуска
echo "⏳ Ожидание инициализации (10 секунд)..."
sleep 10

# Проверка статуса
echo "📊 Статус контейнера:"
docker ps | grep rosseti-parser-test

# Проверка логов
echo "📜 Последние логи:"
docker logs rosseti-parser-test --tail 20

# Проверка Playwright
echo "🌐 Проверка Playwright браузеров:"
docker exec rosseti-parser-test find /home/botuser/.cache/ms-playwright -name '*chromium*' 2>/dev/null || echo "Браузеры не найдены"

echo ""
echo "🔧 Команды для дальнейшей отладки:"
echo "docker logs rosseti-parser-test -f    # Просмотр логов"
echo "docker exec -it rosseti-parser-test bash    # Вход в контейнер"
echo "docker stop rosseti-parser-test && docker rm rosseti-parser-test    # Остановка и удаление"

echo ""
echo "✅ Тест завершен. Проверьте логи выше на наличие ошибок."
