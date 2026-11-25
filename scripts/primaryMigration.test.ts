import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import express from 'express';
import { createDbClient, ensurePrimaryDocumentsTables } from '../server/db.js';
import { setupRoutes } from '../server/routes.js';
import { buildBdr26CorrIndex, buildBdrBudgetItemIndex, buildBdrExpenseDepartmentIndex, completePrimarySelection, getBdr26Corr, getBdr26Summary, getBdrBudgetItems, getBdrContractorIds, getBdrExpenseDepartments, primaryBdrProgress, sumBdr26Corr } from '../src/utils/primaryBdr.js';

test('budget items are unique and matched only by valid personal account', () => {
  const index = buildBdrBudgetItemIndex([
    { personalAccount: ' 001 ', budgetItem: 'Статья Б' },
    { personalAccount: '001', budgetItem: 'Статья А' },
    { personalAccount: '001', budgetItem: 'Статья А' },
    { personalAccount: '001', budgetItem: null },
    { personalAccount: '002', budgetItem: 'Другая' },
    { personalAccount: 'НЕТ', budgetItem: 'Не показывать' },
    { personalAccount: '', budgetItem: 'Не показывать' },
  ]);
  assert.equal(getBdrBudgetItems(index, ' 001 '), 'Статья А; Статья Б');
  assert.equal(getBdrBudgetItems(index, '002'), 'Другая');
  assert.equal(getBdrBudgetItems(index, 'нет'), '');
  assert.equal(getBdrBudgetItems(index, null), '');
});

test('primary BDR progress sums all monthly amounts and handles unavailable budgets', () => {
  assert.deepEqual(primaryBdrProgress(100, [10, '20.50', null, undefined, '19,5']), { total: 50, percent: 50 });
  assert.deepEqual(primaryBdrProgress(120, [10, 0, 0, 20, 0, 0, 30, 0, 0, 40, 0, 20]), { total: 120, percent: 100 });
  assert.deepEqual(primaryBdrProgress(100, [100]), { total: 100, percent: 100 });
  assert.deepEqual(primaryBdrProgress(100, [120]), { total: 120, percent: 120 });
  assert.deepEqual(primaryBdrProgress(100, [-10]), { total: -10, percent: -10 });
  assert.deepEqual(primaryBdrProgress(null, [10]), { total: 10, percent: null });
  assert.deepEqual(primaryBdrProgress(0, [10]), { total: 10, percent: null });
  assert.deepEqual(primaryBdrProgress(-10, [10]), { total: 10, percent: null });
  assert.deepEqual(primaryBdrProgress(100, ['invalid']), { total: null, percent: null });
});

test('primary expense departments match contract, department and selected objects', () => {
  const rows = [
    { departmentId: 1, objectId: 10, contractorId: 100, contractId: 1000, expenseDepartment: 'Филиал А', bdr26Corr: 25.25 },
    { departmentId: 1, objectId: 10, contractorId: 100, contractId: 1000, expenseDepartment: 'Филиал А', bdr26Corr: 25.25 },
    { departmentId: 1, objectId: 20, contractorId: 100, contractId: 1000, expenseDepartment: 'Филиал Б', bdr26Corr: 10.5 },
    { departmentId: 2, objectId: 10, contractorId: 100, contractId: 1000, expenseDepartment: 'Другой отдел', bdr26Corr: 100 },
    { departmentId: 1, objectId: 10, contractorId: 100, contractId: 2000, expenseDepartment: 'Другой договор', bdr26Corr: 200 },
    { departmentId: 1, objectId: 30, contractorId: 100, contractId: 1000, expenseDepartment: null, bdr26Corr: null },
  ];
  const index = buildBdrExpenseDepartmentIndex(rows.map((row) => ({ ...row, personalAccount: null, bdr26Count: 0 })));
  assert.equal(getBdrExpenseDepartments(index, '1', ['10'], '1000'), 'Филиал А');
  assert.equal(getBdrExpenseDepartments(index, '1', ['10', '20', '30'], '1000'), 'Филиал А; Филиал Б');
  assert.equal(getBdrExpenseDepartments(index, '2', ['10'], '1000'), 'Другой отдел');
  assert.equal(getBdrExpenseDepartments(index, '1', ['10'], '2000'), 'Другой договор');
  assert.equal(getBdrExpenseDepartments(index, '1', [], '1000'), '');
  assert.equal(getBdrExpenseDepartments(index, '', ['10'], '1000'), '');
  assert.equal(getBdrExpenseDepartments(index, '1', ['10'], ''), '');
});

