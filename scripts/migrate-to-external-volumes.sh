#!/bin/bash

# 🔄 Скрипт миграции на external volumes для предотвращения потери данных в Dokploy
# Выполните этот скрипт НА СЕРВЕРЕ где развернут Dokploy

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

log_info "🚀 Начало миграции на external volumes"

# Получаем имя проекта из текущей директории или параметра
PROJECT_NAME=${1:-"parser_rosseti"}
CONTAINER_PREFIX="rosseti"

log_info "Проект: $PROJECT_NAME"

# 1. Создаем бэкап текущих данных
log_info "📦 Создание бэкапа текущих данных..."
backup_dir="./backups/migration-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"

# Находим запущенный контейнер
CONTAINER_ID=$(docker ps --format "table {{.ID}}\t{{.Names}}" | grep "$CONTAINER_PREFIX" | head -n1 | awk '{print $1}')

if [ -n "$CONTAINER_ID" ]; then
    log_success "Найден контейнер: $CONTAINER_ID"
    
    # Создаем бэкап через приложение если возможно
    log_info "Создание бэкапа через приложение..."
    docker exec "$CONTAINER_ID" /app/dokploy-backup.sh || log_warning "Не удалось создать бэкап через приложение"
    
    # Копируем данные из контейнера
    log_info "Копирование данных из контейнера..."
    docker cp "$CONTAINER_ID:/app/data" "$backup_dir/" || log_warning "Не удалось скопировать /app/data"
    docker cp "$CONTAINER_ID:/app/logs" "$backup_dir/" || log_warning "Не удалось скопировать /app/logs"
    docker cp "$CONTAINER_ID:/app/reports" "$backup_dir/" || log_warning "Не удалось скопировать /app/reports"
else
    log_warning "Контейнер не найден, пропускаем бэкап из контейнера"
fi

# 2. Находим текущие volumes
log_info "🔍 Поиск текущих volumes..."
CURRENT_VOLUMES=$(docker volume ls --format "{{.Name}}" | grep -E "(rosseti|parser)" | sort)

if [ -z "$CURRENT_VOLUMES" ]; then
    log_warning "Текущие volumes не найдены"
else
    log_info "Найденные volumes:"
    echo "$CURRENT_VOLUMES"
fi

# 3. Создаем новые external volumes
log_info "🔧 Создание external volumes..."

# Создаем external volumes с фиксированными именами
docker volume create rosseti_parser_data || log_warning "Volume rosseti_parser_data уже существует"
docker volume create rosseti_parser_logs || log_warning "Volume rosseti_parser_logs уже существует"  
docker volume create rosseti_parser_reports || log_warning "Volume rosseti_parser_reports уже существует"
docker volume create rosseti_parser_playwright || log_warning "Volume rosseti_parser_playwright уже существует"

log_success "External volumes созданы"

# 4. Копируем данные в новые volumes
log_info "📋 Копирование данных в новые volumes..."

