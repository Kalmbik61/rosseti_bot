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
    echo "  backup-db     - Создать бэкап только базы данных"
    echo "  backup-list   - Показать список бэкапов"
    echo "  backup-auto   - Настроить автоматические бэкапы"
    echo "  restore       - Восстановить данные из бэкапа"
    echo "  restore-db    - Восстановить только базу данных"
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

# Создание полного бэкапа
create_backup() {
    local backup_dir="backups"
    local backup_file="$backup_dir/rosseti-full-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    print_message "Создание полного бэкапа..."
    mkdir -p "$backup_dir"
    
    tar -czf "$backup_file" data/ logs/ reports/ 2>/dev/null || true
    
    if [ -f "$backup_file" ]; then
        local size=$(du -h "$backup_file" | cut -f1)
        print_success "Полный бэкап создан: $backup_file ($size)"
    else
        print_error "Ошибка создания бэкапа"
    fi
}

# Создание бэкапа только базы данных
create_db_backup() {
    print_message "Создание бэкапа базы данных..."
    
    if docker-compose ps | grep -q "rosseti-parser.*Up"; then
        # Если контейнер запущен, используем его
        docker-compose exec rosseti-parser node -e "
            import('./dist/src/utils/backup.js').then(module => {
                const { backupManager } = module;
                return backupManager.createBackup();
            }).then(path => {
                console.log('Бэкап создан:', path);
            }).catch(console.error);
        "
    else
        # Если контейнер не запущен, запускаем временный
        docker-compose run --rm rosseti-parser node -e "
            import('./dist/src/utils/backup.js').then(module => {
                const { backupManager } = module;
                return backupManager.createBackup();
            }).then(path => {
                console.log('Бэкап создан:', path);
            }).catch(console.error);
        "
    fi
}

# Показать список бэкапов
list_backups() {
    print_message "Список доступных бэкапов:"
    
    echo ""
    echo "📁 Полные бэкапы (tar.gz):"
    if [ -d "backups" ] && ls backups/*.tar.gz 1> /dev/null 2>&1; then
        for backup in backups/*.tar.gz; do
            local size=$(du -h "$backup" | cut -f1)
            local date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$backup" 2>/dev/null || stat -c "%y" "$backup" 2>/dev/null | cut -d' ' -f1,2 | cut -d'.' -f1)
            printf "  %-40s %8s  %s\n" "$(basename "$backup")" "$size" "$date"
        done
    else
        echo "  Полные бэкапы не найдены"
    fi
    
    echo ""
    echo "🗄️ Бэкапы базы данных:"
    if [ -d "data/backups" ] && ls data/backups/*.db 1> /dev/null 2>&1; then
        for backup in data/backups/*.db; do
            local size=$(du -h "$backup" | cut -f1)
            local date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$backup" 2>/dev/null || stat -c "%y" "$backup" 2>/dev/null | cut -d' ' -f1,2 | cut -d'.' -f1)
            printf "  %-40s %8s  %s\n" "$(basename "$backup")" "$size" "$date"
        done
    else
        echo "  Бэкапы БД не найдены"
    fi
    
    echo ""
    
    # Показать общий размер бэкапов
    local total_size=0
    if [ -d "backups" ]; then
        total_size=$(du -sh backups 2>/dev/null | cut -f1 || echo "0")
        echo "Общий размер полных бэкапов: $total_size"
    fi
    
    if [ -d "data/backups" ]; then
        local db_size=$(du -sh data/backups 2>/dev/null | cut -f1 || echo "0")
        echo "Общий размер бэкапов БД: $db_size"
    fi
}

# Настройка автоматических бэкапов
setup_auto_backup() {
    print_message "Настройка автоматических бэкапов..."
    
    echo ""
    echo "Выберите периодичность бэкапов:"
    echo "1) Ежедневно в 3:00"
    echo "2) Каждые 6 часов"
    echo "3) Каждые 12 часов"
    echo "4) Еженедельно (воскресенье в 2:00)"
    echo "5) Показать текущие настройки cron"
    echo "6) Удалить автобэкапы"
    echo ""
    
    read -p "Выберите вариант (1-6): " choice
    
    case $choice in
        1)
            setup_cron_job "0 3 * * *" "daily"
            ;;
        2)
            setup_cron_job "0 */6 * * *" "6h"
            ;;
        3)
            setup_cron_job "0 */12 * * *" "12h"
            ;;
        4)
            setup_cron_job "0 2 * * 0" "weekly"
            ;;
        5)
            show_cron_jobs
            ;;
        6)
            remove_cron_jobs
            ;;
        *)
            print_error "Неверный выбор"
            ;;
    esac
}

