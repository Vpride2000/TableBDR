import assert from 'node:assert/strict'
import test from 'node:test'
import { formatDateDisplay, normalizeDateValue } from '../contract/contractDates.js'
import { aggregateSatelliteRowsByMac, type SatelliteRow } from '../satellites/satelliteXml.js'
import { startColumnResize } from '../utils/columnResize.js'
import { displayLookupLabel, mapLookupOptions } from '../utils/lookupOptions.js'
import { fetchReference, fetchReferences } from '../utils/referenceRequests.js'
import { createEquipmentWorkbook } from '../importSubstitution/equipmentExcel.js'
import { EQUIPMENT_EXCEL_COLUMNS } from '../importSubstitution/equipmentHistory.js'
import { parseBdrOptions } from '../utils/primaryBdr.js'
import * as XLSX from 'xlsx'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PrimarySearchableSelect from '../components/PrimarySearchableSelect.js'
import EquipmentOptionPicker from '../importSubstitution/EquipmentOptionPicker.js'
import PrimaryPaymentPlan from '../components/PrimaryPaymentPlan.js'
import App from '../App.js'

test('contract dates preserve empty, short and timestamp values', () => {
  assert.equal(normalizeDateValue(null), '')
  assert.equal(normalizeDateValue('2026-03'), '2026-03')
  assert.equal(normalizeDateValue('2026-03-05T12:00:00Z'), '2026-03-05')
  assert.equal(normalizeDateValue(new Date('2026-03-05T12:00:00Z')), '2026-03-05')
  assert.equal(formatDateDisplay(''), '')
  assert.equal(formatDateDisplay('2026-03'), '2026-03')
  assert.equal(formatDateDisplay('2026-03-05T12:00:00Z'), '05.03.26')
})

test('lookup options and labels preserve empty and unknown values', () => {
  const options = mapLookupOptions([{ id: 12, name: 'Поставщик' }, { id: null, name: null }], 'id', 'name')
  assert.deepEqual(options, [{ value: '12', label: 'Поставщик' }, { value: '', label: '' }])
  assert.equal(displayLookupLabel(options, 12), 'Поставщик')
  assert.equal(displayLookupLabel(options, 99), '99')
  assert.equal(displayLookupLabel(options, null), '')
})

test('reference requests preserve raw responses and network errors', async (context) => {
  const requests: string[] = []
  const response = new Response('unavailable', { status: 503 })
  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    requests.push(String(input))
    if (input === '/api/gn/objects') throw new Error('network error')
    return response
  })

  assert.equal(await fetchReference('departments'), response)
  assert.equal(response.status, 503)
  await assert.rejects(fetchReference('objects'), /network error/)
  assert.deepEqual(await Promise.all(fetchReferences('dogovors', 'contractors')), [response, response])
  assert.deepEqual(requests, [
    '/api/gn/departments', '/api/gn/objects', '/api/gn/dogovors', '/api/gn/contractors',
  ])
})

test('equipment Excel export keeps headers, object arrays, widths and filter', () => {
  const workbook = createEquipmentWorkbook([
    { GN_import_substitution_id: 17, Подразделение: 'Отдел', ОБЪЕКТ: ['А', 'Б'], Количество: 0 },
  ])
  assert.deepEqual(workbook.SheetNames, ['Учет оборудования'])
  const sheet = workbook.Sheets['Учет оборудования']
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  assert.deepEqual(rows[0], ['№', ...EQUIPMENT_EXCEL_COLUMNS])
  assert.equal(rows[1][0], 17)
  assert.equal(rows[1][1], 'Отдел')
  assert.equal(rows[1][1 + EQUIPMENT_EXCEL_COLUMNS.indexOf('Количество')], 0)
  assert.equal(rows[1][1 + EQUIPMENT_EXCEL_COLUMNS.indexOf('ОБЪЕКТ')], '["А","Б"]')
  assert.equal(sheet['!autofilter']?.ref, `A1:${XLSX.utils.encode_col(EQUIPMENT_EXCEL_COLUMNS.length)}2`)
  assert.equal(sheet['!cols']?.length, EQUIPMENT_EXCEL_COLUMNS.length + 1)
  assert.ok(sheet['!cols']?.every((column) => column.wch !== undefined && column.wch >= 12 && column.wch <= 44))
})

