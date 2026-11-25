import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { setupRoutes } from '../server/routes.js';
import { isPrimaryMonth, PRIMARY_MONTHS, PRIMARY_QUARTERS } from '../shared/primaryMonths.js';

test('primary quarters contain the twelve months in calendar order', () => {
  assert.deepEqual(PRIMARY_QUARTERS.map((quarter) => quarter.map(({ key }) => key)), [
    ['january', 'february', 'march'],
    ['april', 'may', 'june'],
    ['july', 'august', 'september'],
    ['october', 'november', 'december'],
  ]);
  assert.equal(new Set(PRIMARY_MONTHS.map(({ key }) => key)).size, 12);
  assert.ok(PRIMARY_MONTHS.every(({ key }) => isPrimaryMonth(key)));
  assert.equal(isPrimaryMonth('invalid'), false);
  assert.equal(isPrimaryMonth(null), false);
});

test('primary import and month update routes accept every month and reject invalid months', async () => {
  const app = express();
  app.use(express.json());
  setupRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not start');
    const request = (path: string, method: string, body: unknown) => fetch(`http://127.0.0.1:${address.port}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    for (const { key } of PRIMARY_MONTHS) {
      const imported = await request('/api/primary/import', 'POST', { month: key, records: [{ rowNumber: 0 }] });
      assert.equal(imported.status, 400);
      assert.equal((await imported.json() as { error: string }).error, 'Некорректный номер строки импорта');
      const updated = await request(`/api/primary/month/${key}`, 'PUT', { documents: [{}] });
      assert.equal(updated.status, 400);
      assert.match((await updated.json() as { error: string }).error, /Проверьте сумму/);
    }
    const invalidImport = await request('/api/primary/import', 'POST', { month: 'invalid', records: [{ rowNumber: 0 }] });
    assert.equal((await invalidImport.json() as { error: string }).error, 'Выберите месяц и строки для загрузки');
    const invalidUpdate = await request('/api/primary/month/invalid', 'PUT', { documents: [{}] });
    assert.equal((await invalidUpdate.json() as { error: string }).error, 'Проверьте месяц и список месячных данных');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