# Установка cron job
setup_cron_job() {
    local schedule="$1"
    local description="$2"
    local script_path="$(pwd)/docker/manage.sh"
    local log_path="$(pwd)/logs/backup-cron.log"
    
    # Создаем директорию логов если её нет
    mkdir -p "$(pwd)/logs"
    
    # Удаляем старые задания
    remove_cron_jobs
    
    # Добавляем новое задание
    (crontab -l 2>/dev/null; echo "$schedule cd $(pwd) && $script_path backup-db >> $log_path 2>&1") | crontab -
    
    print_success "Автобэкап настроен ($description): $schedule"
    print_message "Логи бэкапов: $log_path"
}

# Показать cron задания
show_cron_jobs() {
    echo ""
    echo "Текущие cron задания для автобэкапов:"
    crontab -l 2>/dev/null | grep "manage.sh backup" || echo "Автобэкапы не настроены"
    echo ""
}

# Удалить cron задания
remove_cron_jobs() {
    local temp_cron=$(mktemp)
    crontab -l 2>/dev/null | grep -v "manage.sh backup" > "$temp_cron" || true
    crontab "$temp_cron"
    rm "$temp_cron"
    print_success "Автобэкапы отключены"
}

# Восстановление из полного бэкапа
restore_backup() {
    local backup_dir="backups"
    
    if [ ! -d "$backup_dir" ]; then
        print_error "Директория полных бэкапов не найдена"
        return 1
    fi
    
    echo "Доступные полные бэкапы:"
    ls -la "$backup_dir"/*.tar.gz 2>/dev/null || {
        print_error "Полные бэкапы не найдены"
        return 1
    }
    
    read -p "Введите имя файла бэкапа: " backup_file
    
    if [ -f "$backup_dir/$backup_file" ]; then
        print_warning "Это перезапишет текущие данные!"
        read -p "Продолжить? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_message "Восстановление из полного бэкапа..."
            
            # Останавливаем бота перед восстановлением
            if docker-compose ps | grep -q "rosseti-parser.*Up"; then
                print_message "Остановка бота..."
                docker-compose stop rosseti-parser
            fi
            
            tar -xzf "$backup_dir/$backup_file"
            print_success "Данные восстановлены из $backup_file"
            
            print_message "Запуск бота..."
            docker-compose start rosseti-parser
        fi
    else
        print_error "Файл бэкапа не найден"
    fi
}

# Восстановление базы данных
restore_db_backup() {
    local backup_dir="data/backups"
    
    if [ ! -d "$backup_dir" ]; then
        print_error "Директория бэкапов БД не найдена"
        return 1
    fi
    
    echo "Доступные бэкапы базы данных:"
    ls -la "$backup_dir"/*.db 2>/dev/null || {
        print_error "Бэкапы БД не найдены"
        return 1
    }
    
    read -p "Введите имя файла бэкапа БД: " backup_file
    
    if [ -f "$backup_dir/$backup_file" ]; then
        print_warning "Это перезапишет текущую базу данных!"
        read -p "Продолжить? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_message "Восстановление базы данных..."
            
            # Останавливаем бота
            local was_running=false
            if docker-compose ps | grep -q "rosseti-parser.*Up"; then
                was_running=true
                print_message "Остановка бота..."
                docker-compose stop rosseti-parser
            fi
            
            # Восстанавливаем БД через утилиту
            docker-compose run --rm rosseti-parser node -e "
                import('./dist/src/utils/backup.js').then(module => {
                    const { backupManager } = module;
                    return backupManager.restoreFromBackup('/app/data/backups/$backup_file');
                }).then(() => {
                    console.log('База данных восстановлена успешно');
                }).catch(console.error);
            "
            
            # Запускаем бота если он был запущен
            if [ "$was_running" = true ]; then
                print_message "Запуск бота..."
                docker-compose start rosseti-parser
            fi
            
            print_success "База данных восстановлена из $backup_file"
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
        "backup-db")
            create_db_backup
            ;;
        "backup-list")
            list_backups
            ;;
        "backup-auto")
            setup_auto_backup
            ;;
        "restore")
            restore_backup
            ;;
        "restore-db")
            restore_db_backup
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
