import 'dotenv/config';
import express from 'express';
import { setupRoutes } from './routes/routes.js';
import { createDbClient, ensureInvestReferenceTables, ensureContractsTable, ensureForecastMonthlyTable } from './db/db.js';

const PORT = process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : 4000;

const app = express();

// Use JSON payloads if needed later
app.use(express.json());

setupRoutes(app);

async function start(): Promise<void> {
  const client = await createDbClient();

  try {
    await ensureInvestReferenceTables(client);
    await ensureContractsTable(client);
    await ensureForecastMonthlyTable(client);
  } finally {
    await client.end();
  }

  app.listen(PORT, () => {
    console.log(`🚀 Backend listening at http://localhost:${PORT}`);
  });
}

start().catch((err: unknown) => {
  console.error('Unexpected error starting server', err);
  process.exit(1);
});
