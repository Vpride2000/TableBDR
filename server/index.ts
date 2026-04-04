import 'dotenv/config';
import express, { Express, Request, Response } from 'express';
import { Client } from 'pg';

const PORT = process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : 4000;

const app: Express = express();

// Use JSON payloads if needed later
app.use(express.json());

interface GnTableConfig {
  tableName: string;
  idColumn: string;
  editableColumns: string[];
}

interface ReferenceTableDefinition {
  entity: string;
  tableName: string;
  idColumn: string;
  valueColumn: string;
  title: string;
  seedValues: string[];
}

const INVEST_REFERENCE_TABLES: ReferenceTableDefinition[] = [
  {
    entity: 'invest-okdp-tko-is-prit',
    tableName: 'GN_invest_okdp_tko_is_prit',
    idColumn: 'GN_invest_okdp_tko_is_prit_id',
    valueColumn: 'GN_invest_okdp_tko_is_prit',
    title: 'ОКДП ТКО для ИС ПРИТ',
    seedValues: [
      '3531100000000',
      '3531200000000',
      '3531300000000',
      '3531400000000',
      '3531500000000',
    ],
  },
  {
    entity: 'invest-ogruz-rekvizit',
    tableName: 'GN_invest_ogruz_rekvizit',
    idColumn: 'GN_invest_ogruz_rekvizit_id',
    valueColumn: 'GN_invest_ogruz_rekvizit',
    title: 'Огрузочный реквизит',
    seedValues: [
      'Реквизит А',
      'Реквизит Б',
      'Реквизит В',
      'Реквизит Г',
      'Реквизит Д',
    ],
  },
];

interface ContractRowSeed {
  contractorId: number;
  dogovorId: number;
  sedLaunchDate: string;
  asezLoadDate: string;
  state: string;
  statusUpdatedAt: string;
}

const CONTRACT_ROW_SEEDS: ContractRowSeed[] = [
  {
    contractorId: 1,
    dogovorId: 1,
    sedLaunchDate: '2026-01-10',
    asezLoadDate: '2026-01-12',
    state: 'Запущен',
    statusUpdatedAt: '2026-01-13',
  },
  {
    contractorId: 2,
    dogovorId: 2,
    sedLaunchDate: '2026-01-15',
    asezLoadDate: '2026-01-16',
    state: 'В работе',
    statusUpdatedAt: '2026-01-17',
  },
  {
    contractorId: 3,
    dogovorId: 3,
    sedLaunchDate: '2026-01-20',
    asezLoadDate: '2026-01-22',
    state: 'Проверка',
    statusUpdatedAt: '2026-01-23',
  },
  {
    contractorId: 4,
    dogovorId: 4,
    sedLaunchDate: '2026-01-25',
    asezLoadDate: '2026-01-27',
    state: 'Согласование',
    statusUpdatedAt: '2026-01-28',
  },
  {
    contractorId: 5,
    dogovorId: 5,
    sedLaunchDate: '2026-02-01',
    asezLoadDate: '2026-02-03',
    state: 'Завершен',
    statusUpdatedAt: '2026-02-04',
  },
];

const GN_TABLE_CONFIGS: Record<string, GnTableConfig> = {
  departments: {
    tableName: 'GN_department',
    idColumn: 'GN_Dep_id',
    editableColumns: ['GN_department'],
  },
  'budget-items': {
    tableName: 'GN_budget_network_item',
    idColumn: 'GN_b_id',
    editableColumns: ['GN_budget_network_item'],
  },
  'pao-budget-items': {
    tableName: 'PAO__budget_network_item',
    idColumn: 'PAO_b_id',
    editableColumns: ['PAO__budget_network_item'],
  },
  contractors: {
    tableName: 'GN_contractor',
    idColumn: 'GN_c_id',
    editableColumns: ['GN_contarctor'],
  },
  dogovors: {
    tableName: 'GN_dogovor',
    idColumn: 'GN_dgv_id',
    editableColumns: ['GN_dogovor', 'GN_contarctor_FK'],
  },
  objects: {
    tableName: 'GN_departament_object',
    idColumn: 'GN_do_id',
    editableColumns: ['GN_departament_object', 'GN_department_FK'],
  },
  contracts: {
    tableName: 'GN_contracts',
    idColumn: 'GN_contract_id',
    editableColumns: [
      'GN_contract_contractor_FK',
      'GN_contract_dogovor_FK',
      'GN_contract_sed_launch_date',
      'GN_contract_asez_load_date',
      'GN_contract_state',
      'GN_contract_status_updated_at',
    ],
  },
  'invest-okdp-tko-is-prit': {
    tableName: 'GN_invest_okdp_tko_is_prit',
    idColumn: 'GN_invest_okdp_tko_is_prit_id',
    editableColumns: ['GN_invest_okdp_tko_is_prit'],
  },
  'invest-ogruz-rekvizit': {
    tableName: 'GN_invest_ogruz_rekvizit',
    idColumn: 'GN_invest_ogruz_rekvizit_id',
    editableColumns: ['GN_invest_ogruz_rekvizit'],
  },
};

