# 🐳 Docker Setup для Парсера Россети

Полное руководство по развертыванию и управлению Telegram ботом парсера отключений электроэнергии в Docker.

## 📋 Оглавление

- [🚀 Быстрый старт](#-быстрый-старт)
- [⚙️ Детальная настройка](#️-детальная-настройка)
- [🎛️ Управление контейнером](#️-управление-контейнером)
- [📊 Мониторинг](#-мониторинг)
- [🔧 Troubleshooting](#-troubleshooting)
- [📂 Структура проекта](#-структура-проекта)

## 🚀 Быстрый старт

### Предварительные требования

- Docker 20.10+
- Docker Compose 2.0+
- Telegram Bot Token (получите у [@BotFather](https://t.me/botfather))

### Шаг 1: Клонирование и настройка

```bash
# Перейдите в директорию проекта
cd parser_rosseti

# Создайте .env файл из шаблона
cp env.example .env

# Отредактируйте .env файл
nano .env
```

### Шаг 2: Настройка .env файла

```bash
# Обязательные параметры
TELEGRAM_BOT_TOKEN=ваш_токен_от_botfather
TELEGRAM_ADMIN_CHAT=ваш_chat_id

# Опциональные параметры
NODE_ENV=production
TZ=Europe/Moscow
LOG_LEVEL=info
```

### Шаг 3: Запуск

```bash
# Простой запуск
./docker/start.sh

# Или с помощью скрипта управления
./docker/manage.sh start
```

## ⚙️ Детальная настройка

### Получение Telegram Bot Token

1. Откройте Telegram и найдите [@BotFather](https://t.me/botfather)
2. Отправьте `/newbot`
3. Введите имя бота (например: "Россети Парсер")
4. Введите username (например: "rosseti_parser_bot")
5. Скопируйте полученный токен в .env файл

### Получение Chat ID

1. Запустите временно бота: `./docker/manage.sh start`
2. Напишите боту `/start` в Telegram
3. Посмотрите логи: `./docker/manage.sh logs`
4. Найдите ваш chat_id в логах и добавьте в .env

### Структура .env файла

```bash
# ===============================================
# 🤖 Telegram Bot Configuration
# ===============================================

# Токен вашего Telegram бота (ОБЯЗАТЕЛЬНО)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# ID чата администратора (РЕКОМЕНДУЕТСЯ)
TELEGRAM_ADMIN_CHAT=123456789

# ===============================================
# 🌍 Environment Settings
# ===============================================

NODE_ENV=production
TZ=Europe/Moscow
LOG_LEVEL=info

# ===============================================
# 🔧 Optional Advanced Settings
# ===============================================

# Интервал проверки (в минутах)
CHECK_INTERVAL=60

# Максимальное количество попыток при ошибке
MAX_RETRY_ATTEMPTS=3

# Таймаут для HTTP запросов (в миллисекундах)
HTTP_TIMEOUT=30000
```

## 🎛️ Управление контейнером

### Основные команды

```bash
# Запуск бота
./docker/manage.sh start

# Остановка бота
./docker/manage.sh stop

# Перезапуск бота
./docker/manage.sh restart

# Статус контейнеров
./docker/manage.sh status

# Просмотр логов
./docker/manage.sh logs

# Логи в реальном времени
./docker/manage.sh logs-follow
```

### Дополнительные команды

```bash
# Вход в контейнер
./docker/manage.sh shell

# Пересборка образа
./docker/manage.sh build

# Запуск API версии
./docker/manage.sh api

# Запуск тестов
./docker/manage.sh test

# Очистка всех данных
./docker/manage.sh clean
```

### Работа с данными

```bash
# Создание бэкапа
./docker/manage.sh backup

# Восстановление из бэкапа
./docker/manage.sh restore

# Просмотр использования ресурсов
docker stats rosseti-parser-bot
```

## 📊 Мониторинг

### Проверка состояния

```bash
# Статус контейнера
docker-compose ps

# Использование ресурсов
docker stats rosseti-parser-bot

# Healthcheck
docker inspect rosseti-parser-bot | grep -A 5 Health
```

### Логи

```bash
# Последние логи
docker-compose logs --tail=100 rosseti-parser

# Логи в реальном времени
docker-compose logs -f rosseti-parser

# Поиск в логах
docker-compose logs rosseti-parser | grep "ERROR"
```

### Мониторинг файлов

```bash
# Размер базы данных
ls -lh data/subscriptions.db

# Количество логов
ls -la logs/ | wc -l

# Размер отчетов
du -sh reports/
```

## 🔧 Troubleshooting

### Проблема: Бот не запускается

**Решение:**

```bash
# 1. Проверьте .env файл
cat .env | grep TELEGRAM_BOT_TOKEN

# 2. Проверьте логи
./docker/manage.sh logs

# 3. Пересоберите образ
./docker/manage.sh build

# 4. Перезапустите
./docker/manage.sh restart
```

### Проблема: Нет прав доступа к файлам

**Решение:**

```bash
# Исправление прав доступа
sudo chown -R $USER:$USER data/ logs/ reports/
chmod -R 755 data/ logs/ reports/
```

### Проблема: Playwright не работает

**Решение:**

```bash
# Пересоберите с очисткой кеша
docker-compose build --no-cache

# Проверьте установку Chromium
./docker/manage.sh shell
npx playwright install chromium --with-deps
```

### Проблема: База данных заблокирована

**Решение:**

```bash
# Остановите бота
./docker/manage.sh stop

# Проверьте блокировки
lsof data/subscriptions.db

# Перезапустите
./docker/manage.sh start
```

### Проблема: Нехватка места на диске

**Решение:**

```bash
# Очистка логов Docker
docker system prune -f

# Очистка старых образов
docker image prune -f

# Ротация логов приложения
find logs/ -name "*.json" -mtime +30 -delete
```

## 📂 Структура проекта

```
parser_rosseti/
├── docker/
│   ├── entrypoint.sh      # Точка входа контейнера
│   ├── start.sh          # Скрипт быстрого запуска
│   └── manage.sh         # Скрипт управления
├── src/                  # Исходный код
├── data/                 # База данных (volume)
├── logs/                 # Логи приложения (volume)
├── reports/              # Отчеты (volume)
├── Dockerfile            # Конфигурация образа
├── docker-compose.yml    # Оркестрация контейнеров
├── .env                  # Переменные окружения
└── env.example          # Шаблон переменных
```

### Volumes

- `./data:/app/data` - База данных SQLite с подписками
- `./logs:/app/logs` - Логи работы приложения
- `./reports:/app/reports` - Сгенерированные отчеты
- `playwright-cache` - Кеш браузера Playwright

### Порты

- `3000` - API интерфейс (только при запуске API профиля)

## 🚨 Автозапуск при старте системы

### Systemd (Linux)

```bash
# Создайте service файл
sudo nano /etc/systemd/system/rosseti-parser.service
```

```ini
[Unit]
Description=Rosseti Parser Bot
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/path/to/parser_rosseti
ExecStart=/path/to/parser_rosseti/docker/start.sh
ExecStop=docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```bash
# Активируйте службу
sudo systemctl enable rosseti-parser.service
sudo systemctl start rosseti-parser.service
```

### Docker Compose restart policy

Контейнер автоматически перезапускается благодаря `restart: unless-stopped` в docker-compose.yml.

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи: `./docker/manage.sh logs`
2. Проверьте статус: `./docker/manage.sh status`
3. Создайте issue в репозитории проекта
4. Приложите:
   - Содержимое .env (без токенов)
   - Логи контейнера
   - Версии Docker и Docker Compose

## 🔄 Обновление

```bash
# Остановите текущую версию
./docker/manage.sh stop

# Обновите код
git pull

# Пересоберите образ
./docker/manage.sh build

# Запустите новую версию
./docker/manage.sh start
```
