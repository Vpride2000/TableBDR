import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBdrObjectNames, getBdrObjectNames } from '../src/budget/bdrObjects.js';

test('formats multiple selected BDR objects and supports legacy single-object rows', () => {
  assert.deepEqual(getBdrObjectNames({ 'Объекты': ['Объект A', 'Объект B', 'Объект A', ' '] }), [
    'Объект A',
    'Объект B',
  ]);
  assert.equal(formatBdrObjectNames({ 'Объект': 'Старый объект' }), 'Старый объект');
});