const BDR_SELECT_FIELDS = `SELECT
  b."GN_bdr_ID",
  pao."PAO__budget_network_item"    AS "Статья бюджета УС",
  dep."GN_department"               AS "Подразделение",
  obj."GN_departament_object"       AS "Объект",
  dgv."GN_dogovor"                  AS "Договор",
  cnt."GN_contarctor"               AS "Контрагент",
  bni."GN_budget_network_item"      AS "Статья бюджета",
  b."GN_bdr_predmet_dogovora"       AS "Предмет договора",
  b."GN_bdr_ed.izm"                 AS "Ед. изм.",
  b."GN_bdr_kol-vo"                 AS "Кол-во",
  b."GN_bdr_limit"                  AS "Лимит",
  b."GN_bdr_edin.limit"             AS "Един. лимит",
  b."GN_bdr_comments"               AS "Примечания"
FROM "GN_bdr" b
JOIN "PAO__budget_network_item" pao ON b."PAO_budget_network_item_FK" = pao."PAO_b_id"
JOIN "GN_department"            dep ON b."GN_department_FK"           = dep."GN_Dep_id"
JOIN "GN_departament_object"    obj ON b."GN_departament_object_FK"   = obj."GN_do_id"
JOIN "GN_dogovor"               dgv ON b."GN_dogovor_FK"              = dgv."GN_dgv_id"
JOIN "GN_contractor"            cnt ON b."GN_contracor_FK"            = cnt."GN_c_id"
JOIN "GN_budget_network_item"   bni ON b."GN_budget_network_item_FK"  = bni."GN_b_id"`;

