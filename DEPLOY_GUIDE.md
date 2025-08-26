# 🚀 Руководство по деплою на Ubuntu сервер

## Подготовка сервера

### 1. Обновление системы

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Установка Docker и Docker Compose

```bash
# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Перелогиниться для применения изменений группы
logout
# Зайти заново по SSH
```

### 3. Установка дополнительных инструментов

```bash
sudo apt install -y git htop nano curl wget unzip cron
```

## Деплой проекта

### 1. Клонирование репозитория

```bash
# Переходим в домашнюю папку или создаем папку для проектов
mkdir -p ~/projects
cd ~/projects

# Клонируем репозиторий
git clone https://github.com/your-username/parser_rosseti.git
cd parser_rosseti
```

### 2. Настройка переменных окружения

```bash
# Копируем пример конфигурации
cp env.example .env

# Редактируем конфигурацию
nano .env
```

**Заполните `.env` файл:**

```env
# Обязательные параметры
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_ADMIN_CHAT=your_telegram_chat_id

# Настройки окружения
NODE_ENV=production
TZ=Europe/Moscow
LOG_LEVEL=info

# Опциональные настройки
CHECK_INTERVAL=60
MAX_RETRY_ATTEMPTS=3
HTTP_TIMEOUT=30000
```

### 3. Подготовка папок

```bash
# Создаем необходимые папки
mkdir -p data logs reports backups

# Устанавливаем права доступа
chmod 755 data logs reports backups
chmod +x docker/manage.sh docker/entrypoint.sh docker/start.sh
```

### 4. Первый запуск

```bash
# Сборка и запуск
./docker/manage.sh build
./docker/manage.sh start

# Проверка статуса
./docker/manage.sh status
```

## Настройка автозапуска

### 1. Создание systemd сервиса

```bash
sudo nano /etc/systemd/system/rosseti-parser.service
```

**Содержимое файла:**

```ini
[Unit]
Description=Rosseti Parser Bot
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/username/projects/parser_rosseti
ExecStart=/home/username/projects/parser_rosseti/docker/manage.sh start
ExecStop=/home/username/projects/parser_rosseti/docker/manage.sh stop
TimeoutStartSec=0
User=username
Group=username

[Install]
WantedBy=multi-user.target
```

**⚠️ Замените `username` на ваше имя пользователя:**

```bash
# Узнать имя пользователя
whoami

# Исправить пути в сервисе
sudo sed -i "s/username/$(whoami)/g" /etc/systemd/system/rosseti-parser.service
```

### 2. Активация сервиса

```bash
# Перезагрузка systemd
sudo systemctl daemon-reload

# Включение автозапуска
sudo systemctl enable rosseti-parser.service

# Запуск сервиса
sudo systemctl start rosseti-parser.service

# Проверка статуса
sudo systemctl status rosseti-parser.service
```

## Настройка автоматических бэкапов

### 1. Настройка бэкапов

```bash
# Настроить автоматические бэкапы
./docker/manage.sh backup-auto

# Выберите вариант (рекомендуется: 1 - ежедневно в 3:00)
```

### 2. Настройка внешних бэкапов (рекомендуется)

```bash
# Создаем папку для внешних бэкапов
sudo mkdir -p /backup/rosseti
sudo chown $(whoami):$(whoami) /backup/rosseti

# Создаем скрипт синхронизации
nano ~/sync-backups.sh
```

**Содержимое `sync-backups.sh`:**

```bash
#!/bin/bash
# Скрипт синхронизации бэкапов

PROJECT_DIR="/home/$(whoami)/projects/parser_rosseti"
BACKUP_DIR="/backup/rosseti"
DATE=$(date +%Y-%m-%d)

# Создаем папку с датой
mkdir -p "$BACKUP_DIR/$DATE"

# Копируем бэкапы БД
if [ -d "$PROJECT_DIR/data/backups" ]; then
    cp -r "$PROJECT_DIR/data/backups"/* "$BACKUP_DIR/$DATE/" 2>/dev/null || true
fi

# Копируем полные бэкапы
if [ -d "$PROJECT_DIR/backups" ]; then
    cp -r "$PROJECT_DIR/backups"/* "$BACKUP_DIR/$DATE/" 2>/dev/null || true
fi

# Удаляем старые бэкапы (старше 30 дней)
find "$BACKUP_DIR" -type d -name "20*" -mtime +30 -exec rm -rf {} + 2>/dev/null || true

echo "Бэкапы синхронизированы: $BACKUP_DIR/$DATE"
```

```bash
# Делаем скрипт исполняемым
chmod +x ~/sync-backups.sh

# Добавляем в crontab (запуск каждый день в 4:00)
crontab -e

# Добавить строку:
0 4 * * * /home/username/sync-backups.sh >> /home/username/sync-backups.log 2>&1
```

## Мониторинг и управление

### 1. Полезные команды

