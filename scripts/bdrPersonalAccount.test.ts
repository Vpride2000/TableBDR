import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import express from 'express';
import {
  createDbClient,
  ensureBdrExpenseDepartmentColumn,
  ensureBdrObjectsTable,
  ensureBdrOptionalCreationColumns,
  ensureBdrPersonalAccountColumn,
} from '../server/db.js';
import { setupRoutes } from '../server/routes.js';

test('BDR amount migration allows values to be stored in a selected BDR column', async () => {
  const client = await createDbClient();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE "GN_bdr" (
        "GN_bdr_kol-vo" NUMERIC NOT NULL,
        "GN_bdr_edin.limit" NUMERIC NOT NULL,
        "GN_bdr_limit" NUMERIC NOT NULL
      );
      SET LOCAL search_path TO pg_temp
    `);
    await ensureBdrOptionalCreationColumns(client);
    const result = await client.query<{ column_name: string; is_nullable: string }>(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'GN_bdr'
      ORDER BY column_name
    `);
    assert.deepEqual(result.rows, [
      { column_name: 'GN_bdr_edin.limit', is_nullable: 'YES' },
      { column_name: 'GN_bdr_kol-vo', is_nullable: 'YES' },
      { column_name: 'GN_bdr_limit', is_nullable: 'YES' },
    ]);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});

test('BDR account migration assigns only a single distinct account and runs once', async () => {
  const client = await createDbClient();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE "GN_dogovor" ("GN_dgv_id" INTEGER PRIMARY KEY, "GN_dogovor_personal_account" TEXT);
      CREATE TEMP TABLE "GN_department" ("GN_Dep_id" INTEGER PRIMARY KEY);
      CREATE TEMP TABLE "GN_bdr" ("GN_bdr_ID" INTEGER PRIMARY KEY, "GN_dogovor_FK" INTEGER);
      SET LOCAL search_path TO pg_temp;
      INSERT INTO "GN_dogovor" VALUES
        (1, E'  only  \\r\\n\\n only '), (2, E'first\\nsecond'), (3, ''), (4, E'\\n  \\n');
      INSERT INTO "GN_bdr" VALUES (1, 1), (2, 2), (3, 3), (4, 4)
    `);
    await ensureBdrPersonalAccountColumn(client);
    await ensureBdrExpenseDepartmentColumn(client);
    const expenseDepartmentColumn = await client.query(`
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = '"GN_bdr"'::regclass
        AND attname = 'GN_bdr_expense_department_FK'
        AND NOT attisdropped
    `);
    assert.equal(expenseDepartmentColumn.rowCount, 1);
    const result = await client.query('SELECT "GN_bdr_personal_account" AS account FROM "GN_bdr" ORDER BY "GN_bdr_ID"');
    assert.deepEqual(result.rows.map((row) => row.account), ['only', '', '', '']);
    await client.query(`UPDATE "GN_bdr" SET "GN_bdr_personal_account" = '' WHERE "GN_bdr_ID" = 1`);
    await ensureBdrPersonalAccountColumn(client);
    const preserved = await client.query('SELECT "GN_bdr_personal_account" AS account FROM "GN_bdr" WHERE "GN_bdr_ID" = 1');
    assert.equal(preserved.rows[0].account, '');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});

test('BDR objects migration preserves existing single-object links', async () => {
  const client = await createDbClient();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE "GN_departament_object" ("GN_do_id" INTEGER PRIMARY KEY);
      CREATE TEMP TABLE "GN_bdr" ("GN_bdr_ID" INTEGER PRIMARY KEY, "GN_departament_object_FK" INTEGER);
      SET LOCAL search_path TO pg_temp;
      INSERT INTO "GN_departament_object" VALUES (1), (2);
      INSERT INTO "GN_bdr" VALUES (1, 2), (2, 1)
    `);
    await ensureBdrObjectsTable(client);
    await ensureBdrObjectsTable(client);
    const result = await client.query(
      'SELECT "GN_bdr_ID", "GN_do_id", "sort_order" FROM "GN_bdr_objects" ORDER BY "GN_bdr_ID"'
    );
    assert.deepEqual(result.rows, [
      { GN_bdr_ID: 1, GN_do_id: 2, sort_order: 0 },
      { GN_bdr_ID: 2, GN_do_id: 1, sort_order: 0 },
    ]);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});

