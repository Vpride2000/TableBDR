import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import express from 'express';
import { createDbClient, ensurePrimaryDocumentsTables } from '../server/db.js';
import { setupRoutes } from '../server/routes.js';
import { buildBdr26CorrIndex, buildBdrExpenseDepartmentIndex, completePrimarySelection, getBdr26Corr, getBdrContractorIds, getBdrExpenseDepartments } from '../src/utils/primaryBdr.js';

test('primary expense departments match contract, department and selected objects', () => {
  const rows = [
    { departmentId: 1, objectId: 10, contractorId: 100, contractId: 1000, expenseDepartment: 'Филиал А', bdr26Corr: 25.25 },
    { departmentId: 1, objectId: 10, contractorId: 100, contractId: 1000, expenseDepartment: 'Филиал А', bdr26Corr: 25.25 },
    { departmentId: 1, objectId: 20, contractorId: 100, contractId: 1000, expenseDepartment: 'Филиал Б', bdr26Corr: 10.5 },
    { departmentId: 2, objectId: 10, contractorId: 100, contractId: 1000, expenseDepartment: 'Другой отдел', bdr26Corr: 100 },
    { departmentId: 1, objectId: 10, contractorId: 100, contractId: 2000, expenseDepartment: 'Другой договор', bdr26Corr: 200 },
    { departmentId: 1, objectId: 30, contractorId: 100, contractId: 1000, expenseDepartment: null, bdr26Corr: null },
  ];
  const index = buildBdrExpenseDepartmentIndex(rows);
  assert.equal(getBdrExpenseDepartments(index, '1', ['10'], '1000'), 'Филиал А');
  assert.equal(getBdrExpenseDepartments(index, '1', ['10', '20', '30'], '1000'), 'Филиал А; Филиал Б');
  assert.equal(getBdrExpenseDepartments(index, '2', ['10'], '1000'), 'Другой отдел');
  assert.equal(getBdrExpenseDepartments(index, '1', ['10'], '2000'), 'Другой договор');
  assert.equal(getBdrExpenseDepartments(index, '1', [], '1000'), '');
  assert.equal(getBdrExpenseDepartments(index, '', ['10'], '1000'), '');
  assert.equal(getBdrExpenseDepartments(index, '1', ['10'], ''), '');
  const amounts = buildBdr26CorrIndex(rows);
  assert.equal(getBdr26Corr(amounts, '1', ['10', '20', '30', '10'], '1000'), 35.75);
  assert.equal(getBdr26Corr(amounts, '2', ['10'], '1000'), 100);
  assert.equal(getBdr26Corr(amounts, '1', ['10'], '2000'), 200);
  assert.equal(getBdr26Corr(amounts, '1', ['30'], '1000'), null);
  assert.equal(getBdr26Corr(amounts, '', ['10'], '1000'), null);
});

test('primary contractors match the department and any selected object in the same BDR row', () => {
  const rows = [
    { departmentId: 1, objectId: 10, contractorId: 100, contractId: 1000 },
    { departmentId: 1, objectId: 20, contractorId: 200, contractId: 2000 },
    { departmentId: 2, objectId: 10, contractorId: 300, contractId: 3000 },
    { departmentId: 1, objectId: 30, contractorId: 300, contractId: 3000 },
    { departmentId: 1, objectId: 10, contractorId: null, contractId: null },
    { departmentId: 1, objectId: 10, contractorId: 100, contractId: 1001 },
  ];
  assert.deepEqual([...getBdrContractorIds(rows, '1', ['10'])], [100]);
  assert.deepEqual([...getBdrContractorIds(rows, '1', ['10', '20'])], [100, 200]);
  assert.deepEqual([...getBdrContractorIds(rows, '2', ['10'])], [300]);
  assert.equal(getBdrContractorIds(rows, '1', []).size, 0);
  assert.equal(getBdrContractorIds(rows, '', ['10']).size, 0);
});

