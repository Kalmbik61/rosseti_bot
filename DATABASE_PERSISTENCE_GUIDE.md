# 🔄 Решение проблемы потери базы данных при деплое

## Проблема

При новом деплое на сервер разворачивается новая БД и удаляется старая, что приводит к потере:

- Списка подписчиков
- Настроек интервала обновления
- Истории уведомлений

## Причины проблемы

### 1. Различия в конфигурации volumes

**Обычный Docker Compose:**

```yaml
volumes:
  - ./data:/app/data # bind mount - может перезатираться
```

**Dokploy версия:**

```yaml
volumes:
  - rosseti_data:/app/data # named volume - должен сохраняться
```

### 2. Неправильная настройка деплоя

- Использование неправильного compose файла
- Пересоздание volumes вместо их переиспользования
- Отсутствие бэкапов перед деплоем

## Решение проблемы

### Вариант 1: Для Dokploy (рекомендуется)

#### 1. Убедитесь, что используете правильный compose файл

В настройках Dokploy убедитесь, что указан файл:

```
docker-compose.dokploy.yml
```

А НЕ обычный `docker-compose.yml`

#### 2. Проверьте, что volumes правильно настроены

В Dokploy UI перейдите в секцию **Volumes** и убедитесь, что существуют:

- ✅ `rosseti_data` - БД подписок
- ✅ `rosseti_logs` - логи
- ✅ `rosseti_reports` - отчеты

#### 3. Включите автоматические бэкапы

В настройках проекта в Dokploy:

```yaml
labels:
  - "dokploy.backup=true"
  - "dokploy.backup.schedule=daily"
```

### Вариант 2: Для обычного Docker Compose

#### 1. Используйте named volumes вместо bind mounts

Обновите `docker-compose.yml`:

```yaml
services:
  rosseti-parser:
    volumes:
      # Замените это:
      # - ./data:/app/data

      # На это:
      - rosseti_data:/app/data
      - rosseti_logs:/app/logs
      - rosseti_reports:/app/reports

volumes:
  rosseti_data:
    driver: local
  rosseti_logs:
    driver: local
  rosseti_reports:
    driver: local
```

#### 2. Создайте скрипт бэкапа перед деплоем

```bash
#!/bin/bash
# backup-before-deploy.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups/deploy_$DATE"

mkdir -p "$BACKUP_DIR"

# Бэкап данных из volume
docker run --rm \
  -v rosseti_data:/data \
  -v "$PWD/$BACKUP_DIR":/backup \
  alpine tar czf /backup/data.tar.gz -C /data .

echo "Бэкап создан: $BACKUP_DIR/data.tar.gz"
```

## Миграция существующих данных

### Если данные уже потерялись:

#### 1. Восстановление из бэкапа

```bash
# Найдите последний бэкап
ls -la ./data/backups/

# Восстановите БД
cp ./data/backups/subscriptions_YYYYMMDD_HHMMSS.db ./data/subscriptions.db

# Перезапустите контейнер
docker-compose restart rosseti-parser
```

#### 2. Если бэкапа нет - переконфигурация

К сожалению, если данные полностью потеряны:

- Пользователи должны заново подписаться через `/subscribe`
- Интервал обновления сбросится на 6 часов (по умолчанию)
- Админы могут настроить новый интервал через `/admin_set_interval`

### Сохранение данных при переходе с bind mounts на named volumes:

#### 1. Создайте бэкап текущих данных

```bash
# Остановите контейнер
docker-compose down

# Создайте бэкап
cp -r ./data ./data_backup_$(date +%Y%m%d)
```

#### 2. Создайте named volume и скопируйте данные

```bash
# Создайте volume
docker volume create rosseti_data

# Скопируйте данные в volume
docker run --rm \
  -v "$PWD/data":/source \
  -v rosseti_data:/target \
  alpine cp -r /source/. /target/
```

#### 3. Обновите compose файл и запустите

```bash
# Используйте обновленную конфигурацию
docker-compose up -d
```

## Профилактические меры

### 1. Автоматические бэкапы

Добавьте в crontab:

```bash
# Ежедневный бэкап в 3:00
0 3 * * * /path/to/project/scripts/backup.sh
```

### 2. Мониторинг состояния БД

Проверяйте наличие файла БД в логах:

```bash
docker-compose logs rosseti-parser | grep "Database:"
```

### 3. Использование правильной конфигурации

**Для Dokploy:**

- ✅ Используйте `docker-compose.dokploy.yml`
- ✅ Named volumes
- ✅ Автоматические бэкапы через Dokploy

**Для обычного Docker:**

- ✅ Named volumes вместо bind mounts
- ✅ Регулярные бэкапы через cron
- ✅ Проверка volumes перед деплоем

## Диагностика проблем

### Проверить существующие volumes:

```bash
# Список всех volumes
docker volume ls

# Детали конкретного volume
docker volume inspect rosseti_data

# Содержимое volume
docker run --rm -v rosseti_data:/data alpine ls -la /data
```

### Проверить наличие БД:

```bash
# В работающем контейнере
docker exec rosseti-parser-bot ls -la /app/data/

# Проверить размер файла БД
docker exec rosseti-parser-bot du -h /app/data/subscriptions.db
```

### Проверить логи приложения:

```bash
# Поиск ошибок с БД
docker-compose logs rosseti-parser | grep -i "database\|error"

# Проверка подключения к БД
docker-compose logs rosseti-parser | grep "Подключение к БД"
```

## Чек-лист перед каждым деплоем

- [ ] Создан бэкап текущей БД
- [ ] Проверен список активных подписчиков
- [ ] Записаны текущие настройки (интервал обновления)
- [ ] Используется правильный compose файл
- [ ] Volumes настроены как named volumes
- [ ] Есть план восстановления при сбое

## Контакты для поддержки

Если проблема продолжается:

1. Проверьте логи Dokploy/Docker
2. Убедитесь в использовании правильной конфигурации
3. Создайте issue с подробным описанием проблемы

**Помните:** Регулярные бэкапы - лучшая защита от потери данных!
