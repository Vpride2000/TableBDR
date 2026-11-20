import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDbClient, ensurePrimaryDocumentsTables } from '../server/db.js';

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
