import assert from 'node:assert/strict';
import test from 'node:test';
import { primaryMonthStatusClass } from '../shared/primaryMonths.js';

test('primary month status reflects both checkboxes, including historical combinations', () => {
  assert.equal(primaryMonthStatusClass(), 'status-cell--inactive');
  assert.equal(primaryMonthStatusClass({ sedLaunched: false, acceptedIn1C: false }), 'status-cell--inactive');
  assert.equal(primaryMonthStatusClass({ sedLaunched: true, acceptedIn1C: false }), 'status-cell--pending');
  assert.equal(primaryMonthStatusClass({ sedLaunched: true, acceptedIn1C: true }), 'status-cell--active');
  assert.equal(primaryMonthStatusClass({ sedLaunched: false, acceptedIn1C: true }), '');
});
