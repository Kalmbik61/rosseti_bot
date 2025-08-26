#!/bin/bash

# 🔄 Скрипт бэкапа базы данных перед деплоем
# Создает резервную копию БД и настроек перед обновлением

set -e

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
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

# Определение путей
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$PROJECT_DIR/backups/deploy_$DATE"
CONTAINER_NAME="rosseti-parser-bot"

print_info "Начало бэкапа перед деплоем..."
print_info "Дата: $(date)"
print_info "Проект: $PROJECT_DIR"
print_info "Директория бэкапа: $BACKUP_DIR"

# Создание директории для бэкапа
mkdir -p "$BACKUP_DIR"

# Функция проверки существования контейнера
check_container() {
    if docker ps -a --format "table {{.Names}}" | grep -q "^$CONTAINER_NAME$"; then
        return 0
    else
        return 1
    fi
}

# Функция бэкапа из named volume
backup_from_volume() {
    local volume_name="$1"
    local backup_file="$2"
    
    print_info "Бэкап volume: $volume_name -> $backup_file"
    
    if docker volume inspect "$volume_name" >/dev/null 2>&1; then
        docker run --rm \
            -v "$volume_name":/source \
            -v "$BACKUP_DIR":/backup \
            alpine sh -c "cd /source && tar czf /backup/$backup_file ."
        
        if [ -f "$BACKUP_DIR/$backup_file" ]; then
            print_success "Volume $volume_name заархивирован: $backup_file"
        else
            print_error "Ошибка создания архива volume $volume_name"
            return 1
        fi
    else
        print_warning "Volume $volume_name не найден"
        return 1
    fi
}

# Функция бэкапа из bind mount
backup_from_bind_mount() {
    local source_dir="$1"
    local backup_file="$2"
    
    print_info "Бэкап bind mount: $source_dir -> $backup_file"
    
    if [ -d "$source_dir" ]; then
        cd "$source_dir"
        tar czf "$BACKUP_DIR/$backup_file" .
        print_success "Bind mount $source_dir заархивирован: $backup_file"
    else
        print_warning "Директория $source_dir не найдена"
        return 1
    fi
}

# Функция бэкапа из работающего контейнера
backup_from_container() {
    local container_path="$1"
    local backup_file="$2"
    
    print_info "Бэкап из контейнера: $container_path -> $backup_file"
    
    if docker exec "$CONTAINER_NAME" test -d "$container_path" 2>/dev/null; then
        docker exec "$CONTAINER_NAME" tar czf "/tmp/$backup_file" -C "$container_path" .
        docker cp "$CONTAINER_NAME:/tmp/$backup_file" "$BACKUP_DIR/$backup_file"
        docker exec "$CONTAINER_NAME" rm "/tmp/$backup_file"
        print_success "Данные из контейнера заархивированы: $backup_file"
    else
        print_warning "Путь $container_path в контейнере не найден"
        return 1
    fi
}

# Экспорт информации о текущих настройках
export_current_settings() {
    print_info "Экспорт текущих настроек..."
    
    # Создание файла с метаданными
    cat > "$BACKUP_DIR/backup_info.txt" <<EOF
Бэкап создан: $(date)
Проект: Rosseti Parser Bot
Директория проекта: $PROJECT_DIR
Контейнер: $CONTAINER_NAME

=== Информация о системе ===
Docker версия: $(docker --version 2>/dev/null || echo "Не установлен")
Docker Compose версия: $(docker-compose --version 2>/dev/null || echo "Не установлен")

=== Статус контейнера ===
EOF

    if check_container; then
        echo "Контейнер существует: ✅" >> "$BACKUP_DIR/backup_info.txt"
        docker ps -a --filter name="$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" >> "$BACKUP_DIR/backup_info.txt"
    else
        echo "Контейнер не найден: ❌" >> "$BACKUP_DIR/backup_info.txt"
    fi

    echo "" >> "$BACKUP_DIR/backup_info.txt"
    echo "=== Docker volumes ===" >> "$BACKUP_DIR/backup_info.txt"
    docker volume ls | grep rosseti >> "$BACKUP_DIR/backup_info.txt" 2>/dev/null || echo "Named volumes не найдены" >> "$BACKUP_DIR/backup_info.txt"
    
    print_success "Метаданные сохранены в backup_info.txt"
}

# Основная логика бэкапа
main_backup() {
    local backup_success=0
    
    # Попытка бэкапа named volumes (для Dokploy)
    if backup_from_volume "rosseti_data" "data_volume.tar.gz"; then
        backup_success=1
    fi
    
    if backup_from_volume "rosseti_logs" "logs_volume.tar.gz"; then
        backup_success=1
    fi
    
    if backup_from_volume "rosseti_reports" "reports_volume.tar.gz"; then
        backup_success=1
    fi
    
    # Попытка бэкапа bind mounts (для обычного Docker)
    if backup_from_bind_mount "$PROJECT_DIR/data" "data_bind.tar.gz"; then
        backup_success=1
    fi
    
    if backup_from_bind_mount "$PROJECT_DIR/logs" "logs_bind.tar.gz"; then
        backup_success=1
    fi
    
    if backup_from_bind_mount "$PROJECT_DIR/reports" "reports_bind.tar.gz"; then
        backup_success=1
    fi
    
    # Попытка бэкапа из работающего контейнера
    if check_container && docker ps --filter name="$CONTAINER_NAME" --filter status=running | grep -q "$CONTAINER_NAME"; then
        if backup_from_container "/app/data" "data_container.tar.gz"; then
            backup_success=1
        fi
        
        backup_from_container "/app/logs" "logs_container.tar.gz" || true
        backup_from_container "/app/reports" "reports_container.tar.gz" || true
    fi
    
    return $backup_success
}