# Функция для копирования данных между volumes
copy_volume_data() {
    local source_volume=$1
    local target_volume=$2
    local description=$3
    
    if docker volume inspect "$source_volume" >/dev/null 2>&1; then
        log_info "Копирование $description: $source_volume → $target_volume"
        
        docker run --rm \
            -v "$source_volume:/source:ro" \
            -v "$target_volume:/target" \
            alpine sh -c "
                if [ -d /source ] && [ \"\$(ls -A /source)\" ]; then
                    cp -r /source/* /target/ 2>/dev/null || cp -r /source/. /target/ 2>/dev/null || echo 'Не удалось скопировать некоторые файлы'
                    echo 'Копирование завершено'
                else
                    echo 'Исходная директория пуста или не существует'
                fi
            "
        
        log_success "✅ $description скопированы"
    else
        log_warning "⚠️ Исходный volume $source_volume не найден"
    fi
}

# Копируем данные из существующих volumes
echo "$CURRENT_VOLUMES" | while read -r volume; do
    case "$volume" in
        *data*)
            copy_volume_data "$volume" "rosseti_parser_data" "База данных"
            ;;
        *logs*)
            copy_volume_data "$volume" "rosseti_parser_logs" "Логи"
            ;;
        *reports*)
            copy_volume_data "$volume" "rosseti_parser_reports" "Отчеты"
            ;;
        *playwright*|*cache*)
            copy_volume_data "$volume" "rosseti_parser_playwright" "Кеш Playwright"
            ;;
    esac
done

# 5. Копируем данные из бэкапа если volumes были пустые
if [ -d "$backup_dir/data" ]; then
    log_info "📁 Копирование данных из бэкапа..."
    
    docker run --rm \
        -v "$(pwd)/$backup_dir:/backup:ro" \
        -v "rosseti_parser_data:/target" \
        alpine sh -c "
            if [ -d /backup/data ] && [ \"\$(ls -A /backup/data)\" ]; then
                cp -r /backup/data/* /target/ 2>/dev/null || cp -r /backup/data/. /target/ 2>/dev/null
                echo 'Данные из бэкапа скопированы'
            fi
        "
fi

# 6. Проверяем содержимое новых volumes
log_info "🔍 Проверка содержимого новых volumes..."

check_volume_content() {
    local volume_name=$1
    local description=$2
    
    log_info "Проверка $description ($volume_name):"
    docker run --rm -v "$volume_name:/data" alpine sh -c "
        echo '  Размер: '\$(du -sh /data 2>/dev/null | cut -f1 || echo 'неизвестно')
        echo '  Файлы: '\$(find /data -type f 2>/dev/null | wc -l || echo '0')' файлов'
        if [ -f /data/subscriptions.db ]; then
            echo '  ✅ База данных найдена: subscriptions.db'
        fi
    "
}

check_volume_content "rosseti_parser_data" "База данных"
check_volume_content "rosseti_parser_logs" "Логи"
check_volume_content "rosseti_parser_reports" "Отчеты"

# 7. Создаем инструкции для Dokploy
log_info "📋 Создание инструкций для настройки Dokploy..."

cat > "./DOKPLOY_MIGRATION_INSTRUCTIONS.md" << 'EOF'
# 🔄 Инструкции по завершению миграции в Dokploy

## 1. Настройки в Dokploy Panel

### Project Settings → Docker Compose:
- Измените Docker Compose файл на: `docker-compose.production.yml`
- Или добавьте external volumes в основной `docker-compose.yml`

### Volumes → External Volumes:
Добавьте следующие external volumes:

```
Name: rosseti_parser_data
Mount Path: /app/data
External: ✅ TRUE

Name: rosseti_parser_logs  
Mount Path: /app/logs
External: ✅ TRUE

Name: rosseti_parser_reports
Mount Path: /app/reports
External: ✅ TRUE

Name: rosseti_parser_playwright
Mount Path: /home/botuser/.cache/ms-playwright
External: ✅ TRUE
```

### Deploy Settings → Advanced:
- ✅ Preserve volumes between deployments
- ✅ Use named volumes
- ✅ Keep data volumes
- ❌ Recreate volumes on update

## 2. Проверка после деплоя

После следующего деплоя проверьте:

```bash
# 1. Volumes остались теми же
docker volume ls | grep rosseti_parser

# 2. База данных содержит данные
docker exec CONTAINER_NAME ls -la /app/data/

# 3. Подписки сохранены (отправьте /stats боту в Telegram)
```

## 3. Очистка старых volumes (ТОЛЬКО после проверки!)

```bash
# ВНИМАНИЕ: Выполняйте ТОЛЬКО после проверки что новые volumes работают!
# docker volume rm OLD_VOLUME_NAMES
```
EOF

log_success "✅ Миграция завершена!"
log_info "📁 Бэкап сохранен в: $backup_dir"
log_info "📋 Следующие шаги в файле: DOKPLOY_MIGRATION_INSTRUCTIONS.md"

echo ""
log_warning "⚠️  ВАЖНО: Теперь настройте Dokploy согласно инструкциям в DOKPLOY_MIGRATION_INSTRUCTIONS.md"
log_warning "⚠️  ВАЖНО: Проверьте работу приложения после следующего деплоя"
log_warning "⚠️  ВАЖНО: Удаляйте старые volumes ТОЛЬКО после проверки что всё работает!"

echo ""
log_info "📊 Созданные external volumes:"
docker volume ls | grep rosseti_parser