test('primary fields cascade only when there is one available option', () => {
  const selection = { departmentId: '1', objectIds: [], contractorId: '', contractId: '', personalAccount: '' };
  const references = {
    bdr: [{ departmentId: 1, objectId: 10, contractorId: 100, contractId: 1000 }],
    objects: [{ id: 10, departmentIds: [1] }],
    contractors: [{ id: 100 }],
    contracts: [{ id: 1000, contractorId: 100, personalAccount: 'account\naccount' }],
  };
  const complete = completePrimarySelection(selection, references, 'department');
  assert.deepEqual(complete, { departmentId: '1', objectIds: ['10'], contractorId: '100', contractId: '1000', personalAccount: 'account' });
  assert.deepEqual(completePrimarySelection(selection, {
    ...references,
    objects: [...references.objects, { id: 20, departmentIds: [1] }],
    bdr: [...references.bdr, { departmentId: 1, objectId: 20, contractorId: 200, contractId: 2000 }],
  }, 'department'), selection);
  assert.equal(completePrimarySelection({ ...selection, objectIds: ['10'] }, {
    ...references,
    bdr: [...references.bdr, { departmentId: 1, objectId: 10, contractorId: 200, contractId: 2000 }],
    contractors: [...references.contractors, { id: 200 }],
  }, 'objects').contractorId, '');
  assert.equal(completePrimarySelection({ ...selection, objectIds: ['10'], contractorId: '100' }, {
    ...references,
    bdr: [...references.bdr, { departmentId: 1, objectId: 10, contractorId: 100, contractId: 1001 }],
    contracts: [...references.contracts, { id: 1001, contractorId: 100, personalAccount: 'other' }],
  }, 'contractor').contractId, '');
  assert.equal(completePrimarySelection({ ...selection, contractorId: '100', contractId: '1000' }, {
    ...references,
    contracts: [{ id: 1000, contractorId: 100, personalAccount: 'first\nsecond' }],
  }, 'contract').personalAccount, '');
  assert.equal(completePrimarySelection({ ...selection, contractorId: '100', contractId: '1000' }, {
    ...references,
    contracts: [{ id: 1000, contractorId: 100, personalAccount: '' }],
  }, 'contract').personalAccount, 'НЕТ');
  assert.deepEqual(completePrimarySelection({ ...complete, objectIds: [] }, references, 'objects'), selection);
  assert.deepEqual(completePrimarySelection({ ...complete, objectIds: ['10'], contractorId: '999', contractId: '999', personalAccount: 'old' }, references, 'objects'), complete);
  assert.deepEqual(completePrimarySelection({ ...complete, personalAccount: 'old' }, references, 'objects'), { ...complete, personalAccount: 'old' });
});