test('primary BDR options validate and normalize server rows', () => {
  const row = {
    departmentId: '5', objectId: null, contractorId: '8', contractId: 9,
    expenseDepartment: 'Отдел', budgetItem: null, personalAccount: '01',
    contractSubject: null, calculation: null, bdr26Corr: '100.50', bdr26Count: 2,
  }
  assert.deepEqual(parseBdrOptions([row]), [{
    ...row, departmentId: 5, contractorId: 8, bdr26Corr: 100.5,
  }])
  assert.throws(() => parseBdrOptions([{ ...row, bdr26Corr: '' }]), /Некорректное значение БДР26корр/)
  assert.throws(() => parseBdrOptions([{ ...row, bdr26Count: 0 }]), /Некорректное количество строк БДР26корр/)
  assert.throws(() => parseBdrOptions([{ ...row, objectId: -1 }]), /Некорректные данные БДР/)
})

test('extracted form controls retain selected values and accessibility labels', () => {
  const select = renderToStaticMarkup(createElement(PrimarySearchableSelect, {
    label: 'Объект',
    value: ['2'],
    options: [{ value: '2', label: 'Объект 2' }, { value: '1', label: 'Объект 1' }],
    multiple: true,
    disabled: true,
    onChange: () => {},
  }))
  assert.match(select, /aria-label="Поиск: Объект"/)
  assert.match(select, /multiple=""[^>]*disabled=""/)
  assert.match(select, /value="2" selected=""/)
  assert.ok(select.indexOf('Объект 1</option>') < select.indexOf('Объект 2</option>'))

  const picker = renderToStaticMarkup(createElement(EquipmentOptionPicker, {
    label: 'Группа', value: 'поле', options: ['офис', 'поле'], onChange: () => {},
  }))
  assert.match(picker, /role="group" aria-label="Группа"/)
  assert.match(picker, /equipment-group-picker__option--active" aria-pressed="true">поле/)
})

test('payment plan displays the rows, totals and error', () => {
  const markup = renderToStaticMarkup(createElement(PrimaryPaymentPlan, {
    monthLabel: 'Октябрь',
    amounts: [{ id: 1, contractor: 'ООО', contractSubject: 'Интернет', contract: 'Договор', calculation: 'По факту', amount: '1234.5' }],
    error: 'Ошибка экспорта',
    onExport: () => {},
    onClose: () => {},
  }))
  assert.match(markup, /План платежей: Октябрь/)
  assert.match(markup, /Ошибка экспорта/)
  assert.match(markup, /Интернет/)
  assert.match(markup.replace(/\s/g, ''), /Итого:1234,50/)
})

test('app renders the start dashboard and budget section for their routes', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const location = { hash: '#start' }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location } })

  try {
    const start = renderToStaticMarkup(createElement(App))
    assert.match(start, /Загрузка сводной информации/)
    assert.match(start, /Услуги_связи/)

    location.hash = '#budget'
    const budget = renderToStaticMarkup(createElement(App))
    assert.match(budget, /Своды по лимитам/)
    assert.match(budget, /БДР Услуги связи/)
    assert.match(budget, /Газпром телеком/)
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('satellite aggregation sums formatted amounts and quantities', () => {
  const row: SatelliteRow = {
    index: 1, description: '', objectName: '', branch: '', macAddress: 'AA:BB',
    tariff: '', tariffNote: '', month: '', unit: '', quantity: '1,5', amountWithoutVat: '1 200,50',
  }
  const [total] = aggregateSatelliteRowsByMac([row, { ...row, quantity: '2', amountWithoutVat: '3,50' }])
  assert.equal(total.quantity, '3,5')
  assert.equal(total.amountWithoutVat.replace(/\s/g, ''), '1204,00')
})

test('column resizing respects minimum width and stops on pointer up or optional cancellation', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const target = new EventTarget()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target })

  try {
    let prevented = false
    let stopped = false
    const event = {
      clientX: 100,
      currentTarget: { closest: () => ({ getBoundingClientRect: () => ({ width: 100 }) }) },
      preventDefault: () => { prevented = true },
      stopPropagation: () => { stopped = true },
    }
    const widths: number[] = []
    const move = (clientX: number): void => {
      const pointerEvent = new Event('pointermove')
      Object.defineProperty(pointerEvent, 'clientX', { value: clientX })
      target.dispatchEvent(pointerEvent)
    }

    startColumnResize(event, 60, (width) => widths.push(width))
    move(130)
    move(0)
    target.dispatchEvent(new Event('pointercancel'))
    move(110)
    target.dispatchEvent(new Event('pointerup'))
    move(140)
    assert.equal(prevented, true)
    assert.equal(stopped, true)
    assert.deepEqual(widths, [130, 60, 110])

    startColumnResize(event, 64, (width) => widths.push(width), true)
    move(120)
    target.dispatchEvent(new Event('pointercancel'))
    move(140)
    assert.deepEqual(widths, [130, 60, 110, 120])

    startColumnResize({ ...event, currentTarget: { closest: () => null } }, 60, (width) => widths.push(width))
    move(150)
    assert.deepEqual(widths, [130, 60, 110, 120])
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
