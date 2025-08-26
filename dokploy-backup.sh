#!/bin/bash

# Скрипт бэкапа для Dokploy Scheduled Tasks
# Работает ВНУТРИ контейнера без доступа к Docker

set -e

# Логирование с метками времени
log() {
    echo "$(date): $1"
}

# Цвета для лучшей читаемости (если терминал поддерживает)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_error() { echo -e "${RED}$(date): [ERROR] $1${NC}"; }
log_success() { echo -e "${GREEN}$(date): [SUCCESS] $1${NC}"; }
log_warn() { echo -e "${YELLOW}$(date): [WARNING] $1${NC}"; }

log "=== Начало бэкапа БД через Dokploy Scheduled Task ==="

# Диагностика окружения (мы внутри контейнера)
log "Диагностика окружения:"
log "- Рабочая директория: $(pwd)"
log "- Переменная окружения USER: ${USER:-не установлена}"
log "- Переменная окружения HOME: ${HOME:-не установлена}"

# Проверяем структуру файлов внутри контейнера
log "- Содержимое /app:"
if [ -d "/app" ]; then
    ls -la /app/ 2>/dev/null || log_warn "Не удалось получить содержимое /app"
else
    log_error "Директория /app не найдена"
fi

log "- Содержимое /app/data:"
if [ -d "/app/data" ]; then
    ls -la /app/data/ 2>/dev/null || log_warn "Не удалось получить содержимое /app/data"
    
    # Подсчитываем размер данных
    data_size=$(du -sh /app/data 2>/dev/null | cut -f1 || echo "неизвестно")
    log "- Размер данных: $data_size"
else
    log_error "Директория данных /app/data НЕ НАЙДЕНА"
    exit 1
fi

# Проверяем, есть ли скомпилированное приложение
log "- Проверка наличия скомпилированного приложения:"
if [ -d "/app/dist" ]; then
    log_success "Директория dist найдена"
    if [ -f "/app/dist/src/utils/backup.js" ]; then
        log_success "Модуль backup.js найден"
        backup_via_app=true
    else
        log_warn "Модуль backup.js не найден"
        backup_via_app=false
    fi
else
    log_warn "Директория dist не найдена"
    backup_via_app=false
fi

# Создаем директорию для бэкапов
backup_dir="/app/data/backups"
mkdir -p "$backup_dir"
log "Директория бэкапов: $backup_dir"

# Попытка создания бэкапа через приложение
if [ "$backup_via_app" = true ]; then
    log "Попытка создания бэкапа через Node.js приложение..."
    
    if node -e "
        import('./dist/src/utils/backup.js').then(module => {
            const { backupManager } = module;
            return backupManager.createBackup();
        }).then(path => {
            console.log('Бэкап создан:', path);
        }).catch(err => {
            console.error('Ошибка создания бэкапа:', err.message);
            process.exit(1);
        });
    " 2>/dev/null; then
        log_success "Бэкап БД создан через приложение"
        backup_created=true
    else
        log_warn "Не удалось создать бэкап через приложение, переходим к ручному способу"
        backup_created=false
    fi
else
    backup_created=false
fi

# Если бэкап через приложение не удался, создаем вручную
if [ "$backup_created" = false ]; then
    log "Создание бэкапа вручную..."
    
    backup_file="$backup_dir/manual-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    # Создаем архив всех данных (исключая директорию backups чтобы избежать рекурсии)
    if tar -czf "$backup_file" -C /app/data --exclude='backups' . 2>/dev/null; then
        # Проверяем, что файл создался и не пустой
        if [ -f "$backup_file" ] && [ -s "$backup_file" ]; then
            file_size=$(du -h "$backup_file" | cut -f1)
            log_success "Ручной бэкап создан: $backup_file (размер: $file_size)"
            backup_created=true
        else
            log_error "Файл бэкапа создался, но пустой или поврежден"
            backup_created=false
        fi
    else
        log_error "Не удалось создать tar архив"
        backup_created=false
    fi
fi

# Итоговая проверка и очистка старых бэкапов
if [ "$backup_created" = true ]; then
    log "Проверка созданных бэкапов:"
    if ls -la "$backup_dir"/*.{db,tar.gz} 2>/dev/null; then
        backup_count=$(ls "$backup_dir"/*.{db,tar.gz} 2>/dev/null | wc -l)
        log "Всего бэкапов: $backup_count"
        
        # Удаляем старые бэкапы (оставляем последние 10)
        if [ "$backup_count" -gt 10 ]; then
            log "Удаление старых бэкапов (оставляем последние 10)..."
            ls -t "$backup_dir"/*.{db,tar.gz} 2>/dev/null | tail -n +11 | xargs -r rm -f
            log "Старые бэкапы удалены"
        fi
    else
        log_warn "Не удалось найти созданные бэкапы"
    fi
    
    log_success "=== Бэкап завершен успешно ==="
else
    log_error "=== Не удалось создать бэкап ==="
    exit 1
fi
