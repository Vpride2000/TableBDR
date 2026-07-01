import 'dotenv/config';
import express from 'express';
import { setupRoutes } from './routes.js';
import { createDbClient, ensureDatabaseTables, ensureContractColumns } from './db.js';

// Точка входа backend-приложения.
// Загружает переменные окружения, создает Express-приложение,
// настраивает маршруты и инициализирует базу данных перед запуском.
const PORT = process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : 4000;
const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) || ['*'];

const app = express();

// Разрешаем CORS для фронтенда на другом хосте/порту.
const CORS_ALLOW_CREDENTIALS = process.env.CORS_ALLOW_CREDENTIALS === 'true';
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isAllowedOrigin = origin && (CORS_ALLOWED_ORIGINS.includes('*') || CORS_ALLOWED_ORIGINS.includes(origin));

  if (isAllowedOrigin) {
    const allowOrigin = CORS_ALLOWED_ORIGINS.includes('*') ? '*' : origin;
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

    if (allowOrigin !== '*' && CORS_ALLOW_CREDENTIALS) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (allowOrigin !== '*') {
      res.setHeader('Vary', 'Origin');
    }
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// Use JSON payloads if needed later
app.use(express.json());

setupRoutes(app);

async function start(): Promise<void> {
  const client = await createDbClient();

  try {
    // Проверяем и создаем обязательные таблицы, если они отсутствуют.
    await ensureDatabaseTables(client);
    await ensureContractColumns(client);
  } finally {
    await client.end();
  }

  // Запускаем HTTP-сервер после успешной инициализации базы данных.
  app.listen(PORT, () => {
    console.log(`🚀 Backend listening at http://localhost:${PORT}`);
  });
}

start().catch((err: unknown) => {
  console.error('Unexpected error starting server', err);
  process.exit(1);
});
