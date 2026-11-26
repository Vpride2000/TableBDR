import assert from 'node:assert/strict';
import test from 'node:test';
import { getBdrBudgetItemCodes, getBdrPaymentDetails, primaryBdrSearchText } from '../src/utils/primaryBdr.js';

test('primary budget item display keeps only the numeric article prefixes', () => {
  assert.equal(getBdrBudgetItemCodes('123. Интернет; 045. Каналы связи'), '123; 045')
  assert.equal(getBdrBudgetItemCodes('Статья без кода; 9-02. Другая'), '902')
  assert.equal(getBdrBudgetItemCodes(''), '')
});

test('primary BDR search text includes BDR totals and other row values', () => {
  const searchText = primaryBdrSearchText(
    { amount: 100, count: 4 },
    [10, 20],
    ['Подразделение А', 'Примечание к строке'],
    170,
  );
  for (const value of ['100,00', '4 стр.', '30,00', 'в бюджете по лс', 'расход за год с ндс', 'остаток лимита договора', '170,00', 'выполнение бюджета по лс', '30%', 'подразделение а', 'примечание к строке']) {
    assert.ok(searchText.includes(value));
  }
});

test('payment plan details are matched by contract and personal account', () => {
  const rows = [
    { contractId: 1, personalAccount: '007', contractSubject: 'Интернет', calculation: 'Фиксированная сумма' },
    { contractId: 1, personalAccount: '007', contractSubject: 'Интернет', calculation: 'Фиксированная сумма' },
    { contractId: 1, personalAccount: '007', contractSubject: 'Канал связи', calculation: 'По факту' },
    { contractId: 2, personalAccount: '007', contractSubject: 'Не тот договор', calculation: 'Не учитывать' },
    { contractId: 1, personalAccount: '008', contractSubject: 'Не тот счет', calculation: 'Не учитывать' },
  ];
  assert.deepEqual(getBdrPaymentDetails(rows, 1, '007'), {
    contractSubject: 'Интернет; Канал связи',
    calculation: 'По факту; Фиксированная сумма',
  });
  assert.deepEqual(getBdrPaymentDetails(rows, 1, 'НЕТ'), { contractSubject: '', calculation: '' });
});
