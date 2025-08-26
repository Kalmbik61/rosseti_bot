# 💾 Руководство по системе бэкапов

## Обзор

Система бэкапов обеспечивает надежное сохранение и восстановление базы данных SQLite с подписками и историей отключений электроэнергии.

## Возможности

### 🛠️ Управление через Docker

```bash
# Создать полный бэкап (данные + логи + отчеты)
./docker/manage.sh backup

# Создать бэкап только базы данных
./docker/manage.sh backup-db

# Показать список всех бэкапов
./docker/manage.sh backup-list

# Настроить автоматические бэкапы
./docker/manage.sh backup-auto

# Восстановить полные данные
./docker/manage.sh restore

# Восстановить только базу данных
./docker/manage.sh restore-db
```

### 🤖 Управление через Telegram бота

**Админские команды:**

- `/admin_backup` - создать бэкап базы данных
- `/admin_backup_list` - список всех бэкапов
- `/admin_backup_restore` - восстановить из бэкапа

## Типы бэкапов

### 1. 📦 Полный бэкап (`tar.gz`)

- **Содержит:** `data/`, `logs/`, `reports/`
- **Местоположение:** `backups/rosseti-full-backup-YYYYMMDD-HHMMSS.tar.gz`
- **Использование:** Полное восстановление системы

### 2. 🗄️ Бэкап базы данных (`.db`)

- **Содержит:** Только файл SQLite базы данных
- **Местоположение:** `data/backups/backup_YYYY-MM-DD_HH-MM-SS.db`
- **Использование:** Быстрое восстановление данных

## Автоматические бэкапы

### Настройка через `manage.sh`

```bash
./docker/manage.sh backup-auto
```

**Доступные расписания:**

1. Ежедневно в 3:00
2. Каждые 6 часов
3. Каждые 12 часов
4. Еженедельно (воскресенье в 2:00)

### Ротация файлов

- **По умолчанию:** хранится 7 последних бэкапов БД
- **Автоочистка:** поврежденные бэкапы удаляются автоматически
- **Валидация:** каждый бэкап проверяется на целостность

## Структура файлов

```
parser_rosseti/
├── data/
│   ├── subscriptions.db          # Основная база данных
│   └── backups/                  # Бэкапы БД
│       ├── backup_2024-01-15_03-00-00.db
│       └── backup_2024-01-16_03-00-00.db
├── backups/                      # Полные бэкапы
│   ├── rosseti-full-backup-20240115-030000.tar.gz
│   └── rosseti-full-backup-20240116-030000.tar.gz
└── logs/
    └── backup-cron.log          # Логи автоматических бэкапов
```

## Использование в коде

### Создание бэкапа

```typescript
import { backupManager } from "./utils/backup.js";

// Создание бэкапа
const backupPath = await backupManager.createBackup();
console.log("Бэкап создан:", backupPath);

// Создание бэкапа с именем
const namedBackup = await backupManager.createBackup("manual-backup");
```

### Список бэкапов

```typescript
// Получение списка всех бэкапов
const backups = await backupManager.listBackups();

backups.forEach((backup) => {
  console.log(
    `${backup.filename} - ${backup.size} bytes - ${
      backup.isValid ? "OK" : "Поврежден"
    }`
  );
});
```

### Восстановление

```typescript
// Восстановление из бэкапа
await backupManager.restoreFromBackup("/path/to/backup.db");
console.log("База данных восстановлена");
```

### Автоматические бэкапы с планировщиком

```typescript
import { scheduler } from "./utils/scheduler.js";

// Добавить задачу ежедневного бэкапа в 3:00
scheduler.addBackupTask("0 3 * * *");
scheduler.startTask("auto-backup");

// Получить статистику
const stats = scheduler.getStats();
console.log(`Активных задач: ${stats.activeTasks}`);
console.log(`Последний бэкап: ${stats.lastBackup}`);
console.log(`Следующий бэкап: ${stats.nextBackup}`);
```

## Мониторинг

### Проверка статуса

```bash
# Общая информация
./docker/manage.sh backup-list

# Логи автоматических бэкапов
tail -f logs/backup-cron.log

# Проверка cron заданий
./docker/manage.sh backup-auto
# Выберите "5) Показать текущие настройки cron"
```

### Через Telegram бота

```
/admin_backup_list - подробная информация о всех бэкапах
/admin_stats - общая статистика системы
```

## Восстановление после сбоя

### 1. Восстановление базы данных

```bash
# Остановить бота
./docker/manage.sh stop

# Восстановить БД
./docker/manage.sh restore-db

# Запустить бота
./docker/manage.sh start
```

### 2. Полное восстановление

```bash
# Остановить все сервисы
./docker/manage.sh stop

# Восстановить все данные
./docker/manage.sh restore

# Запустить сервисы
./docker/manage.sh start
```

### 3. Через Telegram (только БД)

1. Отправить `/admin_backup_restore`
2. Выбрать нужный бэкап из списка
3. Подтвердить восстановление

## Безопасность

### Рекомендации

1. **Регулярность:** настройте автоматические ежедневные бэкапы
2. **Тестирование:** периодически проверяйте восстановление из бэкапов
3. **Мониторинг:** следите за логами автоматических бэкапов
4. **Внешние копии:** регулярно копируйте бэкапы в безопасное место

### Ограничения доступа

- Команды бэкапа доступны только администраторам (настройка в `.env`)
- Файлы бэкапов хранятся внутри контейнера (volume mount)
- Восстановление автоматически создает резервную копию текущей БД

## Устранение проблем

### Бэкап не создается

```bash
# Проверить права на папки
ls -la data/ data/backups/

# Проверить место на диске
df -h

# Проверить логи
./docker/manage.sh logs
```

### Автоматические бэкапы не работают

```bash
# Проверить cron задания
crontab -l | grep backup

# Проверить логи
tail -f logs/backup-cron.log

# Пересоздать задание
./docker/manage.sh backup-auto
```

### Восстановление не работает

```bash
# Проверить целостность бэкапа
./docker/manage.sh backup-list

# Попробовать через Docker
./docker/manage.sh restore-db

# Проверить логи
./docker/manage.sh logs
```

## Интеграция с другими системами

### Webhook при создании бэкапа

```typescript
// Добавить в код после создания бэкапа
const backupPath = await backupManager.createBackup();

// Отправить уведомление во внешнюю систему
await fetch("https://your-webhook.com/backup-created", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    backup_path: backupPath,
    timestamp: new Date().toISOString(),
    size: await backupManager.getDatabaseSize(),
  }),
});
```

### Загрузка в облако

```bash
# Пример для AWS S3
aws s3 sync data/backups/ s3://your-bucket/rosseti-backups/

# Пример для rsync
rsync -av data/backups/ user@backup-server:/backups/rosseti/
```