# Создание информации о восстановлении
create_restore_script() {
    cat > "$BACKUP_DIR/restore.sh" <<'EOF'
#!/bin/bash

# Скрипт восстановления из бэкапа
# Использование: ./restore.sh

set -e

BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$BACKUP_DIR")")"

echo "Восстановление из бэкапа: $BACKUP_DIR"
echo "В проект: $PROJECT_DIR"

# Остановка контейнеров
echo "Остановка контейнеров..."
cd "$PROJECT_DIR"
docker-compose down 2>/dev/null || true

# Восстановление в named volume
restore_to_volume() {
    local volume_name="$1"
    local archive_file="$2"
    
    if [ -f "$BACKUP_DIR/$archive_file" ]; then
        echo "Восстановление volume $volume_name из $archive_file"
        
        # Создание volume если не существует
        docker volume create "$volume_name" 2>/dev/null || true
        
        # Очистка и восстановление
        docker run --rm \
            -v "$volume_name":/target \
            alpine sh -c "rm -rf /target/* && mkdir -p /target"
            
        docker run --rm \
            -v "$BACKUP_DIR":/backup \
            -v "$volume_name":/target \
            alpine sh -c "cd /target && tar xzf /backup/$archive_file"
            
        echo "✅ Volume $volume_name восстановлен"
    else
        echo "⚠️  Архив $archive_file не найден"
    fi
}

# Восстановление в bind mount
restore_to_bind_mount() {
    local target_dir="$1"
    local archive_file="$2"
    
    if [ -f "$BACKUP_DIR/$archive_file" ]; then
        echo "Восстановление bind mount $target_dir из $archive_file"
        
        mkdir -p "$target_dir"
        cd "$target_dir"
        tar xzf "$BACKUP_DIR/$archive_file"
        
        echo "✅ Bind mount $target_dir восстановлен"
    else
        echo "⚠️  Архив $archive_file не найден"
    fi
}

# Выбор метода восстановления
echo ""
echo "Выберите метод восстановления:"
echo "1) Named volumes (Dokploy)"
echo "2) Bind mounts (обычный Docker)"
echo "3) Оба метода"
read -p "Ваш выбор (1-3): " choice

case $choice in
    1)
        restore_to_volume "rosseti_data" "data_volume.tar.gz"
        restore_to_volume "rosseti_logs" "logs_volume.tar.gz"
        restore_to_volume "rosseti_reports" "reports_volume.tar.gz"
        ;;
    2)
        restore_to_bind_mount "$PROJECT_DIR/data" "data_bind.tar.gz"
        restore_to_bind_mount "$PROJECT_DIR/logs" "logs_bind.tar.gz"
        restore_to_bind_mount "$PROJECT_DIR/reports" "reports_bind.tar.gz"
        ;;
    3)
        restore_to_volume "rosseti_data" "data_volume.tar.gz"
        restore_to_volume "rosseti_logs" "logs_volume.tar.gz"
        restore_to_volume "rosseti_reports" "reports_volume.tar.gz"
        restore_to_bind_mount "$PROJECT_DIR/data" "data_bind.tar.gz"
        restore_to_bind_mount "$PROJECT_DIR/logs" "logs_bind.tar.gz"
        restore_to_bind_mount "$PROJECT_DIR/reports" "reports_bind.tar.gz"
        ;;
    *)
        echo "Неверный выбор"
        exit 1
        ;;
esac

echo ""
echo "✅ Восстановление завершено!"
echo "Теперь можете запустить контейнеры:"
echo "cd $PROJECT_DIR && docker-compose up -d"
EOF

    chmod +x "$BACKUP_DIR/restore.sh"
    print_success "Скрипт восстановления создан: restore.sh"
}

# Очистка старых бэкапов
cleanup_old_backups() {
    print_info "Очистка старых бэкапов..."
    
    local backup_parent_dir="$PROJECT_DIR/backups"
    if [ -d "$backup_parent_dir" ]; then
        # Удаляем бэкапы старше 30 дней
        find "$backup_parent_dir" -name "deploy_*" -type d -mtime +30 -exec rm -rf {} + 2>/dev/null || true
        
        # Оставляем только последние 10 бэкапов
        ls -dt "$backup_parent_dir"/deploy_* 2>/dev/null | tail -n +11 | xargs rm -rf 2>/dev/null || true
        
        print_success "Старые бэкапы очищены"
    fi
}

# Главная функция
main() {
    cd "$PROJECT_DIR"
    
    # Экспорт настроек
    export_current_settings
    
    # Основной бэкап
    if main_backup; then
        print_success "Бэкап данных завершен успешно"
    else
        print_error "Не удалось создать бэкап данных"
        print_warning "Возможно, приложение еще не было запущено или данные отсутствуют"
    fi
    
    # Создание скрипта восстановления
    create_restore_script
    
    # Очистка старых бэкапов
    cleanup_old_backups
    
    # Итоговая информация
    echo ""
    print_success "=== БЭКАП ЗАВЕРШЕН ==="
    print_info "Директория бэкапа: $BACKUP_DIR"
    print_info "Содержимое:"
    ls -la "$BACKUP_DIR"
    
    echo ""
    print_warning "ВАЖНО: Сохраните путь к бэкапу для возможного восстановления:"
    echo "$BACKUP_DIR"
    
    echo ""
    print_info "Для восстановления данных выполните:"
    echo "cd $BACKUP_DIR && ./restore.sh"
}

# Запуск
main "$@"
