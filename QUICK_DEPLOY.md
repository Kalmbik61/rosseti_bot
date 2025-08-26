# ⚡ Быстрый деплой на Ubuntu сервер

## 🚀 Автоматический деплой (рекомендуется)

### 1. Подключение к серверу

```bash
ssh username@your-server-ip
```

### 2. Клонирование и запуск деплоя

```bash
# Клонирование репозитория
git clone https://github.com/your-username/parser_rosseti.git
cd parser_rosseti

# Запуск автоматического деплоя
./deploy.sh
```

### 3. Настройка Telegram бота

```bash
# Редактирование конфигурации
nano .env

# Добавить:
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_ADMIN_CHAT=your_telegram_chat_id
```

### 4. Перезапуск сервиса

```bash
sudo systemctl restart rosseti-parser.service
```

## ✅ Проверка работы

```bash
# Статус сервиса
sudo systemctl status rosseti-parser.service

# Статус контейнера
./docker/manage.sh status

# Логи в реальном времени
./docker/manage.sh logs-follow
```

## 🔧 Настройка автоматических бэкапов

```bash
# Настройка расписания бэкапов
./docker/manage.sh backup-auto

# Добавление синхронизации в crontab
crontab -e
# Добавить строку:
# 0 4 * * * /home/username/sync-backups.sh
```

## 📋 Полезные команды

### Управление сервисом

```bash
sudo systemctl start rosseti-parser.service    # Запуск
sudo systemctl stop rosseti-parser.service     # Остановка
sudo systemctl restart rosseti-parser.service  # Перезапуск
sudo systemctl status rosseti-parser.service   # Статус
```

### Управление контейнером

```bash
./docker/manage.sh start        # Запуск
./docker/manage.sh stop         # Остановка
./docker/manage.sh restart      # Перезапуск
./docker/manage.sh status       # Статус
./docker/manage.sh logs         # Логи
./docker/manage.sh backup-db    # Создать бэкап
```

### Обновление проекта

```bash
sudo systemctl stop rosseti-parser.service
git pull origin main
./docker/manage.sh build
sudo systemctl start rosseti-parser.service
```

## 🛠️ Ручной деплой (если нужен контроль)

### 1. Подготовка сервера

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Перелогиниться для применения группы docker
logout
```

### 2. Клонирование и настройка

```bash
git clone https://github.com/your-username/parser_rosseti.git
cd parser_rosseti

# Создание папок
mkdir -p data logs reports backups
chmod 755 data logs reports backups
chmod +x docker/manage.sh docker/entrypoint.sh docker/start.sh

# Настройка конфигурации
cp env.example .env
nano .env
```

### 3. Создание systemd сервиса

```bash
sudo nano /etc/systemd/system/rosseti-parser.service
```

**Содержимое файла (замените username и пути):**

```ini
[Unit]
Description=Rosseti Parser Bot
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/username/parser_rosseti
ExecStart=/home/username/parser_rosseti/docker/manage.sh start
ExecStop=/home/username/parser_rosseti/docker/manage.sh stop
TimeoutStartSec=0
User=username
Group=username

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable rosseti-parser.service
sudo systemctl start rosseti-parser.service
```

### 4. Первый запуск

```bash
./docker/manage.sh build
./docker/manage.sh start
./docker/manage.sh status
```

## 🔐 Безопасность

### Базовый файрвол

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw enable
```

### Защита конфигурации

```bash
chmod 600 .env
cp .env .env.backup
```

## 🆘 Устранение проблем

### Контейнер не запускается

```bash
./docker/manage.sh logs
docker images | grep rosseti
./docker/manage.sh build --no-cache
```

### Бот не отвечает

```bash
grep TELEGRAM_BOT_TOKEN .env
curl -I https://api.telegram.org
sudo systemctl restart rosseti-parser.service
```

### Нет места на диске

```bash
df -h
docker system prune -a
find backups/ -name "*.tar.gz" -mtime +14 -delete
```

## 📞 Получение Chat ID для админа

1. Запустите бота: `/start`
2. Отправьте любое сообщение
3. Посмотрите в логах: `./docker/manage.sh logs`
4. Найдите строку с вашим Chat ID
5. Добавьте его в `.env`: `TELEGRAM_ADMIN_CHAT=123456789`

## 🎯 Готово!

После деплоя у вас будет:

- ✅ Автозапуск бота при старте сервера
- ✅ Автоматические бэкапы базы данных
- ✅ Логирование всех операций
- ✅ Возможность управления через Telegram
- ✅ Легкое обновление через Git

**Команда для проверки всего:**

```bash
./docker/manage.sh status && sudo systemctl status rosseti-parser.service
```
