import { Client } from 'pg';
import {
  INVEST_REFERENCE_TABLES,
  CONTRACT_ROW_SEEDS,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ReferenceTableDefinition,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ContractRowSeed,
} from '../config/config.js';

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

export async function ensureInvestReferenceTables(client: Client): Promise<void> {
  for (const definition of INVEST_REFERENCE_TABLES) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${definition.tableName}" (
        "${definition.idColumn}" SERIAL NOT NULL UNIQUE,
        "${definition.valueColumn}" TEXT NOT NULL,
        PRIMARY KEY("${definition.idColumn}")
      )
    `);

    const rowCountResult = await client.query<{ row_count: string }>(
      `SELECT COUNT(*)::text AS row_count
       FROM "${definition.tableName}"`
    );

    if (Number(rowCountResult.rows[0]?.row_count ?? '0') > 0) {
      continue;
    }

    for (const value of definition.seedValues) {
      await client.query(
        `INSERT INTO "${definition.tableName}" ("${definition.valueColumn}") VALUES ($1)`,
        [value]
      );
    }
  }
}

export async function ensureContractsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "GN_contracts" (
      "GN_contract_id" SERIAL NOT NULL UNIQUE,
      "GN_contract_contractor_FK" INTEGER NOT NULL REFERENCES "GN_contractor"("GN_c_id") ON DELETE NO ACTION,
      "GN_contract_dogovor_FK" INTEGER NOT NULL REFERENCES "GN_dogovor"("GN_dgv_id") ON DELETE NO ACTION,
      "GN_contract_sed_launch_date" DATE NOT NULL,
      "GN_contract_asez_load_date" DATE NOT NULL,
      "GN_contract_state" TEXT NOT NULL,
      "GN_contract_status_updated_at" DATE NOT NULL,
      PRIMARY KEY("GN_contract_id")
    )
  `);

  const rowCountResult = await client.query<{ row_count: string }>(
    `SELECT COUNT(*)::text AS row_count
     FROM "GN_contracts"`
  );

  if (Number(rowCountResult.rows[0]?.row_count ?? '0') > 0) {
    return;
  }

  for (const seed of CONTRACT_ROW_SEEDS) {
    await client.query(
      `INSERT INTO "GN_contracts" (
         "GN_contract_contractor_FK",
         "GN_contract_dogovor_FK",
         "GN_contract_sed_launch_date",
         "GN_contract_asez_load_date",
         "GN_contract_state",
         "GN_contract_status_updated_at"
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [seed.contractorId, seed.dogovorId, seed.sedLaunchDate, seed.asezLoadDate, seed.state, seed.statusUpdatedAt]
    );
  }
}

export async function ensureLimitCalculationTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "GN_bdr_limit_calculation" (
      "GN_bdr_limit_calc_id" SERIAL PRIMARY KEY,
      "GN_bdr_ID_FK" INTEGER NOT NULL REFERENCES "GN_bdr"("GN_bdr_ID") ON DELETE CASCADE,
      "line_order" INTEGER NOT NULL,
      "quantity" NUMERIC NOT NULL DEFAULT 0,
      "tariff" NUMERIC NOT NULL DEFAULT 0,
      "line_note" TEXT NOT NULL DEFAULT '',
      UNIQUE ("GN_bdr_ID_FK", "line_order")
    )
  `);
}

export async function ensureForecastMonthlyTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "GN_bdr_monthly_forecast" (
      "GN_bdr_monthly_forecast_id" SERIAL PRIMARY KEY,
      "budget_item" TEXT NOT NULL,
      "contractor" TEXT NOT NULL,
      "dogovor" TEXT NOT NULL,
      "department" TEXT NOT NULL,
      "GN_bdr_ID_FK" INTEGER,
      "month_index" SMALLINT NOT NULL CHECK ("month_index" BETWEEN 0 AND 11),
      "month_value" NUMERIC NOT NULL DEFAULT 0,
      "month_fact_value" NUMERIC NOT NULL DEFAULT 0,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("budget_item", "contractor", "dogovor", "department", "month_index")
    )
  `);

  await client.query(`
    ALTER TABLE "GN_bdr_monthly_forecast"
    ADD COLUMN IF NOT EXISTS "GN_bdr_ID_FK" INTEGER
  `);

  await client.query(`
    ALTER TABLE "GN_bdr_monthly_forecast"
    ADD COLUMN IF NOT EXISTS "month_fact_value" NUMERIC NOT NULL DEFAULT 0
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "GN_bdr_monthly_forecast_row_month_uniq"
    ON "GN_bdr_monthly_forecast" ("GN_bdr_ID_FK", "month_index")
    WHERE "GN_bdr_ID_FK" IS NOT NULL
  `);

  await client.query(`
    ALTER TABLE "GN_bdr_monthly_forecast"
    DROP CONSTRAINT IF EXISTS "GN_bdr_monthly_forecast_budget_item_contractor_dogovor_depa_key"
  `);
}

export function toFiniteNumber(value: unknown, fieldLabel: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${fieldLabel}`);
  }
  return parsed;
}

export function buildFallbackCalculationLine(quantity: number, limit: number, unitLimit: number): import('../config/config.js').LimitCalculationResponseLine {
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