import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import express from 'express';
import * as XLSX from 'xlsx';
import { createDbClient } from '../server/db.js';
import { setupRoutes } from '../server/routes.js';
import { parsePrimaryExcelRows } from '../src/utils/primaryExcel.js';

const references = {
  rows: [{ id: 1, departmentId: 1, contractId: 1000, objects: [{ id: 10 }] }],
  departments: [{ id: 1, label: 'Отдел' }],
  objects: [{ id: 10, label: 'Объект А', departmentIds: [1] }, { id: 11, label: 'Объект Б', departmentIds: [1] }],
  contractors: [{ id: 100, label: 'Организация' }],
  contracts: [{ id: 1000, label: 'Договор', date: '2026-01-02', contractorId: 100 }],
  bdr: [
    { departmentId: 1, objectId: 10, contractorId: 100, contractId: 1000 },
    { departmentId: 1, objectId: 11, contractorId: 100, contractId: 1000 },
  ],
};

test('Excel mapping preserves typed values, blank fields and worksheet row numbers', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['ID', 'Подразделение', 'Объект', 'Контрагент', 'Договор', 'Сумма', 'СЭД', 'Примечание'],
    [1, 'Отдел', 'Объект А; Объект Б', 'Организация', 'Договор от 02.01.2026', 123.45, true, ''],
    [],
    ['', '', '', '', '', '1 234,50', 'нет', 'Новая строка'],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Данные');
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const parsed = XLSX.read(bytes, { type: 'buffer' });
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(parsed.Sheets['Данные'], { header: 1, defval: '', blankrows: true });
  const records = parsePrimaryExcelRows(matrix, {
    id: 0, department: 1, objects: 2, contractor: 3, contract: 4, amountWithVat: 5, sedLaunched: 6, note: 7,
  }, references);
  assert.deepEqual(records, [
    { rowNumber: 2, id: 1, fields: { departmentId: 1, objectIds: [10, 11], contractId: 1000, amountWithVat: 123.45, sedLaunched: true, note: '' } },
    { rowNumber: 4, fields: { departmentId: null, objectIds: [], contractId: null, amountWithVat: 1234.5, sedLaunched: false, note: 'Новая строка' } },
  ]);
});

test('Excel mapping rejects duplicate IDs, ambiguous references, invalid relationships and duplicate columns', () => {
  assert.throws(() => parsePrimaryExcelRows([['ID', 'Примечание'], [1, 'a'], [1, 'b']], { id: 0, note: 1 }, references), /Строка 3.*ID/);
  assert.throws(() => parsePrimaryExcelRows([['ID', 'Примечание'], [99, 'a']], { id: 0, note: 1 }, references), /Строка 2.*не найдена/);
  assert.throws(() => parsePrimaryExcelRows([['Отдел'], ['Отдел']], { department: 0 }, {
    ...references, departments: [...references.departments, { id: 2, label: 'Отдел' }],
  }), /неоднозначен/);
  assert.throws(() => parsePrimaryExcelRows([['Отдел', 'Объект'], ['Отдел', 'Несуществующий']], { department: 0, objects: 1 }, references), /не найден/);
  assert.throws(() => parsePrimaryExcelRows([['Отдел', 'Объект'], ['Отдел', 'Объект А']], { department: 0, objects: 1 }, {
    ...references, objects: [{ id: 10, label: 'Объект А', departmentIds: [2] }],
  }), /не относится/);
  assert.throws(() => parsePrimaryExcelRows([['Значение'], ['a']], { note: 0, personalAccount: 0 }, references), /несколькими полями/);
  assert.throws(() => parsePrimaryExcelRows([['СЭД'], ['возможно']], { sedLaunched: 0 }, references), /да\/нет/);
  assert.deepEqual(parsePrimaryExcelRows([['ID', 'Примечание', 'Другое'], [1, '', ''], ['', '', 'не импортируется']], { id: 0, note: 1 }, references),
    [{ rowNumber: 2, id: 1, fields: { note: '' } }]);
});

