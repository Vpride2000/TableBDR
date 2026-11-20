import assert from 'node:assert/strict';
import test from 'node:test';
import { addDashboardServiceCost, type DashboardServiceAccumulator } from '../src/utils/dashboardServices.js';

test('aggregates costs by service while deduplicating contractor and contract labels', () => {
  const services = new Map<string, DashboardServiceAccumulator>();
  addDashboardServiceCost(services, 'Интернет', 'Контрагент — Договор', 120.5);
  addDashboardServiceCost(services, 'Интернет', 'Контрагент — Договор', 30);
  addDashboardServiceCost(services, 'Интернет', 'Другой — Договор', -10);
  addDashboardServiceCost(services, 'Телефония', 'Контрагент — Договор', 200);
  assert.equal(services.get('Интернет')?.cost, 140.5);
  assert.deepEqual([...services.get('Интернет')!.contractorsContracts], ['Контрагент — Договор', 'Другой — Договор']);
  assert.equal(services.get('Телефония')?.cost, 200);
});
