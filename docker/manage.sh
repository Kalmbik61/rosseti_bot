#!/bin/bash

# Скрипт для управления контейнером парсера Россети

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Функции для вывода
print_header() {
    echo -e "${CYAN}================================================${NC}"
    echo -e "${CYAN} 🤖 Управление парсером Россети${NC}"
    echo -e "${CYAN}================================================${NC}"
}

print_message() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Показать помощь
show_help() {
    print_header
    echo ""
    echo -e "${YELLOW}Использование:${NC}"
    echo "  ./docker/manage.sh [команда]"
    echo ""
    echo -e "${YELLOW}Команды:${NC}"
    echo "  start         - Запустить бота"
    echo "  stop          - Остановить бота"
    echo "  restart       - Перезапустить бота"
    echo "  status        - Показать статус контейнеров"
    echo "  logs          - Показать логи бота"
    echo "  logs-follow   - Показать логи в реальном времени"
    echo "  build         - Пересобрать образ"
    echo "  shell         - Войти в контейнер (bash)"
    echo "  api           - Запустить API версию"
    echo "  test          - Запустить тесты"
    echo "  clean         - Удалить все контейнеры и образы"
    echo "  backup        - Создать бэкап данных"
    echo "  restore       - Восстановить данные из бэкапа"
    echo ""
    echo -e "${YELLOW}Примеры:${NC}"
    echo "  ./docker/manage.sh start"
    echo "  ./docker/manage.sh logs-follow"
    echo "  ./docker/manage.sh shell"
}

# Проверка наличия Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker не установлен!"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose не установлен!"
        exit 1
    fi
}

# Запуск бота
start_bot() {
    print_message "Запуск Telegram бота..."
    docker-compose up -d rosseti-parser
    print_success "Бот запущен"
    sleep 3
    show_status
}

# Остановка бота
stop_bot() {
    print_message "Остановка бота..."
    docker-compose down
    print_success "Бот остановлен"
}

# Перезапуск бота
restart_bot() {
    print_message "Перезапуск бота..."
    docker-compose restart rosseti-parser
    print_success "Бот перезапущен"
    sleep 3
    show_status
}

# Статус контейнеров
show_status() {
    print_message "Статус контейнеров:"
    docker-compose ps
    echo ""
    
    # Проверка здоровья контейнера
    if docker-compose ps | grep -q "rosseti-parser.*Up"; then
        print_success "Бот работает"
        
        # Показать использование ресурсов
        container_id=$(docker-compose ps -q rosseti-parser)
        if [ -n "$container_id" ]; then
            echo ""
            print_message "Использование ресурсов:"
            docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" $container_id
        fi
    else
        print_warning "Бот не запущен"
    fi
}

# Показать логи
show_logs() {
    print_message "Последние 100 строк логов:"
    docker-compose logs --tail=100 rosseti-parser
}

# Показать логи в реальном времени
follow_logs() {
    print_message "Логи в реальном времени (Ctrl+C для выхода):"
    docker-compose logs -f rosseti-parser
}

# Пересборка образа
build_image() {
    print_message "Пересборка образа..."
    docker-compose build --no-cache rosseti-parser
    print_success "Образ пересобран"
}

# Войти в контейнер
enter_shell() {
    print_message "Вход в контейнер..."
    if docker-compose ps | grep -q "rosseti-parser.*Up"; then
        docker-compose exec rosseti-parser bash
    else
        print_warning "Контейнер не запущен. Запускаю временный контейнер..."
        docker-compose run --rm rosseti-parser bash
    fi
}

# Запуск API
start_api() {
    print_message "Запуск API версии..."
    docker-compose --profile api up -d rosseti-api
    print_success "API запущен на порту 3000"
}

# Запуск тестов
run_tests() {
    print_message "Запуск тестов..."
    docker-compose run --rm rosseti-parser test
}

# Очистка всех контейнеров и образов
clean_all() {
    print_warning "Это удалит ВСЕ контейнеры и образы проекта!"
    read -p "Продолжить? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_message "Остановка и удаление контейнеров..."
        docker-compose down --volumes --remove-orphans
        
        print_message "Удаление образов..."
        docker images | grep rosseti | awk '{print $3}' | xargs -r docker rmi -f
        
        print_success "Очистка завершена"
    else
        print_message "Операция отменена"
    fi
}

# Создание бэкапа
create_backup() {
    local backup_dir="backups"
    local backup_file="$backup_dir/rosseti-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    print_message "Создание бэкапа..."
    mkdir -p "$backup_dir"
    
    tar -czf "$backup_file" data/ logs/ reports/ 2>/dev/null || true
    
    if [ -f "$backup_file" ]; then
        print_success "Бэкап создан: $backup_file"
    else
        print_error "Ошибка создания бэкапа"
    fi
}

# Восстановление из бэкапа
restore_backup() {
    local backup_dir="backups"
    
    if [ ! -d "$backup_dir" ]; then
        print_error "Директория бэкапов не найдена"
        return 1
    fi
    
    echo "Доступные бэкапы:"
    ls -la "$backup_dir"/*.tar.gz 2>/dev/null || {
        print_error "Бэкапы не найдены"
        return 1
    }
    
    read -p "Введите имя файла бэкапа: " backup_file
    
    if [ -f "$backup_dir/$backup_file" ]; then
        print_warning "Это перезапишет текущие данные!"
        read -p "Продолжить? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_message "Восстановление из бэкапа..."
            tar -xzf "$backup_dir/$backup_file"
            print_success "Данные восстановлены из $backup_file"
        fi
    else
        print_error "Файл бэкапа не найден"
    fi
}

# Главная функция
main() {
    check_docker
    
    case "${1:-}" in
        "start"|"up")
            start_bot
            ;;
        "stop"|"down")
            stop_bot
            ;;
        "restart")
            restart_bot
            ;;
        "status"|"ps")
            show_status
            ;;
        "logs")
            show_logs
            ;;
        "logs-follow"|"logs-f")
            follow_logs
            ;;
        "build")
            build_image
            ;;
        "shell"|"bash")
            enter_shell
            ;;
        "api")
            start_api
            ;;
        "test")
            run_tests
            ;;
        "clean")
            clean_all
            ;;
        "backup")
            create_backup
            ;;
        "restore")
            restore_backup
            ;;
        "help"|"--help"|"-h")
            show_help
            ;;
        *)
            print_error "Неизвестная команда: ${1:-}"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Запуск
main "$@"
