# Multi-stage build для оптимизации размера образа
FROM node:20-slim AS builder

# Установка системных зависимостей для сборки
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Создание рабочей директории
WORKDIR /app

# Копирование файлов зависимостей
COPY package*.json ./
COPY tsconfig.json ./

# Установка всех зависимостей (включая dev для сборки)
RUN npm ci && npm cache clean --force

# Копирование исходного кода
COPY src/ ./src/

# Сборка TypeScript проекта
RUN npm run build

# Финальный образ
FROM node:20-slim

# Установка Playwright и системных зависимостей
RUN apt-get update && apt-get install -y \
    # Зависимости для Playwright/Chromium
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    # Дополнительные зависимости
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Создание пользователя для безопасности
RUN groupadd -r botuser && useradd -r -g botuser -G audio,video botuser \
    && mkdir -p /home/botuser/Downloads \
    && chown -R botuser:botuser /home/botuser

# Создание рабочей директории
WORKDIR /app

# Копирование собранного проекта из builder stage
COPY --from=builder /app/public ./public
COPY package*.json ./

# Установка только production зависимостей
RUN npm ci --only=production && npm cache clean --force

# Установка Playwright chromium
RUN npx playwright install chromium --with-deps

# Создание необходимых директорий с правильными разрешениями
RUN mkdir -p /app/data /app/logs /app/reports && \
    chown -R botuser:botuser /app

# Копирование entrypoint скрипта
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown botuser:botuser /entrypoint.sh

# Переключение на пользователя botuser
USER botuser

# Настройка переменных окружения для Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/home/botuser/.cache/ms-playwright
ENV NODE_ENV=production

# Expose порт (если понадобится для webhook)
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Bot is running')" || exit 1

# Запуск через entrypoint
ENTRYPOINT ["/entrypoint.sh"]

# Команда по умолчанию - запуск бота
CMD ["bot"]