test('batch import creates and updates atomically without changing hidden fields or other months', async () => {
  const client = await createDbClient();
  const schema = `primary_import_test_${randomUUID().replace(/-/g, '')}`;
  const previousOptions = process.env.PGOPTIONS;
  let server: ReturnType<express.Express['listen']> | undefined;
  let createdSchema = false;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    createdSchema = true;
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE "GN_primary_documents" (
        "GN_primary_document_id" SERIAL PRIMARY KEY, "GN_department_FK" INTEGER,
        "GN_dogovor_FK" INTEGER, "personal_account" TEXT NOT NULL DEFAULT '',
        "document_month" TEXT NOT NULL DEFAULT 'october', "details" TEXT NOT NULL DEFAULT '',
        "details_enabled" BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE TABLE objects (id INTEGER PRIMARY KEY);
      CREATE TABLE "GN_primary_document_objects" (
        "primary_document_id" INTEGER REFERENCES "GN_primary_documents" ON DELETE CASCADE,
        "object_id" INTEGER REFERENCES objects, PRIMARY KEY ("primary_document_id", "object_id")
      );
      CREATE TABLE "GN_primary_document_pao_budget_items" ("primary_document_id" INTEGER, "budget_item_id" INTEGER);
      CREATE TABLE "GN_primary_document_expense_departments" ("primary_document_id" INTEGER, "department_id" INTEGER);
      CREATE TABLE "GN_primary_document_months" (
        "primary_document_id" INTEGER REFERENCES "GN_primary_documents" ON DELETE CASCADE,
        "document_month" TEXT NOT NULL, "amount_with_vat" NUMERIC,
        "sed_launched" BOOLEAN NOT NULL DEFAULT FALSE, "accepted_in_1c" BOOLEAN NOT NULL DEFAULT FALSE,
        "note" TEXT NOT NULL DEFAULT '', PRIMARY KEY ("primary_document_id", "document_month")
      );
      INSERT INTO objects VALUES (10), (11);
      INSERT INTO "GN_primary_documents" ("GN_department_FK", "GN_dogovor_FK", "personal_account", "details", "details_enabled")
      VALUES (1, 1000, 'old', 'hidden', TRUE);
      INSERT INTO "GN_primary_document_objects" VALUES (1, 10);
      INSERT INTO "GN_primary_document_pao_budget_items" VALUES (1, 20);
      INSERT INTO "GN_primary_document_expense_departments" VALUES (1, 30);
      INSERT INTO "GN_primary_document_months" VALUES (1, 'october', 100, TRUE, TRUE, 'old note'), (1, 'november', 200, TRUE, FALSE, 'other month');
    `);
    process.env.PGOPTIONS = `-c search_path=${schema}`;
    const app = express();
    app.use(express.json());
    setupRoutes(app);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not start');
    const submit = (month: string, records: unknown[]) => fetch(`http://127.0.0.1:${address.port}/api/primary/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, records }),
    });
    const success = await submit('october', [
      { rowNumber: 2, id: 1, fields: { personalAccount: 'new', amountWithVat: null } },
      { rowNumber: 3, fields: { departmentId: 1, objectIds: [11], note: 'created' } },
    ]);
    assert.equal(success.status, 200);
    assert.deepEqual(await success.json(), { created: 1, updated: 1 });
    const documents = await client.query('SELECT "personal_account", "details", "details_enabled" FROM "GN_primary_documents" ORDER BY "GN_primary_document_id"');
    assert.deepEqual(documents.rows, [
      { personal_account: 'new', details: 'hidden', details_enabled: true },
      { personal_account: '', details: '', details_enabled: false },
    ]);
    assert.deepEqual((await client.query('SELECT * FROM "GN_primary_document_objects" ORDER BY "primary_document_id"')).rows,
      [{ primary_document_id: 1, object_id: 10 }, { primary_document_id: 2, object_id: 11 }]);
    assert.deepEqual((await client.query('SELECT * FROM "GN_primary_document_pao_budget_items"')).rows, [{ primary_document_id: 1, budget_item_id: 20 }]);
    assert.deepEqual((await client.query('SELECT * FROM "GN_primary_document_expense_departments"')).rows, [{ primary_document_id: 1, department_id: 30 }]);
    const months = await client.query('SELECT * FROM "GN_primary_document_months" ORDER BY "primary_document_id", "document_month"');
    assert.deepEqual(months.rows, [
      { primary_document_id: 1, document_month: 'november', amount_with_vat: '200', sed_launched: true, accepted_in_1c: false, note: 'other month' },
      { primary_document_id: 1, document_month: 'october', amount_with_vat: null, sed_launched: true, accepted_in_1c: true, note: 'old note' },
      { primary_document_id: 2, document_month: 'october', amount_with_vat: null, sed_launched: false, accepted_in_1c: false, note: 'created' },
    ]);
    const missing = await submit('october', [
      { rowNumber: 2, id: 1, fields: { personalAccount: 'rolled back' } },
      { rowNumber: 3, id: 999, fields: { note: 'missing' } },
    ]);
    assert.equal(missing.status, 409);
    assert.match((await missing.json() as { error: string }).error, /Строка 3/);
    const invalid = await submit('october', [
      { rowNumber: 2, id: 1, fields: { personalAccount: 'rolled back' } },
      { rowNumber: 3, fields: { objectIds: [999] } },
    ]);
    assert.equal(invalid.status, 400);
    assert.equal((await client.query('SELECT "personal_account" FROM "GN_primary_documents" WHERE "GN_primary_document_id" = 1')).rows[0].personal_account, 'new');
    assert.equal((await client.query('SELECT count(*)::int AS count FROM "GN_primary_documents"')).rows[0].count, 2);
    const duplicate = await submit('october', [
      { rowNumber: 2, id: 1, fields: { note: 'a' } },
      { rowNumber: 3, id: 1, fields: { note: 'b' } },
    ]);
    assert.equal(duplicate.status, 400);
    assert.match((await duplicate.json() as { error: string }).error, /Строка 3/);
    assert.equal((await submit('january', [{ rowNumber: 2, fields: { note: 'a' } }])).status, 400);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    if (previousOptions === undefined) delete process.env.PGOPTIONS;
    else process.env.PGOPTIONS = previousOptions;
    if (createdSchema) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  }
});