test('primary BDR totals match only nonempty personal accounts without double-counting repeated options', () => {
  const rows = [
    { departmentId: 1, objectId: 10, contractorId: 100, contractId: 1000, expenseDepartment: 'А', personalAccount: '001', bdr26Corr: 35.75, bdr26Count: 3 },
    { departmentId: 2, objectId: 20, contractorId: 200, contractId: 2000, expenseDepartment: 'Б', personalAccount: '001', bdr26Corr: 35.75, bdr26Count: 3 },
    { departmentId: null, objectId: null, contractorId: null, contractId: null, expenseDepartment: null, personalAccount: '002', bdr26Corr: 0, bdr26Count: 1 },
    { departmentId: 1, objectId: 10, contractorId: 100, contractId: 1000, expenseDepartment: null, personalAccount: '', bdr26Corr: 100, bdr26Count: 1 },
    { departmentId: 1, objectId: 10, contractorId: 100, contractId: 1000, expenseDepartment: null, personalAccount: 'НЕТ', bdr26Corr: 200, bdr26Count: 1 },
    { departmentId: 1, objectId: 10, contractorId: 100, contractId: 1000, expenseDepartment: null, personalAccount: '003', bdr26Corr: null, bdr26Count: 0 },
  ];
  const amounts = buildBdr26CorrIndex(rows);
  assert.equal(getBdr26Corr(amounts, ' 001 '), 35.75);
  assert.equal(getBdr26Corr(amounts, '002'), 0);
  assert.equal(getBdr26Corr(amounts, '003'), null);
  assert.equal(getBdr26Corr(amounts, ''), null);
  assert.equal(getBdr26Corr(amounts, 'нет'), null);
  assert.equal(getBdr26Corr(amounts, null), null);
  assert.deepEqual(getBdr26Summary(amounts, '001'), { amount: 35.75, count: 3 });
  assert.deepEqual(getBdr26Summary(amounts, '002'), { amount: 0, count: 1 });
  assert.equal(sumBdr26Corr(amounts, ['001', '001', '002', null, 'НЕТ']), 71.5);
  assert.equal(sumBdr26Corr(amounts, []), 0);
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
    const first = await client.query('SELECT "details_enabled", "details", "general_note", "sed_launched", "edo_arrival_date", "sed_launch_date" FROM "GN_primary_documents" ORDER BY "GN_primary_document_id"');
    assert.deepEqual(first.rows, [
      { details_enabled: true, details: 'Есть детализация', general_note: '', sed_launched: true, edo_arrival_date: '2026-10-01', sed_launch_date: '2026-10-02' },
      { details_enabled: false, details: '', general_note: '', sed_launched: false, edo_arrival_date: null, sed_launch_date: null },
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
    await client.query(`UPDATE "GN_primary_documents" SET "details_enabled" = FALSE, "sed_launched" = FALSE, "general_note" = 'Общее' WHERE "GN_primary_document_id" = 1`);
    await client.query(`UPDATE "GN_primary_document_months" SET "amount_with_vat" = 222, "note" = 'Новое значение' WHERE "primary_document_id" = 1`);
    await ensurePrimaryDocumentsTables(client);
    const second = await client.query('SELECT "details_enabled", "details", "general_note", "sed_launched", "sed_launch_date" FROM "GN_primary_documents" WHERE "GN_primary_document_id" = 1');
    assert.deepEqual(second.rows[0], { details_enabled: false, details: 'Есть детализация', general_note: 'Общее', sed_launched: false, sed_launch_date: '2026-10-02' });
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
        "GN_bdr_ID" INTEGER, "GN_department_FK" INTEGER, "GN_departament_object_FK" INTEGER,
        "GN_contracor_FK" INTEGER, "GN_dogovor_FK" INTEGER, "is_deleted" BOOLEAN,
        "GN_bdr_expense_department_FK" INTEGER, "GN_bdr_bdr26_corr" NUMERIC,
        "GN_bdr_personal_account" TEXT, "GN_budget_network_item_FK" INTEGER,
        "GN_bdr_predmet_dogovora" TEXT, "GN_bdr_calculation" TEXT
      );
      CREATE TABLE "GN_bdr_objects" ("GN_bdr_ID" INTEGER, "GN_do_id" INTEGER, "sort_order" INTEGER);
      CREATE TABLE "GN_department" ("GN_Dep_id" INTEGER PRIMARY KEY, "GN_department" TEXT);
      CREATE TABLE "GN_budget_network_item" ("GN_b_id" INTEGER PRIMARY KEY, "GN_budget_network_item" TEXT);
      CREATE TABLE "GN_gazprom_telecom" ("GN_department_FK" INTEGER, "GN_dogovor_FK" INTEGER);
      INSERT INTO "GN_department" VALUES (5, 'Филиал расходов'), (6, 'Другой филиал');
      INSERT INTO "GN_budget_network_item" VALUES (1, 'Статья А'), (2, 'Статья Б');
      INSERT INTO "GN_bdr" VALUES
        (1, 1, 10, 100, 1000, FALSE, 5, 12.50, '001', 1, 'Предмет A', 'Условие A'),
        (2, 1, 10, 100, 1000, FALSE, 5, 12.50, ' 001 ', 1, 'Предмет A', 'Условие A'),
        (3, 1, 10, 100, 1000, FALSE, 6, 5.00, '001', 1, 'Предмет A', 'Условие A'),
        (4, 2, 20, 100, 1001, FALSE, NULL, 7.00, '001', 2, 'Предмет B', 'Условие B'),
        (5, 1, 10, 100, 1000, FALSE, 5, 50.00, '002', 1, 'Предмет C', 'Условие C'),
        (6, 3, 30, 300, 3000, FALSE, NULL, NULL, '001', NULL, '', ''),
        (7, 2, 20, 100, 1001, FALSE, NULL, NULL, '', NULL, '', ''),
        (8, 3, 30, 300, 3000, TRUE, 5, 99, '001', 2, 'Удаленный', 'Удаленный');
      INSERT INTO "GN_bdr_objects" VALUES (1, 10, 0), (1, 11, 1);
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
    const rows = await response.json() as Array<{ departmentId: number; objectId: number; contractorId: number; contractId: number; expenseDepartment: string | null; personalAccount: string | null; budgetItem: string | null; contractSubject: string | null; calculation: string | null; bdr26Corr: string | null; bdr26Count: number }>;
    assert.equal(rows.length, 7);
    const firstAccount = rows.filter((row) => row.personalAccount === '001');
    assert.equal(firstAccount.length, 5);
    assert.ok(firstAccount.every((row) => row.bdr26Corr === '37.00' && row.bdr26Count === 4));
    assert.ok(firstAccount.some((row) => row.departmentId === 2 && row.contractId === 1001));
    assert.ok(firstAccount.some((row) => row.objectId === 11));
    assert.ok(firstAccount.some((row) => row.contractSubject === 'Предмет A' && row.calculation === 'Условие A'));
    assert.equal(getBdrBudgetItems(buildBdrBudgetItemIndex(rows), '001'), 'Статья А; Статья Б');
    assert.equal(rows.find((row) => row.personalAccount === '002')?.bdr26Corr, '50.00');
    assert.equal(rows.find((row) => row.personalAccount === '002')?.bdr26Count, 1);
    assert.equal(rows.find((row) => row.personalAccount === null)?.bdr26Corr, null);
    assert.equal(rows.find((row) => row.personalAccount === null)?.bdr26Count, 0);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    if (previousOptions === undefined) delete process.env.PGOPTIONS;
    else process.env.PGOPTIONS = previousOptions;
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  }
});
