export const EQUIPMENT_EXCEL_COLUMNS = [
  'Подразделение',
  'Код ТКО',
  'Наименование ТКО',
  'Тип',
  'Вендор ТКО',
  'Классификация ТКО',
  'ЕРРП',
  'ЕРМТР',
  'Регистрационный номер ТКО',
  'Количество',
  'Выведен из эксплуатации',
  'Инвентарный',
  'ИМЯ',
  'СЕРИЙНЫЙ НОМЕР',
  'Замещенное импортное ТКО',
  'Кол-во выводенного импортного ТКО',
  'Статья затрат ТКО',
  'СЧЕТ УЧЕТА',
  'Статус закупки',
  'Платеж ТР без НДС',
  'Год',
  'Примечание',
  'ЭКСПЛ',
  'ПЛАН',
  'ГРУППА',
  'ОБЪЕКТ',
  'Поставщик',
  'Огрузочный реквизит',
  'оплата',
] as const

type Row = Record<string, unknown>

const numericColumns = new Set<string>([
  'Количество', 'Выведен из эксплуатации', 'Кол-во выводенного импортного ТКО', 'Платеж ТР без НДС', 'Год',
])
const referenceColumns = new Set<string>(['Код ТКО', 'Тип', 'Вендор ТКО', 'Поставщик', 'Огрузочный реквизит'])
const updateDefaults: Record<string, string> = {
  'ЕРРП': 'НЕТ', 'ЕРМТР': 'НЕТ', 'Статья затрат ТКО': 'ПЭН', 'Статус закупки': 'план',
  'ЭКСПЛ': 'НЕТ', 'ПЛАН': 'РЕЗЕРВ', 'ГРУППА': 'офис',
}

function normalizedValue(column: string, value: unknown): string {
  if (column === 'ОБЪЕКТ') {
    const values = Array.isArray(value) ? value : value ? [value] : []
    return JSON.stringify([...new Set(values.map((item) => String(item).trim()).filter(Boolean))].sort())
  }
  if (numericColumns.has(column)) {
    if (value === '' || value == null) return ''
    const number = Number(value)
    return Number.isFinite(number) ? String(number) : String(value)
  }
  const text = String(value ?? '')
  return referenceColumns.has(column) ? text.trim() : text
}

export function changedEquipmentColumns(before: Row, payload: Row): string[] {
  return EQUIPMENT_EXCEL_COLUMNS.filter((column) => {
    let next = payload[column]
    if (column === 'Выведен из эксплуатации' && (next == null || next === '')) next = 0
    if (column in updateDefaults && !next) next = updateDefaults[column]
    if (column === 'СЧЕТ УЧЕТА' && next === undefined) {
      next = before[column] ?? ((payload['Статья затрат ТКО'] || 'ПЭН') === 'ПЭН' ? 'МЦ400201' : null)
    }
    return normalizedValue(column, before[column]) !== normalizedValue(column, next)
  })
}
