#!/bin/bash

# Простой скрипт бэкапа для Dokploy Scheduled Tasks
# Этот скрипт работает независимо от рабочей директории

set -e

# Определяем директорию проекта
PROJECT_DIR="/app"

# Логирование
echo "$(date): Начало бэкапа БД через Dokploy Scheduled Task"

# Переходим в директорию проекта
cd "$PROJECT_DIR"

# Проверяем наличие скрипта управления
if [ -f "./docker/manage.sh" ]; then
    echo "$(date): Запуск бэкапа через manage.sh"
    bash ./docker/manage.sh backup-db
    echo "$(date): Бэкап БД завершен успешно"
else
    echo "$(date): manage.sh не найден, создаем бэкап напрямую"
    
    # Альтернативный способ создания бэкапа
    if [ -d "./data" ]; then
        backup_dir="./backups"
        mkdir -p "$backup_dir"
        
        backup_file="$backup_dir/db-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
        tar -czf "$backup_file" ./data/ 2>/dev/null || true
        
        if [ -f "$backup_file" ]; then
            echo "$(date): Резервная копия создана: $backup_file"
        else
            echo "$(date): Ошибка создания резервной копии"
            exit 1
        fi
    else
        echo "$(date): Директория data не найдена"
        exit 1
    fi
fi

echo "$(date): Бэкап завершен"
