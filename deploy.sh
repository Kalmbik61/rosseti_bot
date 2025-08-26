#!/bin/bash

# 🚀 Скрипт автоматического деплоя Rosseti Parser на Ubuntu сервер

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
    echo -e "${CYAN} 🚀 Деплой Rosseti Parser${NC}"
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

# Проверка, что скрипт запущен не от root
check_user() {
    if [ "$EUID" -eq 0 ]; then
        print_error "Не запускайте этот скрипт от имени root!"
        print_message "Используйте обычного пользователя с sudo правами"
        exit 1
    fi
}

# Проверка наличия sudo
check_sudo() {
    if ! command -v sudo &> /dev/null; then
        print_error "sudo не установлен!"
        print_message "Установите sudo: apt install sudo"
        exit 1
    fi
}

# Установка Docker
install_docker() {
    if command -v docker &> /dev/null; then
        print_success "Docker уже установлен"
    else
        print_message "Установка Docker..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        sudo usermod -aG docker $USER
        rm get-docker.sh
        print_success "Docker установлен"
    fi
}

# Установка Docker Compose
install_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        print_success "Docker Compose уже установлен"
    else
        print_message "Установка Docker Compose..."
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
        print_success "Docker Compose установлен"
    fi
}

# Установка зависимостей
install_dependencies() {
    print_message "Обновление системы и установка зависимостей..."
    sudo apt update
    sudo apt install -y git htop nano curl wget unzip cron
    print_success "Зависимости установлены"
}

# Настройка проекта
setup_project() {
    print_message "Настройка проекта..."
    
    # Создание необходимых папок
    mkdir -p data logs reports backups
    
    # Установка прав
    chmod 755 data logs reports backups
    chmod +x docker/manage.sh docker/entrypoint.sh docker/start.sh
    
    print_success "Проект настроен"
}

# Настройка .env файла
setup_env() {
    if [ ! -f .env ]; then
        print_message "Создание .env файла..."
        cp env.example .env
        chmod 600 .env
        
        print_warning "ВАЖНО: Отредактируйте файл .env!"
        echo ""
        echo "Необходимо указать:"
        echo "- TELEGRAM_BOT_TOKEN (получите у @BotFather)"
        echo "- TELEGRAM_ADMIN_CHAT (ваш Chat ID)"
        echo ""
        read -p "Хотите отредактировать .env сейчас? (y/N): " edit_env
        
        if [[ $edit_env =~ ^[Yy]$ ]]; then
            nano .env
        else
            print_warning "Не забудьте отредактировать .env перед запуском!"
        fi
    else
        print_success ".env файл уже существует"
    fi
}

# Создание systemd сервиса
create_systemd_service() {
    print_message "Создание systemd сервиса..."
    
    local service_file="/etc/systemd/system/rosseti-parser.service"
    local project_dir="$(pwd)"
    local username="$(whoami)"
    
    sudo tee "$service_file" > /dev/null <<EOF
[Unit]
Description=Rosseti Parser Bot
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$project_dir
ExecStart=$project_dir/docker/manage.sh start
ExecStop=$project_dir/docker/manage.sh stop
TimeoutStartSec=0
User=$username
Group=$username

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable rosseti-parser.service
    
    print_success "Systemd сервис создан и активирован"
}

# Настройка автоматических бэкапов
setup_backups() {
    print_message "Настройка автоматических бэкапов..."
    
    # Создание папки для внешних бэкапов
    sudo mkdir -p /backup/rosseti
    sudo chown $(whoami):$(whoami) /backup/rosseti
    
    # Создание скрипта синхронизации
    local sync_script="$HOME/sync-backups.sh"
    cat > "$sync_script" <<'EOF'
#!/bin/bash
PROJECT_DIR="/home/$(whoami)/projects/parser_rosseti"
BACKUP_DIR="/backup/rosseti"
DATE=$(date +%Y-%m-%d)

mkdir -p "$BACKUP_DIR/$DATE"

if [ -d "$PROJECT_DIR/data/backups" ]; then
    cp -r "$PROJECT_DIR/data/backups"/* "$BACKUP_DIR/$DATE/" 2>/dev/null || true
fi

if [ -d "$PROJECT_DIR/backups" ]; then
    cp -r "$PROJECT_DIR/backups"/* "$BACKUP_DIR/$DATE/" 2>/dev/null || true
fi

find "$BACKUP_DIR" -type d -name "20*" -mtime +30 -exec rm -rf {} + 2>/dev/null || true

echo "Бэкапы синхронизированы: $BACKUP_DIR/$DATE"
EOF
    
    chmod +x "$sync_script"
    
    print_success "Скрипт синхронизации бэкапов создан"
    print_message "Добавьте в crontab: 0 4 * * * $sync_script"
}

# Настройка файрвола
setup_firewall() {
    print_message "Настройка базового файрвола..."
    
    sudo apt install -y ufw
    sudo ufw --force default deny incoming
    sudo ufw --force default allow outgoing
    sudo ufw --force allow ssh
    sudo ufw --force enable
    
    print_success "Файрвол настроен"
}

# Первый запуск
first_run() {
    print_message "Сборка и запуск проекта..."
    
    ./docker/manage.sh build
    ./docker/manage.sh start
    
    print_success "Проект запущен!"
    
    # Проверка статуса
    sleep 5
    ./docker/manage.sh status
}

# Проверка завершения
check_completion() {
    print_header
    print_success "Деплой завершен успешно!"
    echo ""
    echo "📋 Что дальше:"
    echo "1. Отредактируйте .env файл если не сделали этого:"
    echo "   nano .env"
    echo ""
    echo "2. Перезапустите сервис:"
    echo "   sudo systemctl restart rosseti-parser.service"
    echo ""
    echo "3. Настройте автоматические бэкапы:"
    echo "   ./docker/manage.sh backup-auto"
    echo ""
    echo "4. Добавьте синхронизацию бэкапов в crontab:"
    echo "   crontab -e"
    echo "   # Добавить: 0 4 * * * $HOME/sync-backups.sh"
    echo ""
    echo "📊 Полезные команды:"
    echo "• ./docker/manage.sh status       - статус"
    echo "• ./docker/manage.sh logs-follow  - логи"
    echo "• sudo systemctl status rosseti-parser.service"
    echo "• ./docker/manage.sh backup-list  - список бэкапов"
    echo ""
    print_success "Готово! 🎉"
}

# Основная функция
main() {
    print_header
    
    print_message "Начало деплоя..."
    
    check_user
    check_sudo
    install_dependencies
    install_docker
    install_docker_compose
    
    print_warning "ВАЖНО: Перелогиньтесь для применения группы docker!"
    read -p "Перелогинились? Продолжить? (y/N): " continue_deploy
    
    if [[ ! $continue_deploy =~ ^[Yy]$ ]]; then
        print_message "Деплой приостановлен. Перелогиньтесь и запустите скрипт снова."
        exit 0
    fi
    
    setup_project
    setup_env
    create_systemd_service
    setup_backups
    setup_firewall
    first_run
    check_completion
}

# Запуск
main "$@"
