# TableBDR — Budget Management Table with PostgreSQL

A React + TypeScript + Webpack project with a collapsible budget table connected to PostgreSQL. Displays telecom and connectivity service budgets with expandable row groups.

## 🧭 Начало

Сводный дашбоард по проекту:

- **Стек:** React 19, TypeScript, Webpack, Express, PostgreSQL
- **Запуск:** `npm install` → создать `.env` → `npm run server` → `npm run dev`
- **Фронтенд:** `src/` (`App.tsx`, `BudgetTable.tsx`, `main.tsx`)
- **Бэкенд:** `server/` (`index.ts`, API `/api/*`, `GET /api/health`)
- **Скрипты:** `scripts/testPostgresConnection.ts`, seed/инициализация БД
- **Схема БД:** GN/PAO таблицы (`GN_bdr`, `GN_department`, `GN_dogovor`, и т.д.)
- **Особенности:** коллапсируемые строки, HMR, строгий TypeScript, ESLint, dev proxy `/api/*`
- **Сборка:** `npm run build` → результат в `dist/bundle.js`

## 🚀 Quick Start

### Prerequisites
- Node.js 20.18.2+
- PostgreSQL 13+ (local or remote)
- npm

### 1. Clone & Install
```bash

cd TableBDR
npm install
```

### 2. Configure Environment
Create `.env` file in root:
```env
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=postgres
# TableBDR

TableBDR - веб-система для ведения и анализа бюджетных данных (БДР) по направлениям связи и смежным сущностям: подразделения, договоры, контрагенты, объекты, лимиты и спутниковые/сотовые сервисы.

## Назначение

Проект предоставляет единый интерфейс для:

- просмотра бюджетных таблиц с детализацией по разным срезам;
- перехода к карточкам связанных сущностей (договор, подразделение, объект и др.);
- анализа агрегированных показателей по подразделениям и бюджетным статьям;
- работы с доменными данными, загружаемыми и хранимыми в PostgreSQL.

## Архитектура

Приложение состоит из двух частей:

- Frontend (React + TypeScript + Webpack): отвечает за маршрутизацию, таблицы, карточки и аналитические представления.
- Backend (Express + TypeScript): предоставляет API для чтения/подготовки данных и интеграции с PostgreSQL.

Во время разработки frontend и backend запускаются раздельно, при этом frontend работает через проксирование API-запросов к backend.

## Предметные модули

- Бюджетный контур: таблица БДР, детализация по подразделениям и статьям, сводные представления.
- Контракты: страницы списка и детальной информации по договорам.
- Инвест-программа: отдельная таблица и связанные сценарии анализа.
- Спутниковые сервисы: контроль и детализация спутниковых данных.
- Сотовая связь: отдельный экран и справочник тарифов.

## Технический стек

- React 19
- TypeScript 5
- Webpack 5
- Express 5
- PostgreSQL (`pg`)
- ESLint

## API

Backend предоставляет REST-эндпоинты в пространстве `/api/*`.

Базовая проверка доступности сервиса:

- `GET /api/health`

## Структура репозитория

```text
TableBDR/
├── src/                    # UI и предметные модули frontend
│   ├── budget/
│   ├── contract/
│   ├── Purchase/
│   ├── satellites/
│   ├── cellular/
│   ├── hooks/
│   ├── utils/
│   └── types/
├── server/                 # API, подключение к БД, SQL-инициализация
├── scripts/                # Bootstrap/проверочные и сервисные скрипты
├── public/                 # Публичные статические ресурсы
├── dist-server/            # Результат компиляции backend
├── webpack.config.cjs
├── tsconfig*.json
└── package.json
```

## NPM-скрипты проекта

Скрипты отражают доступные режимы разработки и сборки:

- `server-dev` - запуск backend в режиме разработки.
- `front-dev` - запуск frontend dev-сервера.
- `build-front` - production-сборка frontend.
- `build-server` - компиляция backend TypeScript.
- `test:db` - проверка подключения к PostgreSQL.
- `lint` - статический анализ кода.

## Примечания

- Проект содержит отдельный серверный подпакет в `server/`, но основной контур разработки централизован через корневой `package.json`.
- Для интеграции с БД используются параметры окружения (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `SERVER_PORT`).
MIT

