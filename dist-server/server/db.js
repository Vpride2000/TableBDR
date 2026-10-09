import { Client, types } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
// Возвращает DATE как строку 'YYYY-MM-DD', чтобы избежать сдвига даты при конвертации часовых поясов
types.setTypeParser(1082, (val) => val);
// Создает подключение к базе PostgreSQL по переменным окружения.
export async function createDbClient() {
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
export async function ensureDatabaseTables(client) {
    const requiredTables = [
        'GN_invest_okdp_tko_is_prit',
        'GN_invest_ogruz_rekvizit',
        'GN_contracts',
        'GN_invest_program',
        'GN_contract_additional_agreements',
        'GN_bdr_limit_calculation',
        'GN_bdr_monthly_forecast',
        'GN_satellite_gt_numbers',
        'GN_satellites',
    ];
    const result = await client.query(`SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])`, [requiredTables]);
    const existingTables = new Set(result.rows.map((row) => row.table_name));
    const missingTables = requiredTables.filter((tableName) => !existingTables.has(tableName));
    if (missingTables.length > 0) {
        throw new Error(`Required database tables are missing: ${missingTables.join(', ')}`);
    }
}
export async function ensureContractColumns(client) {
    const dateColumns = [
        'GN_contract_date',
        'GN_contract_term_from',
        'GN_contract_term_to',
    ];
    const textColumns = [
        'GN_contract_side',
        'GN_contract_asez_number',
    ];
    const allRequired = [...dateColumns, ...textColumns];
    const result = await client.query(`SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'GN_contracts'
        AND column_name = ANY($1::text[])`, [allRequired]);
    const existingColumns = new Set(result.rows.map((row) => row.column_name));
    for (const columnName of dateColumns) {
        if (!existingColumns.has(columnName)) {
            await client.query(`ALTER TABLE "GN_contracts" ADD COLUMN IF NOT EXISTS "${columnName}" DATE`);
        }
    }
    for (const columnName of textColumns) {
        if (!existingColumns.has(columnName)) {
            await client.query(`ALTER TABLE "GN_contracts" ADD COLUMN IF NOT EXISTS "${columnName}" TEXT DEFAULT ''`);
        }
    }
}
// Приводит входное значение к конечному числу или выбрасывает ошибку для некорректных полей.
export function toFiniteNumber(value, fieldLabel) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid ${fieldLabel}`);
    }
    return parsed;
}
export function buildFallbackCalculationLine(quantity, limit, unitLimit) {
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
export async function ensureSatellitesXmlTable(client) {
    await client.query(`CREATE TABLE IF NOT EXISTS "GN_satellite_xml_monthly" (
       "id" SERIAL PRIMARY KEY,
       "mac_norm" TEXT NOT NULL,
       "month_name" TEXT NOT NULL,
       "branch" TEXT,
       "tariff" TEXT,
       "tariff_note" TEXT,
       "status" TEXT NOT NULL DEFAULT 'склад',
       "amount_without_vat" NUMERIC(18,2) NOT NULL DEFAULT 0,
       "uploaded_by" TEXT NOT NULL,
       "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       UNIQUE ("mac_norm", "month_name")
     )`);
    await client.query(`ALTER TABLE "GN_satellite_xml_monthly"
     ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'склад'`);
    await client.query(`ALTER TABLE "GN_satellite_xml_monthly"
     ADD COLUMN IF NOT EXISTS "tariff_note" TEXT`);
}
export async function ensureSatelliteGtNumbersTable(client) {
    await client.query(`CREATE TABLE IF NOT EXISTS "GN_satellite_gt_numbers" (
       "GN_satellite_gt_numbers_id" SERIAL NOT NULL UNIQUE,
       "GN_satellite_gt_number" TEXT NOT NULL,
       PRIMARY KEY("GN_satellite_gt_numbers_id")
     )`);
}
export async function ensureSatelliteColumns(client) {
    await client.query(`ALTER TABLE "GN_satellites"
     ADD COLUMN IF NOT EXISTS "GN_satellite_description" TEXT`);
    await client.query(`ALTER TABLE "GN_satellites"
     ADD COLUMN IF NOT EXISTS "GN_satellite_gt_numbers_FK" INTEGER REFERENCES "GN_satellite_gt_numbers"("GN_satellite_gt_numbers_id") ON DELETE SET NULL`);
    await client.query(`ALTER TABLE "GN_satellites"
     ADD COLUMN IF NOT EXISTS "GN_satellite_diameter" TEXT`);
    await client.query(`ALTER TABLE "GN_satellites"
     ADD COLUMN IF NOT EXISTS "GN_satellite_power" TEXT`);
    await client.query(`ALTER TABLE "GN_satellites"
     ADD COLUMN IF NOT EXISTS "GN_satellite_model" TEXT`);
    await client.query(`ALTER TABLE "GN_satellites"
     ADD COLUMN IF NOT EXISTS "GN_satellite_modem" TEXT`);
}
function toNullableText(value) {
    const normalized = String(value ?? '').trim();
    return normalized === '' ? null : normalized;
}
function excelSerialToDateString(value) {
    if (value == null || value === '')
        return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        const converted = XLSX.SSF.parse_date_code(value);
        if (!converted)
            return null;
        const month = String(converted.m).padStart(2, '0');
        const day = String(converted.d).padStart(2, '0');
        return `${converted.y}-${month}-${day}`;
    }
    const text = String(value).trim();
    if (!text)
        return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text))
        return text;
    const asNumber = Number(text.replace(',', '.'));
    if (Number.isFinite(asNumber)) {
        const converted = XLSX.SSF.parse_date_code(asNumber);
        if (!converted)
            return null;
        const month = String(converted.m).padStart(2, '0');
        const day = String(converted.d).padStart(2, '0');
        return `${converted.y}-${month}-${day}`;
    }
    return null;
}
function parseCellularRowsFromXlsx(xlsxFilePath) {
    const workbook = XLSX.readFile(xlsxFilePath);
    if (workbook.SheetNames.length === 0) {
        return [];
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rawRows.length === 0) {
        return [];
    }
    const headers = rawRows[0].map((cell) => String(cell ?? '').trim());
    const columnIndexByHeader = new Map();
    headers.forEach((header, index) => {
        columnIndexByHeader.set(header, index);
    });
    const requiredHeaders = ['Идентификатор', 'Тарифный план'];
    if (!requiredHeaders.every((header) => columnIndexByHeader.has(header))) {
        return [];
    }
    const rows = [];
    for (let rowIndex = 1; rowIndex < rawRows.length; rowIndex += 1) {
        const row = rawRows[rowIndex];
        const identifier = String(row[columnIndexByHeader.get('Идентификатор') ?? -1] ?? '').trim();
        const tariffPlan = String(row[columnIndexByHeader.get('Тарифный план') ?? -1] ?? '').trim();
        if (!identifier || !tariffPlan) {
            continue;
        }
        rows.push({
            account: toNullableText(row[columnIndexByHeader.get('Л/С') ?? -1]),
            clientName: toNullableText(row[columnIndexByHeader.get('Клиент') ?? -1]),
            contractNumber: toNullableText(row[columnIndexByHeader.get('Номер договора') ?? -1]),
            identifier,
            icc: toNullableText(row[columnIndexByHeader.get('ICC') ?? -1]),
            status: toNullableText(row[columnIndexByHeader.get('Статус') ?? -1]),
            activationDate: excelSerialToDateString(row[columnIndexByHeader.get('Дата активации') ?? -1]),
            zone: toNullableText(row[columnIndexByHeader.get('Зона') ?? -1]),
            tariffPlan,
            tariffPlanEnabledDate: excelSerialToDateString(row[columnIndexByHeader.get('Тарифный план включен') ?? -1]),
        });
    }
    return rows;
}
function findCellularXlsxPath(projectRoot) {
    const scriptsDir = path.join(projectRoot, 'scripts');
    if (!fs.existsSync(scriptsDir)) {
        return null;
    }
    const candidates = fs.readdirSync(scriptsDir)
        .filter((name) => name.toLowerCase().endsWith('.xlsx'))
        .sort((a, b) => a.localeCompare(b, 'ru'));
    if (candidates.length === 0) {
        return null;
    }
    return path.join(scriptsDir, candidates[0]);
}
export async function ensureCellularTables(client) {
    await client.query(`CREATE TABLE IF NOT EXISTS "GN_cellular_identifier" (
       "GN_cellular_identifier_id" SERIAL PRIMARY KEY,
       "GN_cellular_identifier" TEXT NOT NULL UNIQUE,
       "GN_cellular_identifier_fio" TEXT
     )`);
    await client.query(`CREATE TABLE IF NOT EXISTS "GN_cellular_tariff_plan" (
       "GN_cellular_tariff_plan_id" SERIAL PRIMARY KEY,
       "GN_cellular_tariff_plan" TEXT NOT NULL UNIQUE,
       "GN_cellular_tariff_plan_details" TEXT,
       "GN_cellular_tariff_plan_cost" NUMERIC
     )`);
    await client.query(`ALTER TABLE "GN_cellular_tariff_plan"
     ADD COLUMN IF NOT EXISTS "GN_cellular_tariff_plan_cost" NUMERIC`);
    await client.query(`CREATE TABLE IF NOT EXISTS "GN_cellular_account" (
       "GN_cellular_account_id" SERIAL PRIMARY KEY,
       "GN_cellular_account" TEXT NOT NULL UNIQUE,
       "GN_department_FK" INTEGER NOT NULL REFERENCES "GN_department"("GN_Dep_id") ON DELETE RESTRICT,
       "GN_cellular_account_note" TEXT
     )`);
    await client.query(`CREATE TABLE IF NOT EXISTS "GN_cellular" (
       "GN_cellular_id" SERIAL PRIMARY KEY,
       "GN_cellular_account" TEXT,
       "GN_cellular_client" TEXT,
       "GN_cellular_contract_number" TEXT,
       "GN_cellular_identifier_FK" INTEGER NOT NULL REFERENCES "GN_cellular_identifier"("GN_cellular_identifier_id") ON DELETE RESTRICT,
       "GN_cellular_icc" TEXT,
       "GN_cellular_status" TEXT,
       "GN_cellular_activation_date" DATE,
       "GN_cellular_zone" TEXT,
       "GN_cellular_tariff_plan_FK" INTEGER NOT NULL REFERENCES "GN_cellular_tariff_plan"("GN_cellular_tariff_plan_id") ON DELETE RESTRICT,
       "GN_cellular_tariff_plan_enabled_date" DATE,
       "GN_cellular_updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       UNIQUE ("GN_cellular_account", "GN_cellular_identifier_FK", "GN_cellular_icc")
     )`);
    await client.query(`ALTER TABLE "GN_cellular"
     ADD COLUMN IF NOT EXISTS "GN_cellular_updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
}
export async function bootstrapCellularFromXlsx(client, projectRoot) {
    const countResult = await client.query('SELECT COUNT(*)::text AS count FROM "GN_cellular"');
    const existingCount = Number(countResult.rows[0]?.count ?? 0);
    if (existingCount > 0) {
        return;
    }
    const xlsxPath = findCellularXlsxPath(projectRoot);
    if (!xlsxPath) {
        return;
    }
    const rows = parseCellularRowsFromXlsx(xlsxPath);
    if (rows.length === 0) {
        return;
    }
    await client.query('BEGIN');
    try {
        for (const row of rows) {
            const identifierInsert = await client.query(`INSERT INTO "GN_cellular_identifier" ("GN_cellular_identifier")
         VALUES ($1)
         ON CONFLICT ("GN_cellular_identifier")
         DO UPDATE SET "GN_cellular_identifier" = EXCLUDED."GN_cellular_identifier"
         RETURNING "GN_cellular_identifier_id" AS id`, [row.identifier]);
            const identifierId = identifierInsert.rows[0].id;
            const tariffInsert = await client.query(`INSERT INTO "GN_cellular_tariff_plan" ("GN_cellular_tariff_plan")
         VALUES ($1)
         ON CONFLICT ("GN_cellular_tariff_plan")
         DO UPDATE SET "GN_cellular_tariff_plan" = EXCLUDED."GN_cellular_tariff_plan"
         RETURNING "GN_cellular_tariff_plan_id" AS id`, [row.tariffPlan]);
            const tariffId = tariffInsert.rows[0].id;
            await client.query(`INSERT INTO "GN_cellular" (
           "GN_cellular_account",
           "GN_cellular_client",
           "GN_cellular_contract_number",
           "GN_cellular_identifier_FK",
           "GN_cellular_icc",
           "GN_cellular_status",
           "GN_cellular_activation_date",
           "GN_cellular_zone",
           "GN_cellular_tariff_plan_FK",
           "GN_cellular_tariff_plan_enabled_date"
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT ("GN_cellular_account", "GN_cellular_identifier_FK", "GN_cellular_icc")
         DO UPDATE SET
           "GN_cellular_client" = EXCLUDED."GN_cellular_client",
           "GN_cellular_contract_number" = EXCLUDED."GN_cellular_contract_number",
           "GN_cellular_status" = EXCLUDED."GN_cellular_status",
           "GN_cellular_activation_date" = EXCLUDED."GN_cellular_activation_date",
           "GN_cellular_zone" = EXCLUDED."GN_cellular_zone",
           "GN_cellular_tariff_plan_FK" = EXCLUDED."GN_cellular_tariff_plan_FK",
           "GN_cellular_tariff_plan_enabled_date" = EXCLUDED."GN_cellular_tariff_plan_enabled_date"`, [
                row.account,
                row.clientName,
                row.contractNumber,
                identifierId,
                row.icc,
                row.status,
                row.activationDate,
                row.zone,
                tariffId,
                row.tariffPlanEnabledDate,
            ]);
        }
        await client.query('COMMIT');
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}
export async function ensureImportSubstitutionTable(client) {
    await client.query(`CREATE TABLE IF NOT EXISTS "GN_import_substitution" (
       "GN_import_substitution_id" SERIAL PRIMARY KEY,
       "Подразделение" TEXT NOT NULL,
       "Процент исполнения" NUMERIC(5,2) NOT NULL DEFAULT 0,
       "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`);
    await client.query(`ALTER TABLE "GN_import_substitution"
       ADD COLUMN IF NOT EXISTS "GN_import_substitution_okdp_fk" INTEGER REFERENCES "GN_invest_okdp_tko_is_prit"("GN_invest_okdp_tko_is_prit_id") ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS "Наименование ТКО" TEXT,
       ADD COLUMN IF NOT EXISTS "GN_import_substitution_equipment_type_fk" INTEGER REFERENCES "GN_equipment_type"("GN_equipment_type_id") ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS "GN_import_substitution_vendor_fk" INTEGER REFERENCES "GN_equipment_manufacturer"("GN_equipment_manufacturer_id") ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS "Классификация ТКО" TEXT,
       ADD COLUMN IF NOT EXISTS "ЕРРП" TEXT NOT NULL DEFAULT 'НЕТ',
       ADD COLUMN IF NOT EXISTS "ЕРМТР" TEXT NOT NULL DEFAULT 'НЕТ',
       ADD COLUMN IF NOT EXISTS "Регистрационный номер ТКО" TEXT,
       ADD COLUMN IF NOT EXISTS "Количество" NUMERIC(18,2),
      ADD COLUMN IF NOT EXISTS "Выведен из эксплуатации" NUMERIC(18,0) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "Инвентарный" TEXT,
       ADD COLUMN IF NOT EXISTS "Замещенное импортное ТКО" TEXT,
       ADD COLUMN IF NOT EXISTS "Кол-во выводенного импортного ТКО" NUMERIC(18,2),
       ADD COLUMN IF NOT EXISTS "Статья затрат ТКО" TEXT NOT NULL DEFAULT 'ПЭН',
      ADD COLUMN IF NOT EXISTS "СЧЕТ УЧЕТА" TEXT,
      ADD COLUMN IF NOT EXISTS "Статус закупки" TEXT NOT NULL DEFAULT 'план',
       ADD COLUMN IF NOT EXISTS "Платеж ТР без НДС" NUMERIC(18,2),
       ADD COLUMN IF NOT EXISTS "Год" INTEGER,
       ADD COLUMN IF NOT EXISTS "Примечание" TEXT,
       ADD COLUMN IF NOT EXISTS "ЭКСПЛ" TEXT NOT NULL DEFAULT 'НЕТ',
      ADD COLUMN IF NOT EXISTS "ПЛАН" TEXT NOT NULL DEFAULT 'РЕЗЕРВ',
      ADD COLUMN IF NOT EXISTS "ГРУППА" TEXT NOT NULL DEFAULT 'офис',
       ADD COLUMN IF NOT EXISTS "GN_import_substitution_object_fk" INTEGER REFERENCES "GN_departament_object"("GN_do_id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "GN_import_substitution_object_fks" INTEGER[],
       ADD COLUMN IF NOT EXISTS "GN_import_substitution_supplier_fk" INTEGER REFERENCES "GN_contractor"("GN_c_id") ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS "GN_import_substitution_ogruz_fk" INTEGER REFERENCES "GN_invest_ogruz_rekvizit"("GN_invest_ogruz_rekvizit_id") ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS "оплата" TEXT`);
    await client.query(`UPDATE "GN_import_substitution"
     SET "СЧЕТ УЧЕТА" = 'МЦ400201'
     WHERE "Статья затрат ТКО" = 'ПЭН'
       AND NULLIF(TRIM("СЧЕТ УЧЕТА"), '') IS NULL`);
    await client.query(`UPDATE "GN_import_substitution"
     SET "GN_import_substitution_object_fks" = ARRAY["GN_import_substitution_object_fk"]
     WHERE "GN_import_substitution_object_fks" IS NULL
       AND "GN_import_substitution_object_fk" IS NOT NULL`);
    await client.query(`ALTER TABLE "GN_import_substitution"
       ALTER COLUMN "Выведен из эксплуатации" DROP DEFAULT,
       ALTER COLUMN "Выведен из эксплуатации" TYPE NUMERIC(18,0)
         USING CASE
           WHEN LOWER(TRIM("Выведен из эксплуатации"::TEXT)) = 'да' THEN 1
           WHEN LOWER(TRIM("Выведен из эксплуатации"::TEXT)) = 'нет' THEN 0
           WHEN NULLIF(TRIM("Выведен из эксплуатации"::TEXT), '') IS NULL THEN 0
           ELSE ROUND("Выведен из эксплуатации"::NUMERIC)
         END,
       ALTER COLUMN "Выведен из эксплуатации" SET DEFAULT 0`);
}
export async function ensureOgruzReferenceColumns(client) {
    await client.query(`ALTER TABLE "GN_invest_ogruz_rekvizit"
       ADD COLUMN IF NOT EXISTS "GN_department_FK" INTEGER REFERENCES "GN_department"("GN_Dep_id") ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS "GN_departament_object_FK" INTEGER REFERENCES "GN_departament_object"("GN_do_id") ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS "Почтовый адрес" TEXT`);
}
export async function ensureEquipmentModelReferenceColumns(client) {
    await client.query(`ALTER TABLE "GN_equipment_model"
       ADD COLUMN IF NOT EXISTS "GN_equipment_department_FK" INTEGER REFERENCES "GN_department"("GN_Dep_id") ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS "GN_equipment_budget_item_FK" INTEGER REFERENCES "GN_budget_network_item"("GN_b_id") ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS "GN_equipment_object_FK" INTEGER REFERENCES "GN_departament_object"("GN_do_id") ON DELETE SET NULL`);
}
export async function ensureObjectDepartmentColumns(client) {
    const tableExists = await client.query('SELECT to_regclass($1) IS NOT NULL AS exists', ['public.GN_departament_object']);
    if (!tableExists.rows[0]?.exists)
        return;
    await client.query(`ALTER TABLE "GN_departament_object"
       ADD COLUMN IF NOT EXISTS "GN_department_FKs" INTEGER[]`);
    await client.query(`UPDATE "GN_departament_object"
        SET "GN_department_FKs" = ARRAY["GN_department_FK"]::INTEGER[]
      WHERE "GN_department_FKs" IS NULL
        AND "GN_department_FK" IS NOT NULL`);
}
export async function ensureReferenceTables(client) {
    await client.query(`CREATE TABLE IF NOT EXISTS "GN_department" (
       "GN_Dep_id" SERIAL PRIMARY KEY,
       "GN_department" TEXT NOT NULL
     )`);
    await client.query(`CREATE TABLE IF NOT EXISTS "GN_contractor" (
       "GN_c_id" SERIAL PRIMARY KEY,
       "GN_contarctor" TEXT NOT NULL
     )`);
    await client.query(`CREATE TABLE IF NOT EXISTS "GN_equipment_manufacturer" (
       "GN_equipment_manufacturer_id" SERIAL PRIMARY KEY,
       "GN_equipment_manufacturer" TEXT NOT NULL,
       "Полное название" TEXT,
       "СТРАНА" TEXT,
       "Доп. информация" TEXT
     )`);
    await client.query(`ALTER TABLE "GN_equipment_manufacturer"
       ADD COLUMN IF NOT EXISTS "Полное название" TEXT,
       ADD COLUMN IF NOT EXISTS "СТРАНА" TEXT,
       ADD COLUMN IF NOT EXISTS "Доп. информация" TEXT`);
    await client.query(`CREATE TABLE IF NOT EXISTS "GN_departament_object" (
       "GN_do_id" SERIAL PRIMARY KEY,
       "GN_departament_object" TEXT NOT NULL,
       "GN_department_FK" INTEGER NOT NULL,
       "GN_department_FKs" INTEGER[]
     )`);
}
export async function ensureReferenceSequences(client) {
    const sequences = [
        ['GN_departament_object', 'GN_do_id'],
        ['GN_department', 'GN_Dep_id'],
        ['GN_contractor', 'GN_c_id'],
    ];
    for (const [tableName, idColumn] of sequences) {
        const tableExists = await client.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
        if (!tableExists.rows[0]?.exists)
            continue;
        await client.query(`SELECT setval(
         pg_get_serial_sequence($1, $2),
         COALESCE(MAX("${idColumn}"), 1),
         COUNT(*) > 0
       )
       FROM "${tableName}"`, [tableName, idColumn]);
    }
}
export async function ensureExcelImportDeletionColumns(client) {
    const tables = [
        'GN_bdr',
        'GN_import_substitution',
        'GN_cellular_identifier',
        'GN_invest_okdp_tko_is_prit',
        'GN_invest_ogruz_rekvizit',
        'GN_equipment_manufacturer',
    ];
    for (const tableName of tables) {
        await client.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT FALSE`);
        await client.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ`);
    }
    await client.query(`ALTER TABLE "GN_bdr" ADD COLUMN IF NOT EXISTS "GN_bdr_calculation" TEXT NOT NULL DEFAULT ''`);
}
//# sourceMappingURL=db.js.map