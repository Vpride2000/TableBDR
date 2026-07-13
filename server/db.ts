import { Client } from 'pg';

// Создает подключение к базе PostgreSQL по переменным окружения.
export async function createDbClient(): Promise<Client> {
  const client = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'postgres',
  });
  await client.connect();
  return client;
}

export async function ensureDatabaseTables(client: Client): Promise<void> {
  const requiredTables = [
    'GN_invest_okdp_tko_is_prit',
    'GN_invest_ogruz_rekvizit',
    'GN_contracts',
    'GN_invest_program',
    'GN_contract_additional_agreements',
    'GN_bdr_limit_calculation',
    'GN_bdr_monthly_forecast',
    'GN_satellites',
  ];

  const result = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])`,
    [requiredTables]
  );

  const existingTables = new Set(result.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((tableName) => !existingTables.has(tableName));

  if (missingTables.length > 0) {
    throw new Error(`Required database tables are missing: ${missingTables.join(', ')}`);
  }
}

export async function ensureContractColumns(client: Client): Promise<void> {
  const requiredColumns = [
    'GN_contract_date',
    'GN_contract_term_from',
    'GN_contract_term_to',
  ];

  const result = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'GN_contracts'
        AND column_name = ANY($1::text[])`,
    [requiredColumns]
  );

  const existingColumns = new Set(result.rows.map((row) => row.column_name));
  const missingColumns = requiredColumns.filter((columnName) => !existingColumns.has(columnName));

  for (const columnName of missingColumns) {
    await client.query(`ALTER TABLE "GN_contracts" ADD COLUMN IF NOT EXISTS "${columnName}" DATE`);
  }
}

// Приводит входное значение к конечному числу или выбрасывает ошибку для некорректных полей.
export function toFiniteNumber(value: unknown, fieldLabel: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${fieldLabel}`);
  }
  return parsed;
}

export function buildFallbackCalculationLine(quantity: number, limit: number, unitLimit: number): import('./config.js').LimitCalculationResponseLine {
  if (quantity === 0) {
    return { lineOrder: 1, quantity: 0, tariff: 0, note: '' };
  }

  return {
    lineOrder: 1,
    quantity,
    tariff: (limit - unitLimit) / quantity,
    note: '',
  };
}

export async function ensureSatellitesXmlTable(client: Client): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS "GN_satellite_xml_monthly" (
       "id" SERIAL PRIMARY KEY,
       "mac_norm" TEXT NOT NULL,
       "month_name" TEXT NOT NULL,
       "branch" TEXT,
       "tariff" TEXT,
       "status" TEXT NOT NULL DEFAULT 'склад',
       "amount_without_vat" NUMERIC(18,2) NOT NULL DEFAULT 0,
       "uploaded_by" TEXT NOT NULL,
       "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       UNIQUE ("mac_norm", "month_name")
     )`
  );

  await client.query(
    `ALTER TABLE "GN_satellite_xml_monthly"
     ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'склад'`
  );
}