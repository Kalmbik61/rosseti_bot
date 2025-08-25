#!/bin/bash

# Скрипт для запуска Telegram бота в Docker контейнере

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функция для вывода сообщений
print_message() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Проверка наличия .env файла
check_env_file() {
    if [ ! -f ".env" ]; then
        print_error ".env файл не найден!"
        print_message "Создайте .env файл на основе env.example:"
        echo -e "${YELLOW}cp env.example .env${NC}"
        echo -e "${YELLOW}nano .env${NC}"
        echo ""
        print_message "Добавьте ваш TELEGRAM_BOT_TOKEN в .env файл"
        exit 1
    fi
}

# Проверка наличия токена в .env
check_bot_token() {
    if ! grep -q "TELEGRAM_BOT_TOKEN=" .env || grep -q "TELEGRAM_BOT_TOKEN=your_bot_token_here" .env; then
        print_error "TELEGRAM_BOT_TOKEN не настроен в .env файле!"
        print_message "Отредактируйте .env файл и добавьте действительный токен бота"
        exit 1
    fi
}

# Создание необходимых директорий
create_directories() {
    print_message "Создание необходимых директорий..."
    mkdir -p data logs reports
    print_success "Директории созданы"
}

# Остановка существующих контейнеров
stop_existing() {
    print_message "Остановка существующих контейнеров..."
    docker-compose down --remove-orphans 2>/dev/null || true
    print_success "Существующие контейнеры остановлены"
}

# Сборка образа
build_image() {
    print_message "Сборка Docker образа..."
    if docker-compose build; then
        print_success "Образ успешно собран"
    else
        print_error "Ошибка при сборке образа"
        exit 1
    fi
}

# Запуск бота
start_bot() {
    print_message "Запуск Telegram бота..."
    if docker-compose up -d rosseti-parser; then
        print_success "Бот успешно запущен"
        print_message "Для просмотра логов используйте: docker-compose logs -f rosseti-parser"
    else
        print_error "Ошибка при запуске бота"
        exit 1
    fi
}

# Показать статус
show_status() {
    echo ""
    print_message "Статус контейнеров:"
    docker-compose ps
    echo ""
    print_message "Для просмотра логов:"
    echo "docker-compose logs -f rosseti-parser"
    echo ""
    print_message "Для остановки:"
    echo "docker-compose down"
}

# Главная функция
main() {
    print_message "🚀 Запуск Telegram бота парсера Россети"
    echo ""
    
    check_env_file
    check_bot_token
    create_directories
    stop_existing
    build_image
    start_bot
    show_status
    
    print_success "🎉 Бот успешно запущен!"
}

# Обработка аргументов командной строки
case "${1:-}" in
    "check")
        check_env_file
        check_bot_token
        print_success "Конфигурация корректна"
        ;;
    "build")
        build_image
        ;;
    "stop")
        print_message "Остановка бота..."
        docker-compose down
        print_success "Бот остановлен"
        ;;
    "restart")
        print_message "Перезапуск бота..."
        docker-compose restart rosseti-parser
        print_success "Бот перезапущен"
        ;;
    "logs")
        docker-compose logs -f rosseti-parser
        ;;
    "status")
        show_status
        ;;
    *)
        main
        ;;
esac