test('BDR account API saves per row, validates the contract and clears on contract change', async () => {
  const client = await createDbClient();
  const schema = `bdr_account_test_${randomUUID().replace(/-/g, '')}`;
  const previousOptions = process.env.PGOPTIONS;
  let server: ReturnType<express.Express['listen']> | undefined;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE "GN_dogovor" ("GN_dgv_id" INTEGER PRIMARY KEY, "GN_dogovor" TEXT, "GN_dogovor_personal_account" TEXT);
      CREATE TABLE "GN_department" ("GN_Dep_id" INTEGER PRIMARY KEY, "GN_department" TEXT);
      CREATE TABLE "GN_departament_object" (
        "GN_do_id" INTEGER PRIMARY KEY, "GN_departament_object" TEXT,
        "GN_department_FK" INTEGER, "GN_department_FKs" INTEGER[]
      );
      CREATE TABLE "GN_contractor" ("GN_c_id" INTEGER PRIMARY KEY, "GN_contarctor" TEXT);
      CREATE TABLE "GN_budget_network_item" ("GN_b_id" INTEGER PRIMARY KEY, "GN_budget_network_item" TEXT);
      CREATE TABLE "PAO__budget_network_item" ("PAO_b_id" INTEGER PRIMARY KEY, "PAO__budget_network_item" TEXT);
      CREATE TABLE "GN_bdr" (
        "GN_bdr_ID" SERIAL PRIMARY KEY, "GN_dogovor_FK" INTEGER, "GN_bdr_personal_account" TEXT NOT NULL DEFAULT '',
        "GN_bdr_expense_department_FK" INTEGER,
        "PAO_budget_network_item_FK" INTEGER, "GN_department_FK" INTEGER, "GN_departament_object_FK" INTEGER,
        "GN_contracor_FK" INTEGER, "GN_budget_network_item_FK" INTEGER, "is_deleted" BOOLEAN DEFAULT FALSE,
        "GN_bdr_calculation" TEXT, "GN_bdr_predmet_dogovora" TEXT, "GN_bdr_ed.izm" TEXT, "GN_bdr_kol-vo" NUMERIC,
        "GN_bdr_limit" NUMERIC, "GN_bdr_bdr25_corr" NUMERIC, "GN_bdr_bdr25_corr_kol_vo" NUMERIC,
        "GN_bdr_bdr26" NUMERIC, "GN_bdr_bdr26_kol_vo" NUMERIC, "GN_bdr_bdr26_corr" NUMERIC,
        "GN_bdr_bdr26_corr_kol_vo" NUMERIC, "GN_bdr_bdr27_kol_vo" NUMERIC, "GN_bdr_bdr27" NUMERIC,
        "GN_bdr_edin.limit" NUMERIC, "GN_bdr_comments" TEXT
      );
      CREATE TABLE "GN_bdr_objects" (
        "GN_bdr_ID" INTEGER NOT NULL, "GN_do_id" INTEGER NOT NULL, "sort_order" INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY ("GN_bdr_ID", "GN_do_id")
      );
      INSERT INTO "GN_dogovor" VALUES (1, 'A', E'first\\nsecond'), (2, 'B', 'other'), (3, 'A', 'third');
      INSERT INTO "GN_department" VALUES (1, 'department');
      INSERT INTO "GN_departament_object" VALUES (1, 'object', 1, ARRAY[1]), (2, 'second object', 1, ARRAY[1]);
      INSERT INTO "GN_contractor" VALUES (1, 'contractor');
      INSERT INTO "GN_budget_network_item" VALUES (1, 'item');
      INSERT INTO "PAO__budget_network_item" VALUES (1, 'item');
      INSERT INTO "GN_bdr" ("GN_bdr_ID", "GN_dogovor_FK", "PAO_budget_network_item_FK", "GN_department_FK", "GN_departament_object_FK", "GN_contracor_FK", "GN_budget_network_item_FK")
      VALUES (1, 1, 1, 1, 1, 1, 1), (2, 1, 1, 1, 1, 1, 1), (3, 3, 1, 1, 1, 1, 1)
    `);
    await client.query(`SELECT setval(pg_get_serial_sequence('"GN_bdr"', 'GN_bdr_ID'), 3, true)`);
    process.env.PGOPTIONS = `-c search_path=${schema}`;
    const app = express();
    app.use(express.json());
    setupRoutes(app);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not start');
    const url = `http://127.0.0.1:${address.port}/api/gn/bdr`;
    const request = (path: string, method: string, body: object) => fetch(`${url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });

    let response = await request('/1/personal-account', 'PUT', { contractId: 1, personalAccount: 'second' });
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as Record<string, unknown>)['Лицевой счет'], 'second');
    response = await fetch(`${url}?dogovorId=1`);
    const rows = await response.json() as Array<Record<string, unknown>>;
    assert.deepEqual(rows.map((row) => [row.GN_bdr_ID, row['Лицевой счет']]), [[1, 'second'], [2, '']]);
    response = await request('/1/personal-account', 'PUT', { contractId: 1, personalAccount: 'other' });
    assert.equal(response.status, 400);
    response = await request('/1/personal-account', 'PUT', { contractId: 3, personalAccount: 'third' });
    assert.equal(response.status, 409);
    response = await request('/999/personal-account', 'PUT', { contractId: 1, personalAccount: '' });
    assert.equal(response.status, 404);
    response = await request('/1', 'PUT', { 'Договор': 'A' });
    assert.equal(((await response.json()) as Record<string, unknown>)['Лицевой счет'], 'second');
    response = await request('/1', 'PUT', { 'Договор': 'B' });
    assert.equal(((await response.json()) as Record<string, unknown>)['Лицевой счет'], '');
    response = await request('/1/personal-account', 'PUT', { contractId: 2, personalAccount: 'other' });
    assert.equal(response.status, 200);
    response = await request('/1/personal-account', 'PUT', { contractId: 2, personalAccount: '' });
    assert.equal(((await response.json()) as Record<string, unknown>)['Лицевой счет'], '');
    response = await request('/1/expense-department', 'PUT', { contractId: 2, departmentId: 1 });
    assert.equal(response.status, 200);
    let updatedRow = await response.json() as Record<string, unknown>;
    assert.equal(updatedRow['На кого расходы'], 'department');
    assert.equal(updatedRow['На кого расходы ID'], 1);
    response = await request('/1/expense-department', 'PUT', { contractId: 2, departmentId: 999 });
    assert.equal(response.status, 400);
    response = await request('/1/expense-department', 'PUT', { contractId: 2, departmentId: null });
    updatedRow = await response.json() as Record<string, unknown>;
    assert.equal(updatedRow['На кого расходы'], null);
    assert.equal(updatedRow['На кого расходы ID'], null);

    response = await request('/1', 'PUT', { 'Объекты': ['object', 'second object'] });
    assert.equal(response.status, 200);
    updatedRow = await response.json() as Record<string, unknown>;
    assert.deepEqual(updatedRow['Объекты'], ['object', 'second object']);
    const savedObjects = await client.query(
      'SELECT "GN_do_id", "sort_order" FROM "GN_bdr_objects" WHERE "GN_bdr_ID" = 1 ORDER BY "sort_order"'
    );
    assert.deepEqual(savedObjects.rows, [{ GN_do_id: 1, sort_order: 0 }, { GN_do_id: 2, sort_order: 1 }]);

    response = await request('', 'POST', {
      pao_budget_item: 'item',
      department: 'department',
      object_names: ['second object', 'object'],
      dogovor: 'A',
      contractor: 'contractor',
      budget_item: 'item',
      predmet_dogovora: 'service',
      ed_izm: 'мес.',
      kol_vo: 1,
      limit: 10,
      edin_limit: 10,
    });
    assert.equal(response.status, 201);
    const createdRow = await response.json() as Record<string, unknown>;
    assert.deepEqual(createdRow['Объекты'], ['second object', 'object']);

    response = await request('', 'POST', {
      pao_budget_item: 'item',
      department: 'department',
      object_names: ['object'],
      dogovor: 'A',
      contractor: 'contractor',
      budget_item: 'item',
    });
    assert.equal(response.status, 400);

    response = await request('', 'POST', {
      pao_budget_item: 'item',
      department: 'department',
      object_names: ['object'],
      dogovor: 'A',
      contractor: 'contractor',
      budget_item: 'item',
      limit: 10,
    });
    assert.equal(response.status, 201);
    const createdRowWithOptionalFields = await response.json() as Record<string, unknown>;
    assert.equal(createdRowWithOptionalFields['Предмет договора'], '');
    assert.equal(createdRowWithOptionalFields['Ед. изм.'], '');
    assert.equal(createdRowWithOptionalFields['Кол-во'], null);
    assert.equal(createdRowWithOptionalFields['Един. лимит'], null);
    assert.equal(createdRowWithOptionalFields['Примечания'], '');

    response = await request('', 'POST', {
      pao_budget_item: 'item',
      department: 'department',
      object_names: ['object'],
      dogovor: 'A',
      contractor: 'contractor',
      budget_item: 'item',
      limit: 25,
      limit_bdr_column: 'БДР26',
    });
    assert.equal(response.status, 201);
    const createdRowWithSelectedBdrColumn = await response.json() as Record<string, unknown>;
    assert.equal(createdRowWithSelectedBdrColumn['Лимит'], null);
    assert.equal(createdRowWithSelectedBdrColumn['БДР26'], '25');
    assert.equal(createdRowWithSelectedBdrColumn['БДР25корр'], null);
    assert.equal(createdRowWithSelectedBdrColumn['БДР26корр'], null);
    assert.equal(createdRowWithSelectedBdrColumn['БДР27'], null);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    if (previousOptions === undefined) delete process.env.PGOPTIONS;
    else process.env.PGOPTIONS = previousOptions;
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});
