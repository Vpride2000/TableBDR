import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBudgetDepartment } from '../src/budget/budgetDepartment.js';

test('budget department includes a nonempty expense department in parentheses', () => {
  assert.equal(formatBudgetDepartment('Отдел', 'Расходы'), 'Отдел (Расходы)');
  assert.equal(formatBudgetDepartment('Отдел', null), 'Отдел');
  assert.equal(formatBudgetDepartment('Отдел', '  '), 'Отдел');
  assert.equal(formatBudgetDepartment(null, 'Расходы'), '(Расходы)');
});