test('primary migrations preserve legacy month values and run only once', async () => {
  const client = await createDbClient();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE "GN_department" ("GN_Dep_id" INTEGER PRIMARY KEY);
      CREATE TEMP TABLE "GN_dogovor" ("GN_dgv_id" INTEGER PRIMARY KEY, "GN_dogovor_personal_account" TEXT);
      CREATE TEMP TABLE "GN_budget_network_item" ("GN_b_id" INTEGER PRIMARY KEY, "GN_budget_network_item" TEXT);
      CREATE TEMP TABLE "PAO__budget_network_item" ("PAO_b_id" INTEGER PRIMARY KEY, "PAO__budget_network_item" TEXT);
      CREATE TEMP TABLE "GN_primary_documents" (
        "GN_primary_document_id" INTEGER PRIMARY KEY,
        "GN_dogovor_FK" INTEGER,
        "personal_account" TEXT NOT NULL DEFAULT '',
        "document_month" TEXT NOT NULL DEFAULT 'october',
        "amount_with_vat" NUMERIC(15, 2) NOT NULL DEFAULT 0,
        "details" TEXT NOT NULL DEFAULT '',
        "edo_arrival_date" DATE,
        "sed_launch_date" DATE,
        "note" TEXT NOT NULL DEFAULT ''
      );
      CREATE TEMP TABLE "GN_primary_document_objects" ("primary_document_id" INTEGER);
      CREATE TEMP TABLE "GN_primary_document_budget_items" ("primary_document_id" INTEGER, "budget_item_id" INTEGER);
      SET LOCAL search_path TO pg_temp;
      INSERT INTO "GN_primary_documents"
        ("GN_primary_document_id", "document_month", "amount_with_vat", "details", "edo_arrival_date", "sed_launch_date", "note")
      VALUES
        (1, 'october', 125.50, 'Есть детализация', '2026-10-01', '2026-10-02', 'Старая заметка'),
        (2, 'november', 0, '', NULL, NULL, '')
    `);
    await client.query(`
      INSERT INTO "GN_budget_network_item" VALUES (1, 'Статья А');
      INSERT INTO "PAO__budget_network_item" VALUES (10, 'Статья А');
      INSERT INTO "GN_primary_document_budget_items" VALUES (1, 1)
    `);
    await ensurePrimaryDocumentsTables(client);
    const first = await client.query('SELECT "details_enabled", "details", "sed_launched", "edo_arrival_date", "sed_launch_date" FROM "GN_primary_documents" ORDER BY "GN_primary_document_id"');
    assert.deepEqual(first.rows, [
      { details_enabled: true, details: 'Есть детализация', sed_launched: true, edo_arrival_date: '2026-10-01', sed_launch_date: '2026-10-02' },
      { details_enabled: false, details: '', sed_launched: false, edo_arrival_date: null, sed_launch_date: null },
    ]);
    const migratedMonths = await client.query(`
      SELECT "primary_document_id", "document_month", "amount_with_vat", "edo_arrival_date",
             "sed_launch_date", "sed_launched", "accepted_in_1c", "note"
      FROM "GN_primary_document_months"
      ORDER BY "primary_document_id"
    `);
    assert.deepEqual(migratedMonths.rows, [
      { primary_document_id: 1, document_month: 'october', amount_with_vat: '125.50', edo_arrival_date: '2026-10-01', sed_launch_date: '2026-10-02', sed_launched: true, accepted_in_1c: false, note: 'Старая заметка' },
      { primary_document_id: 2, document_month: 'november', amount_with_vat: '0.00', edo_arrival_date: null, sed_launch_date: null, sed_launched: false, accepted_in_1c: false, note: '' },
    ]);
    const migratedBudgetItems = await client.query(`SELECT "primary_document_id", "budget_item_id" FROM "GN_primary_document_pao_budget_items"`);
    assert.deepEqual(migratedBudgetItems.rows, [{ primary_document_id: 1, budget_item_id: 10 }]);
    await client.query('UPDATE "GN_primary_documents" SET "details_enabled" = FALSE, "sed_launched" = FALSE WHERE "GN_primary_document_id" = 1');
    await client.query(`UPDATE "GN_primary_document_months" SET "amount_with_vat" = 222, "note" = 'Новое значение' WHERE "primary_document_id" = 1`);
    await ensurePrimaryDocumentsTables(client);
    const second = await client.query('SELECT "details_enabled", "details", "sed_launched", "sed_launch_date" FROM "GN_primary_documents" WHERE "GN_primary_document_id" = 1');
    assert.deepEqual(second.rows[0], { details_enabled: false, details: 'Есть детализация', sed_launched: false, sed_launch_date: '2026-10-02' });
    const preservedMonth = await client.query(`SELECT "amount_with_vat", "note" FROM "GN_primary_document_months" WHERE "primary_document_id" = 1`);
    assert.deepEqual(preservedMonth.rows[0], { amount_with_vat: '222.00', note: 'Новое значение' });
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});

test('primary options use active BDR rows only', async () => {
  const client = await createDbClient();
  const schema = `primary_bdr_test_${randomUUID().replace(/-/g, '')}`;
  const previousOptions = process.env.PGOPTIONS;
  let server: ReturnType<express.Express['listen']> | undefined;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE "GN_bdr" (
        "GN_department_FK" INTEGER, "GN_departament_object_FK" INTEGER,
        "GN_contracor_FK" INTEGER, "GN_dogovor_FK" INTEGER, "is_deleted" BOOLEAN,
        "GN_bdr_expense_department_FK" INTEGER, "GN_bdr_bdr26_corr" NUMERIC
      );
      CREATE TABLE "GN_department" ("GN_Dep_id" INTEGER PRIMARY KEY, "GN_department" TEXT);
      CREATE TABLE "GN_gazprom_telecom" ("GN_department_FK" INTEGER, "GN_dogovor_FK" INTEGER);
      INSERT INTO "GN_department" VALUES (5, 'Филиал расходов'), (6, 'Другой филиал');
      INSERT INTO "GN_bdr" VALUES
        (1, 10, 100, 1000, FALSE, 5, 12.50), (1, 10, 100, 1000, FALSE, 5, 12.50),
        (1, 10, 100, 1000, FALSE, 6, 5.00),
        (2, 20, 100, 1001, FALSE, NULL, NULL), (3, 30, 300, 3000, TRUE, 5, 99);
      INSERT INTO "GN_gazprom_telecom" VALUES (4, 4000)
    `);
    process.env.PGOPTIONS = `-c search_path=${schema}`;
    const app = express();
    setupRoutes(app);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not start');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/primary/bdr-options`);
    assert.equal(response.status, 200);
    const rows = await response.json() as Array<{ departmentId: number; objectId: number; contractorId: number; contractId: number; expenseDepartment: string | null; bdr26Corr: string | null }>;
    rows.sort((a, b) => a.departmentId - b.departmentId || String(a.expenseDepartment).localeCompare(String(b.expenseDepartment), 'ru'));
    assert.deepEqual(rows, [
      { departmentId: 1, objectId: 10, contractorId: 100, contractId: 1000, expenseDepartment: 'Другой филиал', bdr26Corr: '30.00' },
      { departmentId: 1, objectId: 10, contractorId: 100, contractId: 1000, expenseDepartment: 'Филиал расходов', bdr26Corr: '30.00' },
      { departmentId: 2, objectId: 20, contractorId: 100, contractId: 1001, expenseDepartment: null, bdr26Corr: null },
    ]);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    if (previousOptions === undefined) delete process.env.PGOPTIONS;
    else process.env.PGOPTIONS = previousOptions;
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  }
});
