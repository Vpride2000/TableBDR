import assert from 'node:assert/strict'
import test from 'node:test'
import { changedEquipmentColumns } from '../src/importSubstitution/equipmentHistory.js'

test('equipment history reports changed fields and ignores equivalent numbers and object order', () => {
  const before = {
    'Подразделение': 'Филиал',
    'Количество': '10.00',
    'Выведен из эксплуатации': 0,
    'Примечание': null,
    'ОБЪЕКТ': ['А', 'Б'],
    'ЕРРП': 'НЕТ',
    'ЕРМТР': 'НЕТ',
    'Статья затрат ТКО': 'ПЭН',
    'Статус закупки': 'план',
    'ЭКСПЛ': 'НЕТ',
    'ПЛАН': 'РЕЗЕРВ',
    'ГРУППА': 'офис',
    'СЧЕТ УЧЕТА': 'МЦ400201',
  }
  const unchanged = { ...before, 'Количество': 10, 'ОБЪЕКТ': ['Б', 'А'], 'Примечание': '' }
  assert.deepEqual(changedEquipmentColumns(before, unchanged), [])
  assert.deepEqual(changedEquipmentColumns(before, { ...unchanged, 'Количество': '7', 'Примечание': 'Новое' }), ['Количество', 'Примечание'])
})

test('equipment history accounts for server defaults and fields cleared by imports', () => {
  const before = {
    'Подразделение': 'Филиал',
    'Количество': 5,
    'Выведен из эксплуатации': null,
    'Примечание': 'Было',
    'ЕРРП': 'НЕТ',
    'ЕРМТР': 'НЕТ',
    'Статья затрат ТКО': 'ПЭН',
    'Статус закупки': 'план',
    'ЭКСПЛ': 'НЕТ',
    'ПЛАН': 'РЕЗЕРВ',
    'ГРУППА': 'офис',
    'СЧЕТ УЧЕТА': 'МЦ400201',
  }
  assert.deepEqual(changedEquipmentColumns(before, {
    ...before, 'Количество': '', 'Выведен из эксплуатации': '', 'Примечание': '', 'ЭКСПЛ': '',
  }), ['Количество', 'Выведен из эксплуатации', 'Примечание'])
})