async function createDbClient(): Promise<Client> {
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

async function ensureInvestReferenceTables(client: Client): Promise<void> {
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

async function ensureContractsTable(client: Client): Promise<void> {
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

interface LimitCalculationLineInput {
  quantity: number;
  tariff: number;
  note: string;
}

interface LimitCalculationLineRow {
  line_order: number;
  quantity: string | number;
  tariff: string | number;
  line_note: string;
}

interface LimitCalculationResponseLine {
  lineOrder: number;
  quantity: number;
  tariff: number;
  note: string;
}

interface ForecastMonthlyApiRowInput {
  rowId?: unknown;
  monthlyValues?: unknown;
  monthlyFactValues?: unknown;
}

interface ForecastMonthlyDbRow {
  row_id: number | string;
  month_index: number | string;
  month_value: number | string;
  month_fact_value: number | string;
}

async function ensureLimitCalculationTable(client: Client): Promise<void> {
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

async function ensureForecastMonthlyTable(client: Client): Promise<void> {
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

function toFiniteNumber(value: unknown, fieldLabel: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${fieldLabel}`);
  }
  return parsed;
}

function buildFallbackCalculationLine(quantity: number, limit: number, unitLimit: number): LimitCalculationResponseLine {
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

app.get('/api/gn/forecast-monthly', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    await ensureForecastMonthlyTable(client);

    const result = await client.query<ForecastMonthlyDbRow>(
      `SELECT
         "GN_bdr_ID_FK" AS row_id,
         "month_index" AS month_index,
        "month_value" AS month_value,
        "month_fact_value" AS month_fact_value
       FROM "GN_bdr_monthly_forecast"
       WHERE "GN_bdr_ID_FK" IS NOT NULL
       ORDER BY
         "GN_bdr_ID_FK" ASC,
         "month_index" ASC`
    );

    const grouped = new Map<number, {
      rowId: number;
      monthlyValues: number[];
      monthlyFactValues: number[];
    }>();

    result.rows.forEach((row) => {
      const rowId = Number(row.row_id);
      const monthIndex = Number(row.month_index);
      const monthValue = Number(row.month_value ?? 0);
      const monthFactValue = Number(row.month_fact_value ?? 0);
      if (!Number.isFinite(rowId)) {
        return;
      }

      const existing = grouped.get(rowId) ?? {
        rowId,
        monthlyValues: new Array<number>(12).fill(0),
        monthlyFactValues: new Array<number>(12).fill(0),
      };

      if (monthIndex >= 0 && monthIndex < 12) {
        existing.monthlyValues[monthIndex] = Number.isFinite(monthValue) ? monthValue : 0;
        existing.monthlyFactValues[monthIndex] = Number.isFinite(monthFactValue) ? monthFactValue : 0;
      }

      grouped.set(rowId, existing);
    });

    res.json({ rows: [...grouped.values()] });
  } catch (err) {
    console.error('Failed to fetch monthly forecast', err);
    res.status(500).json({ error: 'Failed to fetch monthly forecast' });
  } finally {
    await client.end();
  }
});

app.put('/api/gn/forecast-monthly', async (req: Request, res: Response): Promise<void> => {
  const payload = req.body as { rows?: ForecastMonthlyApiRowInput[] };

  if (!Array.isArray(payload.rows)) {
    res.status(400).json({ error: 'Rows are required' });
    return;
  }

  const validatedRows: Array<{
    rowId: number;
    monthlyValues: number[];
    monthlyFactValues: number[];
  }> = [];

  try {
    payload.rows.forEach((row, index) => {
      const monthlyValuesRaw = row.monthlyValues;
      if (!Array.isArray(monthlyValuesRaw) || monthlyValuesRaw.length !== 12) {
        throw new Error(`Invalid monthlyValues in row ${index + 1}`);
      }

      const monthlyValues = monthlyValuesRaw.map((value, monthIndex) =>
        toFiniteNumber(value, `row ${index + 1} month ${monthIndex + 1}`)
      );

      const monthlyFactValuesRaw = row.monthlyFactValues;
      const monthlyFactValues = Array.isArray(monthlyFactValuesRaw)
        ? monthlyFactValuesRaw.map((value, monthIndex) =>
            toFiniteNumber(value, `row ${index + 1} fact month ${monthIndex + 1}`)
          )
        : new Array<number>(12).fill(0);

      if (monthlyFactValues.length !== 12) {
        throw new Error(`Invalid monthlyFactValues in row ${index + 1}`);
      }

      validatedRows.push({
        rowId: toFiniteNumber(row.rowId, `row ${index + 1} rowId`),
        monthlyValues,
        monthlyFactValues,
      });
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid payload' });
    return;
  }

  const client = await createDbClient();
  try {
    await client.query('BEGIN');
    await ensureForecastMonthlyTable(client);

    for (const row of validatedRows) {
      const namesResult = await client.query<{
        budget_item: string;
        contractor: string;
        dogovor: string;
        department: string;
      }>(
        `SELECT
           COALESCE(NULLIF(TRIM(bni."GN_budget_network_item"), ''), '—') AS budget_item,
           COALESCE(NULLIF(TRIM(cnt."GN_contarctor"), ''), '—') AS contractor,
           COALESCE(NULLIF(TRIM(dgv."GN_dogovor"), ''), '—') AS dogovor,
           COALESCE(NULLIF(TRIM(dep."GN_department"), ''), '—') AS department
         FROM "GN_bdr" b
         JOIN "GN_budget_network_item" bni ON b."GN_budget_network_item_FK" = bni."GN_b_id"
         JOIN "GN_contractor" cnt ON b."GN_contracor_FK" = cnt."GN_c_id"
         JOIN "GN_dogovor" dgv ON b."GN_dogovor_FK" = dgv."GN_dgv_id"
         JOIN "GN_department" dep ON b."GN_department_FK" = dep."GN_Dep_id"
         WHERE b."GN_bdr_ID" = $1
         LIMIT 1`,
        [row.rowId]
      );

      if (namesResult.rowCount === 0) {
        throw new Error(`Row ${row.rowId} not found`);
      }

      const names = namesResult.rows[0];

      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        await client.query(
          `INSERT INTO "GN_bdr_monthly_forecast" (
             "GN_bdr_ID_FK",
             "budget_item",
             "contractor",
             "dogovor",
             "department",
             "month_index",
             "month_value",
             "month_fact_value"
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT ("GN_bdr_ID_FK", "month_index") WHERE "GN_bdr_ID_FK" IS NOT NULL
           DO UPDATE SET
             "budget_item" = EXCLUDED."budget_item",
             "contractor" = EXCLUDED."contractor",
             "dogovor" = EXCLUDED."dogovor",
             "department" = EXCLUDED."department",
             "month_value" = EXCLUDED."month_value",
             "month_fact_value" = EXCLUDED."month_fact_value",
             "updated_at" = NOW()`,
          [
            row.rowId,
            names.budget_item,
            names.contractor,
            names.dogovor,
            names.department,
            monthIndex,
            row.monthlyValues[monthIndex],
            row.monthlyFactValues[monthIndex],
          ]
        );
      }

      const rowLimit = row.monthlyValues.reduce((sum, value) => sum + value, 0);
      await client.query(
        `UPDATE "GN_bdr"
         SET "GN_bdr_limit" = $1
         WHERE "GN_bdr_ID" = $2`,
        [rowLimit, row.rowId]
      );
    }

    const deleteResult = await client.query(`
      DELETE FROM "GN_bdr_monthly_forecast" forecast
      WHERE forecast."GN_bdr_ID_FK" IS NOT NULL
        AND NOT EXISTS (
        SELECT 1
        FROM "GN_bdr" b
        WHERE b."GN_bdr_ID" = forecast."GN_bdr_ID_FK"
      )
    `);
    const deletedStaleRows = deleteResult.rowCount ?? 0;

    await client.query('COMMIT');
    res.json({
      savedRows: validatedRows.length,
      deletedStaleRows,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to save monthly forecast', err);
    res.status(500).json({ error: 'Failed to save monthly forecast' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/departments', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query('SELECT * FROM "GN_department" ORDER BY "GN_Dep_id" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_department' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/budget-items', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query('SELECT * FROM "GN_budget_network_item" ORDER BY "GN_b_id" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_budget_network_item' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/pao-budget-items', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query('SELECT * FROM "PAO__budget_network_item" ORDER BY "PAO_b_id" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch PAO__budget_network_item' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/contractors', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query('SELECT * FROM "GN_contractor" ORDER BY "GN_c_id" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_contractor' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/dogovors', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query('SELECT * FROM "GN_dogovor" ORDER BY "GN_dgv_id" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_dogovor' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/objects', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query('SELECT * FROM "GN_departament_object" ORDER BY "GN_do_id" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_departament_object' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/contracts', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query('SELECT * FROM "GN_contracts" ORDER BY "GN_contract_id" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_contracts' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/invest-okdp-tko-is-prit', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query('SELECT * FROM "GN_invest_okdp_tko_is_prit" ORDER BY "GN_invest_okdp_tko_is_prit_id" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_invest_okdp_tko_is_prit' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/invest-ogruz-rekvizit', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query('SELECT * FROM "GN_invest_ogruz_rekvizit" ORDER BY "GN_invest_ogruz_rekvizit_id" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_invest_ogruz_rekvizit' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/bdr/:id', async (req: Request, res: Response): Promise<void> => {
  const rowId = Number(req.params.id);
  if (Number.isNaN(rowId)) {
    res.status(400).json({ error: 'Invalid row id' });
    return;
  }

  const client = await createDbClient();
  try {
    const result = await client.query(
      `${BDR_SELECT_FIELDS}
       WHERE b."GN_bdr_ID" = $1`,
      [rowId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Row not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_bdr row' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/bdr/:id/limit-calculation', async (req: Request, res: Response): Promise<void> => {
  const rowId = Number(req.params.id);
  if (Number.isNaN(rowId)) {
    res.status(400).json({ error: 'Invalid row id' });
    return;
  }

  const client = await createDbClient();
  try {
    await ensureLimitCalculationTable(client);

    const baseResult = await client.query<{
      quantity: string | number;
      limit_total: string | number;
      unit_limit: string | number;
      comments: string | null;
    }>(
      `SELECT
         "GN_bdr_kol-vo" AS quantity,
         "GN_bdr_limit" AS limit_total,
         "GN_bdr_edin.limit" AS unit_limit,
         "GN_bdr_comments" AS comments
       FROM "GN_bdr"
       WHERE "GN_bdr_ID" = $1
       LIMIT 1`,
      [rowId]
    );

    if (baseResult.rowCount === 0) {
      res.status(404).json({ error: 'Row not found' });
      return;
    }

    const base = baseResult.rows[0];
    const quantity = Number(base.quantity ?? 0);
    const storedLimit = Number(base.limit_total ?? 0);
    const unitLimit = Number(base.unit_limit ?? 0);

    const lineResult = await client.query<LimitCalculationLineRow>(
      `SELECT
         "line_order" AS line_order,
         "quantity" AS quantity,
         "tariff" AS tariff,
         "line_note" AS line_note
       FROM "GN_bdr_limit_calculation"
       WHERE "GN_bdr_ID_FK" = $1
       ORDER BY "line_order" ASC`,
      [rowId]
    );

    const lines: LimitCalculationResponseLine[] =
      lineResult.rows.length > 0
        ? lineResult.rows.map((line) => ({
            lineOrder: Number(line.line_order),
            quantity: Number(line.quantity ?? 0),
            tariff: Number(line.tariff ?? 0),
            note: String(line.line_note ?? ''),
          }))
        : [buildFallbackCalculationLine(quantity, storedLimit, unitLimit)];

    const totalByLines = lines.reduce((acc, line) => acc + line.quantity * line.tariff, 0);
    const calculatedLimit = totalByLines + unitLimit;

    res.json({
      rowId,
      unitLimit,
      comments: String(base.comments ?? ''),
      lines,
      totalByLines,
      calculatedLimit,
      storedLimit,
      difference: storedLimit - calculatedLimit,
    });
  } catch (err) {
    console.error('Failed to fetch limit calculation', err);
    res.status(500).json({ error: 'Failed to fetch limit calculation' });
  } finally {
    await client.end();
  }
});

app.put('/api/gn/bdr/:id/limit-calculation', async (req: Request, res: Response): Promise<void> => {
  const rowId = Number(req.params.id);
  if (Number.isNaN(rowId)) {
    res.status(400).json({ error: 'Invalid row id' });
    return;
  }

  const payload = req.body as {
    unitLimit?: unknown;
    comments?: unknown;
    lines?: Array<{ quantity?: unknown; tariff?: unknown; note?: unknown }>;
  };

  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    res.status(400).json({ error: 'Lines are required' });
    return;
  }

  let unitLimit: number;
  const lines: LimitCalculationLineInput[] = [];

  try {
    unitLimit = toFiniteNumber(payload.unitLimit ?? 0, 'unitLimit');

    payload.lines.forEach((line, index) => {
      const quantity = toFiniteNumber(line.quantity ?? 0, `line ${index + 1} quantity`);
      const tariff = toFiniteNumber(line.tariff ?? 0, `line ${index + 1} tariff`);
      lines.push({
        quantity,
        tariff,
        note: String(line.note ?? ''),
      });
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid payload' });
    return;
  }

  const client = await createDbClient();
  try {
    await client.query('BEGIN');
    await ensureLimitCalculationTable(client);

    const baseResult = await client.query<{ comments: string | null }>(
      `SELECT "GN_bdr_comments" AS comments
       FROM "GN_bdr"
       WHERE "GN_bdr_ID" = $1
       FOR UPDATE`,
      [rowId]
    );

    if (baseResult.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Row not found' });
      return;
    }

    await client.query(
      `DELETE FROM "GN_bdr_limit_calculation"
       WHERE "GN_bdr_ID_FK" = $1`,
      [rowId]
    );

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      await client.query(
        `INSERT INTO "GN_bdr_limit_calculation" (
           "GN_bdr_ID_FK",
           "line_order",
           "quantity",
           "tariff",
           "line_note"
         ) VALUES ($1, $2, $3, $4, $5)`,
        [rowId, index + 1, line.quantity, line.tariff, line.note]
      );
    }

    const totalByLines = lines.reduce((acc, line) => acc + line.quantity * line.tariff, 0);
    const calculatedLimit = totalByLines + unitLimit;
    const totalQuantity = lines.reduce((acc, line) => acc + line.quantity, 0);
    const comments = payload.comments === undefined
      ? String(baseResult.rows[0].comments ?? '')
      : String(payload.comments ?? '');

    await client.query(
      `UPDATE "GN_bdr"
       SET
         "GN_bdr_kol-vo" = $1,
         "GN_bdr_edin.limit" = $2,
         "GN_bdr_limit" = $3,
         "GN_bdr_comments" = $4
       WHERE "GN_bdr_ID" = $5`,
      [totalQuantity, unitLimit, calculatedLimit, comments, rowId]
    );

    await client.query('COMMIT');

    res.json({
      rowId,
      unitLimit,
      comments,
      lines: lines.map((line, index) => ({
        lineOrder: index + 1,
        quantity: line.quantity,
        tariff: line.tariff,
        note: line.note,
      })),
      totalByLines,
      calculatedLimit,
      storedLimit: calculatedLimit,
      difference: 0,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to save limit calculation', err);
    res.status(500).json({ error: 'Failed to save limit calculation' });
  } finally {
    await client.end();
  }
});

app.put('/api/gn/bdr/:id', async (req: Request, res: Response): Promise<void> => {
  const rowId = Number(req.params.id);
  if (Number.isNaN(rowId)) {
    res.status(400).json({ error: 'Invalid row id' });
    return;
  }

  const client = await createDbClient();

  async function resolveLookupId(
    query: string,
    value: string,
    entityLabel: string
  ): Promise<number> {
    const result = await client.query<{ id: number }>(query, [value]);
    if (result.rowCount === 0) {
      throw new Error(`${entityLabel} not found`);
    }
    return result.rows[0].id;
  }

  const payload = req.body as Record<string, unknown>;
  const updates: Array<{ column: string; value: unknown }> = [];

  try {
    await client.query('BEGIN');

    if (payload['Статья бюджета УС'] !== undefined) {
      const id = await resolveLookupId(
        'SELECT "PAO_b_id" AS id FROM "PAO__budget_network_item" WHERE "PAO__budget_network_item" = $1 LIMIT 1',
        String(payload['Статья бюджета УС']),
        'PAO budget item'
      );
      updates.push({ column: 'PAO_budget_network_item_FK', value: id });
    }

    if (payload['Подразделение'] !== undefined) {
      const id = await resolveLookupId(
        'SELECT "GN_Dep_id" AS id FROM "GN_department" WHERE "GN_department" = $1 LIMIT 1',
        String(payload['Подразделение']),
        'Department'
      );
      updates.push({ column: 'GN_department_FK', value: id });
    }

    if (payload['Объект'] !== undefined) {
      const id = await resolveLookupId(
        'SELECT "GN_do_id" AS id FROM "GN_departament_object" WHERE "GN_departament_object" = $1 LIMIT 1',
        String(payload['Объект']),
        'Object'
      );
      updates.push({ column: 'GN_departament_object_FK', value: id });
    }

    if (payload['Договор'] !== undefined) {
      const id = await resolveLookupId(
        'SELECT "GN_dgv_id" AS id FROM "GN_dogovor" WHERE "GN_dogovor" = $1 LIMIT 1',
        String(payload['Договор']),
        'Dogovor'
      );
      updates.push({ column: 'GN_dogovor_FK', value: id });
    }

    if (payload['Контрагент'] !== undefined) {
      const id = await resolveLookupId(
        'SELECT "GN_c_id" AS id FROM "GN_contractor" WHERE "GN_contarctor" = $1 LIMIT 1',
        String(payload['Контрагент']),
        'Contractor'
      );
      updates.push({ column: 'GN_contracor_FK', value: id });
    }

    if (payload['Статья бюджета'] !== undefined) {
      const id = await resolveLookupId(
        'SELECT "GN_b_id" AS id FROM "GN_budget_network_item" WHERE "GN_budget_network_item" = $1 LIMIT 1',
        String(payload['Статья бюджета']),
        'Budget item'
      );
      updates.push({ column: 'GN_budget_network_item_FK', value: id });
    }

    if (payload['Предмет договора'] !== undefined) {
      updates.push({ column: 'GN_bdr_predmet_dogovora', value: String(payload['Предмет договора']) });
    }

    if (payload['Ед. изм.'] !== undefined) {
      updates.push({ column: 'GN_bdr_ed.izm', value: String(payload['Ед. изм.']) });
    }

    if (payload['Кол-во'] !== undefined) {
      const value = Number(payload['Кол-во']);
      if (Number.isNaN(value)) {
        throw new Error('Invalid Кол-во');
      }
      updates.push({ column: 'GN_bdr_kol-vo', value });
    }

    if (payload['Лимит'] !== undefined) {
      const value = Number(payload['Лимит']);
      if (Number.isNaN(value)) {
        throw new Error('Invalid Лимит');
      }
      updates.push({ column: 'GN_bdr_limit', value });
    }

    if (payload['Един. лимит'] !== undefined) {
      const value = Number(payload['Един. лимит']);
      if (Number.isNaN(value)) {
        throw new Error('Invalid Един. лимит');
      }
      updates.push({ column: 'GN_bdr_edin.limit', value });
    }

    if (payload['Примечания'] !== undefined) {
      updates.push({ column: 'GN_bdr_comments', value: String(payload['Примечания']) });
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No editable fields provided' });
      return;
    }

    const setClause = updates
      .map((entry, index) => `"${entry.column}" = $${index + 1}`)
      .join(', ');
    const values = updates.map((entry) => entry.value);

    const updateResult = await client.query(
      `UPDATE "GN_bdr"
       SET ${setClause}
       WHERE "GN_bdr_ID" = $${updates.length + 1}
       RETURNING "GN_bdr_ID"`,
      [...values, rowId]
    );

    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Row not found' });
      return;
    }

    const result = await client.query(
      `${BDR_SELECT_FIELDS}
       WHERE b."GN_bdr_ID" = $1`,
      [rowId]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to update GN_bdr row', err);

    if (err instanceof Error && (err.message.includes('not found') || err.message.includes('Invalid'))) {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: 'Failed to update GN_bdr row' });
  } finally {
    await client.end();
  }
});

app.put('/api/gn/:entity/:id', async (req: Request, res: Response): Promise<void> => {
  const { entity, id } = req.params;
  const config = GN_TABLE_CONFIGS[entity];

  if (!config) {
    res.status(404).json({ error: 'Unknown GN entity' });
    return;
  }

  const rowId = Number(id);
  if (Number.isNaN(rowId)) {
    res.status(400).json({ error: 'Invalid row id' });
    return;
  }

  const updates = config.editableColumns.filter((column) => req.body[column] !== undefined);
  if (updates.length === 0) {
    res.status(400).json({ error: 'No editable fields provided' });
    return;
  }

  const setClause = updates
    .map((column, index) => `"${column}" = $${index + 1}`)
    .join(', ');
  const values = updates.map((column) => {
    if (column.endsWith('_FK')) {
      const numericValue = Number(req.body[column]);
      if (Number.isNaN(numericValue)) {
        throw new Error(`Invalid value for ${column}`);
      }
      return numericValue;
    }
    return req.body[column];
  });

  const client = await createDbClient();
  try {
    const result = await client.query(
      `UPDATE "${config.tableName}"
       SET ${setClause}
       WHERE "${config.idColumn}" = $${updates.length + 1}
       RETURNING *`,
      [...values, rowId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Row not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Failed to update GN entity row', err);

    if (err instanceof Error && err.message.includes('Invalid value')) {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: 'Failed to update GN entity row' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/bdr', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query(`${BDR_SELECT_FIELDS}
      ORDER BY b."GN_bdr_ID" ASC`);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_bdr' });
  } finally {
    await client.end();
  }
});

app.post('/api/gn/bdr', async (req: Request, res: Response): Promise<void> => {
  const {
    pao_budget_item,
    department,
    object_name,
    dogovor,
    contractor,
    budget_item,
    predmet_dogovora,
    ed_izm,
    kol_vo,
    limit,
    edin_limit,
    comments,
  } = req.body;

  if (
    !pao_budget_item ||
    !department ||
    !object_name ||
    !dogovor ||
    !contractor ||
    !budget_item ||
    !predmet_dogovora ||
    !ed_izm ||
    kol_vo == null ||
    limit == null ||
    edin_limit == null
  ) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  const kolVoNumber = Number(kol_vo);
  const limitNumber = Number(limit);
  const edinLimitNumber = Number(edin_limit);

  if (
    Number.isNaN(kolVoNumber) ||
    Number.isNaN(limitNumber) ||
    Number.isNaN(edinLimitNumber)
  ) {
    res.status(400).json({ error: 'Numeric fields are invalid' });
    return;
  }

  const client = await createDbClient();

  async function getIdByName(
    query: string,
    value: string,
    entityLabel: string
  ): Promise<number> {
    const result = await client.query<{ id: number }>(query, [value]);
    if (result.rowCount === 0) {
      throw new Error(`${entityLabel} not found`);
    }
    return result.rows[0].id;
  }

  try {
    await client.query('BEGIN');

    const paoId = await getIdByName(
      'SELECT "PAO_b_id" AS id FROM "PAO__budget_network_item" WHERE "PAO__budget_network_item" = $1 LIMIT 1',
      pao_budget_item,
      'PAO budget item'
    );

    const departmentId = await getIdByName(
      'SELECT "GN_Dep_id" AS id FROM "GN_department" WHERE "GN_department" = $1 LIMIT 1',
      department,
      'Department'
    );

    const objectId = await getIdByName(
      'SELECT "GN_do_id" AS id FROM "GN_departament_object" WHERE "GN_departament_object" = $1 LIMIT 1',
      object_name,
      'Object'
    );

    const dogovorId = await getIdByName(
      'SELECT "GN_dgv_id" AS id FROM "GN_dogovor" WHERE "GN_dogovor" = $1 LIMIT 1',
      dogovor,
      'Dogovor'
    );

    const contractorId = await getIdByName(
      'SELECT "GN_c_id" AS id FROM "GN_contractor" WHERE "GN_contarctor" = $1 LIMIT 1',
      contractor,
      'Contractor'
    );

    const budgetItemId = await getIdByName(
      'SELECT "GN_b_id" AS id FROM "GN_budget_network_item" WHERE "GN_budget_network_item" = $1 LIMIT 1',
      budget_item,
      'Budget item'
    );

    const insertResult = await client.query<{ id: number }>(
      `INSERT INTO "GN_bdr" (
         "PAO_budget_network_item_FK",
         "GN_department_FK",
         "GN_departament_object_FK",
         "GN_dogovor_FK",
         "GN_contracor_FK",
         "GN_budget_network_item_FK",
         "GN_bdr_predmet_dogovora",
         "GN_bdr_ed.izm",
         "GN_bdr_kol-vo",
         "GN_bdr_limit",
         "GN_bdr_edin.limit",
         "GN_bdr_comments"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING "GN_bdr_ID" AS id`,
      [
        paoId,
        departmentId,
        objectId,
        dogovorId,
        contractorId,
        budgetItemId,
        predmet_dogovora,
        ed_izm,
        kolVoNumber,
        limitNumber,
        edinLimitNumber,
        comments ?? '',
      ]
    );

    const newBdrId = insertResult.rows[0].id;

    const createdRow = await client.query(
      `${BDR_SELECT_FIELDS}
       WHERE b."GN_bdr_ID" = $1`,
      [newBdrId]
    );

    await client.query('COMMIT');
    res.status(201).json(createdRow.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to create GN_bdr row', err);

    if (err instanceof Error && err.message.includes('not found')) {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: 'Failed to create GN_bdr row' });
  } finally {
    await client.end();
  }
});

app.get('/api/health', (req: Request, res: Response): void => {
  res.json({ status: 'ok' });
});

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
