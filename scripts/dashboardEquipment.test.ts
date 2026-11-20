import assert from 'node:assert/strict';
import test from 'node:test';
import { addDashboardEquipment, type DashboardEquipmentAccumulator } from '../src/utils/dashboardEquipment.js';

test('aggregates quantities and costs by equipment type', () => {
  const equipment = new Map<string, DashboardEquipmentAccumulator>();
  addDashboardEquipment(equipment, 'Маршрутизатор', 2, 120.5);
  addDashboardEquipment(equipment, 'Маршрутизатор', 3, 30);
  addDashboardEquipment(equipment, 'Не указан', 1, 15);
  addDashboardEquipment(equipment, 'Коммутатор', 4, -10);
  assert.deepEqual(equipment.get('Маршрутизатор'), { quantity: 5, cost: 150.5 });
  assert.deepEqual(equipment.get('Не указан'), { quantity: 1, cost: 15 });
  assert.deepEqual(equipment.get('Коммутатор'), { quantity: 4, cost: -10 });
});
