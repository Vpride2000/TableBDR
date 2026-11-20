import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import express from 'express';
import { createDbClient, ensureBdrPersonalAccountColumn } from '../server/db.js';
import { setupRoutes } from '../server/routes.js';

test('BDR account migration assigns only a single distinct account and runs once', async () => {
  const client = await createDbClient();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE "GN_dogovor" ("GN_dgv_id" INTEGER PRIMARY KEY, "GN_dogovor_personal_account" TEXT);
      CREATE TEMP TABLE "GN_bdr" ("GN_bdr_ID" INTEGER PRIMARY KEY, "GN_dogovor_FK" INTEGER);
      SET LOCAL search_path TO pg_temp;
      INSERT INTO "GN_dogovor" VALUES
        (1, E'  only  \\r\\n\\n only '), (2, E'first\\nsecond'), (3, ''), (4, E'\\n  \\n');
      INSERT INTO "GN_bdr" VALUES (1, 1), (2, 2), (3, 3), (4, 4)
    `);
    await ensureBdrPersonalAccountColumn(client);
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
      CREATE TABLE "GN_departament_object" ("GN_do_id" INTEGER PRIMARY KEY, "GN_departament_object" TEXT);
      CREATE TABLE "GN_contractor" ("GN_c_id" INTEGER PRIMARY KEY, "GN_contarctor" TEXT);
      CREATE TABLE "GN_budget_network_item" ("GN_b_id" INTEGER PRIMARY KEY, "GN_budget_network_item" TEXT);
      CREATE TABLE "PAO__budget_network_item" ("PAO_b_id" INTEGER PRIMARY KEY, "PAO__budget_network_item" TEXT);
      CREATE TABLE "GN_bdr" (
        "GN_bdr_ID" INTEGER PRIMARY KEY, "GN_dogovor_FK" INTEGER, "GN_bdr_personal_account" TEXT NOT NULL DEFAULT '',
        "PAO_budget_network_item_FK" INTEGER, "GN_department_FK" INTEGER, "GN_departament_object_FK" INTEGER,
        "GN_contracor_FK" INTEGER, "GN_budget_network_item_FK" INTEGER, "is_deleted" BOOLEAN DEFAULT FALSE,
        "GN_bdr_calculation" TEXT, "GN_bdr_predmet_dogovora" TEXT, "GN_bdr_ed.izm" TEXT, "GN_bdr_kol-vo" NUMERIC,
        "GN_bdr_limit" NUMERIC, "GN_bdr_bdr25_corr" NUMERIC, "GN_bdr_bdr25_corr_kol_vo" NUMERIC,
        "GN_bdr_bdr26" NUMERIC, "GN_bdr_bdr26_kol_vo" NUMERIC, "GN_bdr_bdr26_corr" NUMERIC,
        "GN_bdr_bdr26_corr_kol_vo" NUMERIC, "GN_bdr_bdr27_kol_vo" NUMERIC, "GN_bdr_bdr27" NUMERIC,
        "GN_bdr_edin.limit" NUMERIC, "GN_bdr_comments" TEXT
      );
      INSERT INTO "GN_dogovor" VALUES (1, 'A', E'first\\nsecond'), (2, 'B', 'other'), (3, 'A', 'third');
      INSERT INTO "GN_department" VALUES (1, 'department');
      INSERT INTO "GN_departament_object" VALUES (1, 'object');
      INSERT INTO "GN_contractor" VALUES (1, 'contractor');
      INSERT INTO "GN_budget_network_item" VALUES (1, 'item');
      INSERT INTO "PAO__budget_network_item" VALUES (1, 'item');
      INSERT INTO "GN_bdr" ("GN_bdr_ID", "GN_dogovor_FK", "PAO_budget_network_item_FK", "GN_department_FK", "GN_departament_object_FK", "GN_contracor_FK", "GN_budget_network_item_FK")
      VALUES (1, 1, 1, 1, 1, 1, 1), (2, 1, 1, 1, 1, 1, 1), (3, 3, 1, 1, 1, 1, 1)
    `);
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
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    if (previousOptions === undefined) delete process.env.PGOPTIONS;
    else process.env.PGOPTIONS = previousOptions;
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});