```bash
# Статус сервиса
sudo systemctl status rosseti-parser.service

# Логи сервиса
sudo journalctl -u rosseti-parser.service -f

# Статус контейнеров
./docker/manage.sh status

# Логи приложения
./docker/manage.sh logs-follow

# Перезапуск
sudo systemctl restart rosseti-parser.service

# Остановка
sudo systemctl stop rosseti-parser.service
```

### 2. Мониторинг ресурсов

```bash
# Использование ресурсов контейнером
docker stats

# Размер данных
du -sh data/ logs/ reports/ backups/

# Свободное место на диске
df -h
```

### 3. Проверка бэкапов

```bash
# Список бэкапов
./docker/manage.sh backup-list

# Ручное создание бэкапа
./docker/manage.sh backup-db

# Проверка cron заданий
crontab -l

# Логи автобэкапов
tail -f logs/backup-cron.log
```

## Обновление проекта

### 1. Обновление из Git

```bash
cd ~/projects/parser_rosseti

# Остановка сервиса
sudo systemctl stop rosseti-parser.service

# Создание бэкапа перед обновлением
./docker/manage.sh backup

# Получение обновлений
git pull origin main

# Пересборка образа (если изменились зависимости)
./docker/manage.sh build

# Запуск сервиса
sudo systemctl start rosseti-parser.service

# Проверка статуса
./docker/manage.sh status
```

### 2. Автоматизация обновлений (опционально)

```bash
# Создаем скрипт обновления
nano ~/update-parser.sh
```

**Содержимое `update-parser.sh`:**

```bash
#!/bin/bash
PROJECT_DIR="/home/$(whoami)/projects/parser_rosseti"
LOG_FILE="/home/$(whoami)/update-parser.log"

cd "$PROJECT_DIR"

echo "$(date): Начало обновления" >> "$LOG_FILE"

# Остановка
sudo systemctl stop rosseti-parser.service

# Бэкап
./docker/manage.sh backup-db >> "$LOG_FILE" 2>&1

# Обновление
git pull origin main >> "$LOG_FILE" 2>&1

# Запуск
sudo systemctl start rosseti-parser.service

echo "$(date): Обновление завершено" >> "$LOG_FILE"
```

```bash
chmod +x ~/update-parser.sh

# Добавить в crontab для еженедельного обновления (воскресенье в 2:00)
# 0 2 * * 0 /home/username/update-parser.sh
```

## Безопасность

### 1. Файрвол (UFW)

```bash
# Установка UFW
sudo apt install -y ufw

# Базовые правила
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Разрешить SSH
sudo ufw allow ssh

# Если используете API (опционально)
# sudo ufw allow 3000

# Включить файрвол
sudo ufw enable

# Проверить статус
sudo ufw status
```

### 2. Защита файлов конфигурации

```bash
# Ограничиваем доступ к .env файлу
chmod 600 .env

# Создаем резервную копию конфигурации
cp .env .env.backup
chmod 600 .env.backup
```

### 3. Логротация

```bash
# Создаем конфигурацию logrotate
sudo nano /etc/logrotate.d/rosseti-parser
```

**Содержимое конфигурации:**

```
/home/username/projects/parser_rosseti/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    copytruncate
}
```

## Устранение проблем

### 1. Контейнер не запускается

```bash
# Проверка логов
./docker/manage.sh logs

# Проверка образа
docker images | grep rosseti

# Пересборка образа
./docker/manage.sh build --no-cache

# Проверка .env файла
cat .env
```

### 2. Бот не отвечает

```bash
# Проверка токена
grep TELEGRAM_BOT_TOKEN .env

# Проверка подключения к интернету
curl -I https://api.telegram.org

# Перезапуск
sudo systemctl restart rosseti-parser.service
```

### 3. Нет места на диске

```bash
# Проверка места
df -h

# Очистка Docker
docker system prune -a

# Очистка старых бэкапов
find backups/ -name "*.tar.gz" -mtime +14 -delete
find data/backups/ -name "*.db" -mtime +14 -delete

# Очистка логов
sudo journalctl --vacuum-time=7d
```

## Мониторинг производительности

### 1. Установка htop для мониторинга

```bash
sudo apt install -y htop iotop nethogs
```

### 2. Мониторинг проекта

```bash
# Использование ресурсов
htop

# Сетевая активность
sudo nethogs

# Дисковая активность
sudo iotop

# Статистика Docker
docker stats --no-stream
```

## Заключение

После выполнения всех шагов у вас будет:

- ✅ Автоматически запускающийся бот
- ✅ Автоматические бэкапы базы данных
- ✅ Мониторинг и логирование
- ✅ Возможность обновления через Git
- ✅ Базовая безопасность

**Рекомендации:**

1. Регулярно проверяйте логи и статус сервиса
2. Настройте уведомления о критических ошибках
3. Создавайте резервные копии конфигурации
4. Обновляйте систему и Docker регулярно
