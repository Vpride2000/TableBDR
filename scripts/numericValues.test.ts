import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFiniteNumericValue, parseNumericValue } from '../src/utils/numericValues.js'
import { buildSummaryByField } from '../src/importSubstitution/tkoSummary.js'

test('numeric parsers handle formatted values and invalid input', () => {
  for (const parse of [parseNumericValue, parseFiniteNumericValue]) {
    assert.equal(parse(' 1\u00a0234,50 '), 1234.5)
    assert.equal(parse('-7,25'), -7.25)
    assert.equal(parse(''), 0)
    assert.equal(parse('abc'), 0)
    assert.equal(parse(null), 0)
  }
})

test('numeric parsers preserve their different coercion and non-finite behavior', () => {
  assert.equal(parseNumericValue(true), 0)
  assert.equal(parseFiniteNumericValue(true), 0)
  assert.equal(parseNumericValue([12]), 0)
  assert.equal(parseFiniteNumericValue([12]), 12)
  assert.equal(parseNumericValue(Infinity), Infinity)
  assert.equal(parseNumericValue('Infinity'), Infinity)
  assert.ok(Number.isNaN(parseNumericValue(NaN)))
  assert.equal(parseFiniteNumericValue(Infinity), 0)
  assert.equal(parseFiniteNumericValue('Infinity'), 0)
  assert.equal(parseFiniteNumericValue(NaN), 0)
})

test('equipment summary aggregates formatted quantities', () => {
  const rows = buildSummaryByField([
    { Год: '2026', 'Классификация ТКО': 'РФ в реестре', Количество: '1 200,5', 'Кол-во выводенного импортного ТКО': '0,5' },
    { Год: '2026', 'Классификация ТКО': 'Импорт', Количество: '2', 'Кол-во выводенного импортного ТКО': '1' },
  ], 'Год')

  assert.equal(rows[0].total, 1202.5)
  assert.equal(rows[0].withdrawnImportedTko, 1.5)
  assert.equal(rows[0].registryPercentage, 1200.5 / 1201 * 100)
})
