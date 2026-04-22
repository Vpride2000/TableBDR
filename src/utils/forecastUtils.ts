import { ForecastRow, FORECAST_HIERARCHY_COLUMNS } from '../types/forecast.js'

export function pageFromHash(hash: string): import('../types/forecast.js').Page {
  if (hash === '#invest-program-table') return 'invest-program-table'
  if (hash === '#contracts') return 'contracts'
  if (hash === '#forecasts') return 'forecasts'
  if (hash === '#guide') return 'guide'
  return 'budget'
}

export function toForecastKeyPart(value: unknown): string {
  const normalized = String(value ?? '').trim()
  return normalized === '' ? '—' : normalized
}

export function toForecastNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(',', '.')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function distributeByMonths(total: number): number[] {
  const yearlyCents = Math.round(total * 100)
  const base = Math.trunc(yearlyCents / 12)
  const remainder = yearlyCents - base * 12
  const sign = remainder >= 0 ? 1 : -1
  const addCount = Math.abs(remainder)

  return Array.from({ length: 12 }, (_, index) => {
    const extra = index < addCount ? sign : 0
    return (base + extra) / 100
  })
}

export function normalizeMonthlyValues(values: number[]): number[] {
  const normalized = new Array<number>(12).fill(0)

  for (let index = 0; index < 12; index += 1) {
    const value = values[index]
    normalized[index] = Number.isFinite(value) ? value : 0
  }

  return normalized
}

export function getForecastRowKey(row: ForecastRow): string {
  return String(row.rowId)
}

export function buildForecastRows(rows: Record<string, unknown>[]): ForecastRow[] {
  const mapped = rows.map((row) => {
    const rowId = toForecastNumber(row['GN_bdr_ID'])
    const limit = toForecastNumber(row['GN_bdr_limit'])

    return {
      rowId,
      'Статья бюджета': toForecastKeyPart(row['Статья бюджета']),
      Контрагент: toForecastKeyPart(row['Контрагент']),
      Договор: toForecastKeyPart(row['Договор']),
      Подразделение: toForecastKeyPart(row['Подразделение']),
      'Предмет договора': toForecastKeyPart(row['Предмет договора']),
      monthlyValues: distributeByMonths(limit),
      totalLimit: limit,
    }
  })

  return mapped.sort((a, b) => {
    for (const column of FORECAST_HIERARCHY_COLUMNS) {
      const compare = a[column].localeCompare(b[column], 'ru')
      if (compare !== 0) return compare
    }
    return a.rowId - b.rowId
  })
}

export function buildRowSpans(rows: ForecastRow[]): Array<Record<string, number>> {
  const spans = rows.map(() =>
    Object.fromEntries(FORECAST_HIERARCHY_COLUMNS.map((column) => [column, 0])) as Record<string, number>
  )

  FORECAST_HIERARCHY_COLUMNS.forEach((column, depthIndex) => {
    let start = 0

    while (start < rows.length) {
      let end = start + 1

      while (end < rows.length) {
        const samePrefix = FORECAST_HIERARCHY_COLUMNS.slice(0, depthIndex + 1).every(
          (key) => rows[end][key] === rows[start][key]
        )

        if (!samePrefix) break
        end += 1
      }

      spans[start][column] = end - start
      start = end
    }
  })

  return spans
}