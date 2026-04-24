import { Client } from 'pg';
import {
  INVEST_REFERENCE_TABLES,
  CONTRACT_ROW_SEEDS,
  INVEST_PROGRAM_SEEDS,
  CONTRACT_ADDITIONAL_AGREEMENTS_SEEDS,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ReferenceTableDefinition,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ContractRowSeed,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  InvestProgramRowSeed,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ContractAdditionalAgreementSeed,
} from '../config/config.js';

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

// Обеспечивает наличие вспомогательных справочных таблиц и
// заполняет их начальными значениями, если таблица еще пуста.
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

// Обеспечивает наличие таблицы контрактов и начальное заполнение,
// чтобы приложение могло работать с данными договоров.
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

// Обеспечивает наличие таблицы инвестпрограммы и начальное заполнение.
export async function ensureInvestProgramTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "GN_invest_program" (
      "GN_invest_program_id" SERIAL NOT NULL UNIQUE,
      "GN_invest_pf_npf" TEXT NOT NULL,
      "GN_invest_name" TEXT NOT NULL,
      "GN_invest_quantity" INTEGER NOT NULL,
      "GN_invest_okdp_fk" INTEGER REFERENCES "GN_invest_okdp_tko_is_prit"("GN_invest_okdp_tko_is_prit_id") ON DELETE SET NULL,
      "GN_invest_supplier_fk" INTEGER REFERENCES "GN_contractor"("GN_c_id") ON DELETE SET NULL,
      "GN_invest_ogruz_fk" INTEGER REFERENCES "GN_invest_ogruz_rekvizit"("GN_invest_ogruz_rekvizit_id") ON DELETE SET NULL,
      "GN_invest_status" TEXT NOT NULL,
      "GN_invest_payment" TEXT NOT NULL,
      "GN_invest_in_budget" TEXT NOT NULL,
      "GN_invest_peo_code" TEXT NOT NULL,
      "GN_invest_mtr_code" TEXT NOT NULL,
      "GN_invest_pzp" TEXT NOT NULL,
      "GN_invest_agent_report" TEXT NOT NULL,
      "GN_invest_ap" TEXT NOT NULL,
      "GN_invest_spec" TEXT NOT NULL,
      "GN_invest_commissioning" TEXT NOT NULL,
      "GN_invest_it_accounting" TEXT NOT NULL,
      "GN_invest_sed_spec" TEXT NOT NULL,
      "GN_invest_sed_agent_report" TEXT NOT NULL,
      "GN_invest_state" TEXT NOT NULL,
      "GN_invest_real_price_no_vat_per_unit" NUMERIC(15,2) NOT NULL,
      "GN_invest_real_sum_no_vat_plus_agent_no_vat" NUMERIC(15,2) NOT NULL,
      "GN_invest_sum_no_vat" NUMERIC(15,2) NOT NULL,
      PRIMARY KEY("GN_invest_program_id")
    )
  `);

  const rowCountResult = await client.query<{ row_count: string }>(
    `SELECT COUNT(*)::text AS row_count
     FROM "GN_invest_program"`
  );

  if (Number(rowCountResult.rows[0]?.row_count ?? '0') > 0) {
    return;
  }

  for (const seed of INVEST_PROGRAM_SEEDS) {
    await client.query(
      `INSERT INTO "GN_invest_program" (
         "GN_invest_pf_npf",
         "GN_invest_name",
         "GN_invest_quantity",
         "GN_invest_okdp_fk",
         "GN_invest_supplier_fk",
         "GN_invest_ogruz_fk",
         "GN_invest_status",
         "GN_invest_payment",
         "GN_invest_in_budget",
         "GN_invest_peo_code",
         "GN_invest_mtr_code",
         "GN_invest_pzp",
         "GN_invest_agent_report",
         "GN_invest_ap",
         "GN_invest_spec",
         "GN_invest_commissioning",
         "GN_invest_it_accounting",
         "GN_invest_sed_spec",
         "GN_invest_sed_agent_report",
         "GN_invest_state",
         "GN_invest_real_price_no_vat_per_unit",
         "GN_invest_real_sum_no_vat_plus_agent_no_vat",
         "GN_invest_sum_no_vat"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
      [
        seed.pfNpf,
        seed.name,
        seed.quantity,
        seed.okdpFk,
        seed.supplierFk,
        seed.ogruzFk,
        seed.status,
        seed.payment,
        seed.inBudget,
        seed.peoCode,
        seed.mtrCode,
        seed.pzp,
        seed.agentReport,
        seed.ap,
        seed.spec,
        seed.commissioning,
        seed.itAccounting,
        seed.sedSpec,
        seed.sedAgentReport,
        seed.state,
        seed.realPriceNoVatPerUnit,
        seed.realSumNoVatPlusAgentNoVat,
        seed.sumNoVat,
      ]
    );
  }
}

// Обеспечивает наличие таблицы дополнительных соглашений к контрактам.
export async function ensureContractAdditionalAgreementsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "GN_contract_additional_agreements" (
      "GN_additional_agreement_id" SERIAL NOT NULL UNIQUE,
      "GN_contract_id_FK" INTEGER NOT NULL REFERENCES "GN_contracts"("GN_contract_id") ON DELETE CASCADE,
      "GN_additional_agreement_number" TEXT NOT NULL,
      "GN_additional_agreement_date" DATE NOT NULL,
      "GN_additional_agreement_description" TEXT NOT NULL,
      "GN_additional_agreement_amount" NUMERIC(15,2) NOT NULL,
      PRIMARY KEY("GN_additional_agreement_id")
    )
  `);

  const rowCountResult = await client.query<{ row_count: string }>(
    `SELECT COUNT(*)::text AS row_count
     FROM "GN_contract_additional_agreements"`
  );

  if (Number(rowCountResult.rows[0]?.row_count ?? '0') > 0) {
    return;
  }

  for (const seed of CONTRACT_ADDITIONAL_AGREEMENTS_SEEDS) {
    await client.query(
      `INSERT INTO "GN_contract_additional_agreements" (
         "GN_contract_id_FK",
         "GN_additional_agreement_number",
         "GN_additional_agreement_date",
         "GN_additional_agreement_description",
         "GN_additional_agreement_amount"
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        seed.contractId,
        seed.number,
        seed.date,
        seed.description,
        seed.amount,
      ]
    );
  }
}

// Обеспечивает наличие таблицы расчета лимитов для строк BDR.
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

// Обеспечивает наличие таблицы ежемесячного прогноза и необходимые индексы.
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

// Приводит входное значение к конечному числу или выбрасывает ошибку для некорректных полей.
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