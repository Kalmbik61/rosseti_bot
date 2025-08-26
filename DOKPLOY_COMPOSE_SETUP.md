# 🚀 Настройка Dokploy для использования правильного compose файла

## Проблема

По умолчанию Dokploy использует `docker-compose.yml`, но для сохранения базы данных нужен `docker-compose.yml.dokploy` с named volumes.

## Решение

### Вариант 1: Настройка в интерфейсе Dokploy (рекомендуется)

#### 1. Войдите в панель Dokploy

- Откройте `http://YOUR_SERVER_IP:3000`
- Войдите в свой проект

#### 2. Настройте Docker Compose файл

1. Перейдите в настройки проекта
2. Найдите секцию **"Docker Compose"** или **"Compose"**
3. В поле **"Compose File"** или **"Docker Compose File"** укажите:
   ```
   docker-compose.yml.dokploy
   ```

#### 3. Альтернативный способ (если есть Custom Command)

В секции **"Build"** или **"Deploy"** найдите **"Custom Command"** и укажите:

```bash
docker-compose -f docker-compose.yml.dokploy up -d
```

### Вариант 2: Переименование основного файла

Если в Dokploy нет возможности указать кастомный файл:

1. **Переименуйте файлы в репозитории:**

   ```bash
   # Сохраните текущий docker-compose.yml как dev версию
   mv docker-compose.yml docker-compose.dev.yml

   # Переименуйте Dokploy версию в основную
   mv docker-compose.yml.dokploy docker-compose.yml
   ```

2. **Обновите .gitignore для исключения dev файла** (если нужно):
   ```
   docker-compose.dev.yml
   ```

### Вариант 3: Использование переменных окружения

Создайте файл `docker-compose.override.yml` для автоматического переопределения:

```yaml
# docker-compose.override.yml
version: "3.8"

services:
  rosseti-parser:
    volumes:
      # Переопределяем на named volumes для Dokploy
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

## Проверка настройки

### 1. После деплоя проверьте volumes:

В Dokploy UI или через SSH:

```bash
# Проверка named volumes
docker volume ls | grep rosseti

# Проверка монтирования
docker inspect rosseti-parser-bot | grep -A 10 "Mounts"
```

### 2. Проверьте сохранность данных:

```bash
# Проверка базы данных
docker exec rosseti-parser-bot ls -la /app/data/
docker exec rosseti-parser-bot du -h /app/data/subscriptions.db
```

### 3. Проверьте через бота:

```
/admin_backup_debug
/admin_stats
```

## Содержимое docker-compose.yml.dokploy

Убедитесь, что файл содержит named volumes:

```yaml
version: "3.8"

services:
  rosseti-parser:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: rosseti-parser-bot
    restart: unless-stopped

    environment:
      - NODE_ENV=production
      - TZ=Europe/Moscow

    volumes:
      # КРИТИЧНО: используем named volumes, не bind mounts
      - rosseti_data:/app/data
      - rosseti_logs:/app/logs
      - rosseti_reports:/app/reports
      - playwright_cache:/home/botuser/.cache/ms-playwright

volumes:
  # Именованные volumes сохраняются между деплоями
  rosseti_data:
    driver: local
    labels:
      - "dokploy.backup=true"
      - "dokploy.backup.schedule=daily"
  rosseti_logs:
    driver: local
  rosseti_reports:
    driver: local
  playwright_cache:
    driver: local
```

## Диагностика проблем

### Если база все еще теряется:

1. **Проверьте, какой compose файл используется:**

   ```bash
   # В контейнере проверьте точки монтирования
   docker exec rosseti-parser-bot mount | grep /app/data
   ```

2. **Проверьте логи Dokploy:**

   - В интерфейсе Dokploy перейдите в секцию **"Logs"**
   - Найдите упоминания о compose файле

3. **Проверьте volumes в Dokploy UI:**
   - Перейдите в секцию **"Volumes"**
   - Убедитесь, что `rosseti_data` существует

### Если volumes не создаются:

1. **Принудительно создайте volume:**

   ```bash
   docker volume create rosseti_data
   docker volume create rosseti_logs
   docker volume create rosseti_reports
   ```

2. **Перезапустите деплой в Dokploy**

## Автоматизация для будущих деплоев

### 1. Добавьте в CI/CD (если используете):

```yaml
# В GitHub Actions или аналогичном
- name: Deploy to Dokploy
  run: |
    # Убедимся, что используется правильный compose файл
    curl -X POST "$DOKPLOY_WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d '{"composeFile": "docker-compose.yml.dokploy"}'
```

### 2. Создайте скрипт проверки после деплоя:

```bash
#!/bin/bash
# check-dokploy-deploy.sh

echo "Проверка деплоя в Dokploy..."

# Проверка volumes
if docker volume ls | grep -q rosseti_data; then
    echo "✅ Volume rosseti_data существует"
else
    echo "❌ Volume rosseti_data НЕ найден!"
    exit 1
fi

# Проверка монтирования
if docker exec rosseti-parser-bot test -f /app/data/subscriptions.db; then
    echo "✅ База данных найдена"
    docker exec rosseti-parser-bot du -h /app/data/subscriptions.db
else
    echo "⚠️ База данных не найдена (возможно, первый запуск)"
fi

echo "Проверка завершена!"
```

## Резюме

**Главное:** Убедитесь, что в настройках Dokploy указан файл `docker-compose.yml.dokploy` вместо обычного `docker-compose.yml`.

**Проверка:** После деплоя база данных должна сохраняться в named volume `rosseti_data`, а не в bind mount который может потеряться.

Файл уже настроен правильно, остается только указать Dokploy использовать именно его!
