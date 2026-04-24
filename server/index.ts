import 'dotenv/config';
import express from 'express';
import { setupRoutes } from './routes/routes.js';
import { createDbClient, ensureInvestReferenceTables, ensureContractsTable, ensureInvestProgramTable, ensureContractAdditionalAgreementsTable, ensureForecastMonthlyTable } from './db/db.js';

// Точка входа backend-приложения.
// Загружает переменные окружения, создает Express-приложение,
// настраивает маршруты и инициализирует базу данных перед запуском.
const PORT = process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : 4000;

const app = express();

// Use JSON payloads if needed later
app.use(express.json());

setupRoutes(app);

async function start(): Promise<void> {
  const client = await createDbClient();

  try {
    // Проверяем и создаем обязательные таблицы, если они отсутствуют.
    await ensureInvestReferenceTables(client);
    await ensureContractsTable(client);
    await ensureInvestProgramTable(client);
    await ensureContractAdditionalAgreementsTable(client);
    await ensureForecastMonthlyTable(client);
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
