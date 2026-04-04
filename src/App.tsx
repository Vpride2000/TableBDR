import { useEffect, useMemo, useState } from 'react'
import BudgetTable from './BudgetTable'
import Guide from './Guide'
import AddBudgetRowPage from './AddBudgetRowPage'
import LimitDetailsPage from './LimitDetailsPage'
import ContractDetailsPage from './ContractDetailsPage'
import ContractsPage from './ContractsPage'
import InvestProgramTablePage from './InvestProgramTablePage'
import './styles.css'

type Page = 'budget' | 'guide' | 'forecasts' | 'contracts' | 'invest-program-table'

function pageFromHash(hash: string): Page {
  if (hash === '#invest-program-table') return 'invest-program-table'
  if (hash === '#contracts') return 'contracts'
  if (hash === '#forecasts') return 'forecasts'
  if (hash === '#guide') return 'guide'
  return 'budget'
}

type ForecastSourceRow = Record<string, unknown>

interface ForecastRow {
  rowId: number
  'Статья бюджета': string
  Контрагент: string
  Договор: string
  Подразделение: string
  monthlyValues: number[]
  totalLimit: number
}

interface ForecastMonthlyApiRow {
  rowId: number
  monthlyValues: number[]
  monthlyFactValues?: number[]
}

type ForecastMonthlyEdits = Record<string, number[]>
type ForecastMonthlyFactEdits = Record<string, number[]>

const FORECAST_HIERARCHY_COLUMNS: Array<keyof Pick<ForecastRow, 'Статья бюджета' | 'Контрагент' | 'Договор' | 'Подразделение'>> = [
  'Статья бюджета',
  'Контрагент',
  'Договор',
  'Подразделение',
]
const FORECAST_FILTER_PLACEHOLDER = 'Все'

const FORECAST_MONTH_LABELS = [
  'Янв',
  'Фев',
  'Мар',
  'Апр',
  'Май',
  'Июн',
  'Июл',
  'Авг',
  'Сен',
  'Окт',
  'Ноя',
  'Дек',
]

const FORECAST_NUMBER_FORMATTER = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const FORECAST_UPDATED_EVENT_KEY = 'forecast:last-update'
const BDR_UPDATED_EVENT_KEY = 'bdr:last-update'

function toForecastKeyPart(value: unknown): string {
  const normalized = String(value ?? '').trim()
  return normalized === '' ? '—' : normalized
}

function toForecastNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(',', '.')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function distributeByMonths(total: number): number[] {
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

function buildRowSpans(rows: ForecastRow[]): Array<Record<string, number>> {
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

function getForecastRowKey(row: ForecastRow): string {
  return String(row.rowId)
}

function normalizeMonthlyValues(values: number[]): number[] {
  const normalized = new Array<number>(12).fill(0)

  for (let index = 0; index < 12; index += 1) {
    const value = values[index]
    normalized[index] = Number.isFinite(value) ? value : 0
  }

  return normalized
}

function buildForecastRows(rows: ForecastSourceRow[]): ForecastRow[] {
  const mapped = rows.map((row) => {
    const rowId = toForecastNumber(row['GN_bdr_ID'])
    const limit = toForecastNumber(row['Лимит'])

    return {
      rowId,
      'Статья бюджета': toForecastKeyPart(row['Статья бюджета']),
      Контрагент: toForecastKeyPart(row['Контрагент']),
      Договор: toForecastKeyPart(row['Договор']),
      Подразделение: toForecastKeyPart(row['Подразделение']),
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

function Forecasts() {
  const [rows, setRows] = useState<ForecastSourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monthlyEdits, setMonthlyEdits] = useState<ForecastMonthlyEdits>({})
  const [monthlyFactEdits, setMonthlyFactEdits] = useState<ForecastMonthlyFactEdits>({})
  const [forecastFilters, setForecastFilters] = useState<Record<(typeof FORECAST_HIERARCHY_COLUMNS)[number], string>>({
    'Статья бюджета': '',
    Контрагент: '',
    Договор: '',
    Подразделение: '',
  })
  function loadForecastData(): Promise<void> {
    setLoading(true)
    setError(null)

    return Promise.all([
      fetch('/api/gn/bdr'),
      fetch('/api/gn/forecast-monthly'),
    ])
      .then(async ([bdrResponse, forecastResponse]) => {
        if (!bdrResponse.ok) throw new Error(`HTTP ${bdrResponse.status}`)
        if (!forecastResponse.ok) throw new Error(`HTTP ${forecastResponse.status}`)

        const [bdrRows, forecastPayload] = await Promise.all([
          bdrResponse.json() as Promise<ForecastSourceRow[]>,
          forecastResponse.json() as Promise<{ rows?: ForecastMonthlyApiRow[] }>,
        ])

        const nextMonthlyEdits: ForecastMonthlyEdits = {}
        const nextMonthlyFactEdits: ForecastMonthlyFactEdits = {}
        ;(forecastPayload.rows ?? []).forEach((row) => {
          const key = String(toForecastNumber(row.rowId))

          const values = Array.isArray(row.monthlyValues)
            ? row.monthlyValues.map((value) => toForecastNumber(value))
            : []
          const factValues = Array.isArray(row.monthlyFactValues)
            ? row.monthlyFactValues.map((value) => toForecastNumber(value))
            : []

          nextMonthlyEdits[key] = normalizeMonthlyValues(values)
          nextMonthlyFactEdits[key] = normalizeMonthlyValues(factValues)
        })

        setRows(bdrRows)
        setMonthlyEdits(nextMonthlyEdits)
        setMonthlyFactEdits(nextMonthlyFactEdits)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void loadForecastData()
  }, [])

  useEffect(() => {
    function onStorage(event: StorageEvent): void {
      if (event.key !== FORECAST_UPDATED_EVENT_KEY) return
      void loadForecastData()
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const forecastRows = useMemo(() => buildForecastRows(rows), [rows])

  const filteredForecastRows = useMemo(() => {
    return forecastRows.filter((row) =>
      FORECAST_HIERARCHY_COLUMNS.every((column) => {
        const filterValue = forecastFilters[column].trim()
        if (!filterValue) return true
        return row[column] === filterValue
      })
    )
  }, [forecastRows, forecastFilters])

  const filteredRowSpans = useMemo(() => buildRowSpans(filteredForecastRows), [filteredForecastRows])

  const forecastFilterOptions = useMemo(() => {
    const options: Record<(typeof FORECAST_HIERARCHY_COLUMNS)[number], string[]> = {
      'Статья бюджета': [],
      Контрагент: [],
      Договор: [],
      Подразделение: [],
    }

    FORECAST_HIERARCHY_COLUMNS.forEach((column) => {
      options[column] = [...new Set(forecastRows.map((row) => row[column]))].sort((a, b) => a.localeCompare(b, 'ru'))
    })

    return options
  }, [forecastRows])

  function getDisplayedMonthlyValues(row: ForecastRow): number[] {
    return monthlyEdits[getForecastRowKey(row)] ?? row.monthlyValues
  }

  function getDisplayedMonthlyFactValues(row: ForecastRow): number[] {
    return monthlyFactEdits[getForecastRowKey(row)] ?? new Array<number>(12).fill(0)
  }

  function getForecastCellStatusClass(planValue: number, factValue: number): string {
    if (factValue === 0) return 'forecast-month-cell--zero-fact'
    if (Math.abs(planValue - factValue) < 0.005) return 'forecast-month-cell--match'
    return 'forecast-month-cell--mismatch'
  }

  function setForecastFilter(column: (typeof FORECAST_HIERARCHY_COLUMNS)[number], value: string): void {
    setForecastFilters((prev) => ({ ...prev, [column]: value }))
  }


  function openForecastMonthPopup(monthIndex: number): void {
    const popupUrl = `${window.location.pathname}#forecast-month-window-${monthIndex}`
    const popup = window.open(
      popupUrl,
      `forecast-month-window-${monthIndex}`,
      'popup=yes,width=1100,height=820,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  const totalByMonths = useMemo(() => {
    const totals = new Array<number>(12).fill(0)
    filteredForecastRows.forEach((row) => {
      getDisplayedMonthlyValues(row).forEach((value, index) => {
        totals[index] += value
      })
    })
    return totals
  }, [filteredForecastRows, monthlyEdits])

  const grandTotal = useMemo(
    () =>
      filteredForecastRows.reduce(
        (sum, row) => sum + getDisplayedMonthlyValues(row).reduce((acc, value) => acc + value, 0),
        0
      ),
    [filteredForecastRows, monthlyEdits]
  )

  const limitPivot = useMemo(() => {
    const departmentsSet = new Set<string>()
    const byBudget = new Map<string, Map<string, number>>()

    filteredForecastRows.forEach((row) => {
      const budget = row['Статья бюджета']
      const department = row.Подразделение
      const rowTotal = getDisplayedMonthlyValues(row).reduce((sum, value) => sum + value, 0)

      departmentsSet.add(department)

      const budgetRow = byBudget.get(budget) ?? new Map<string, number>()
      budgetRow.set(department, (budgetRow.get(department) ?? 0) + rowTotal)
      byBudget.set(budget, budgetRow)
    })

    const departments = [...departmentsSet].sort((a, b) => a.localeCompare(b, 'ru'))
    const budgetItems = [...byBudget.keys()].sort((a, b) => a.localeCompare(b, 'ru'))

    const rows = budgetItems.map((budgetItem) => {
      const source = byBudget.get(budgetItem) ?? new Map<string, number>()
      const byDepartment: Record<string, number> = {}

      departments.forEach((department) => {
        byDepartment[department] = source.get(department) ?? 0
      })

      const total = departments.reduce((sum, department) => sum + byDepartment[department], 0)

      return {
        budgetItem,
        byDepartment,
        total,
      }
    })

    const totalsByDepartment: Record<string, number> = {}
    departments.forEach((department) => {
      totalsByDepartment[department] = rows.reduce(
        (sum, row) => sum + (row.byDepartment[department] ?? 0),
        0
      )
    })

    const total = rows.reduce((sum, row) => sum + row.total, 0)

    return {
      departments,
      rows,
      totalsByDepartment,
      total,
    }
  }, [filteredForecastRows, monthlyEdits])

  return (
    <section className="guide forecast-section">
      <div className="guide-section forecast-section-content">
        <h2>Прогнозы расходов лимита по месяцам</h2>
        <p className="hint">Для редактирования нажмите на название месяца. Откроется отдельное окно с соседними месяцами.</p>
        {loading && <p className="hint">Загрузка данных...</p>}
        {error && <p className="hint hint--error">Ошибка: {error}</p>}
        {!loading && !error && forecastRows.length === 0 && <p className="hint">Нет данных для прогноза.</p>}
        {!loading && !error && forecastRows.length > 0 && filteredForecastRows.length === 0 && (
          <p className="hint">Нет данных, подходящих под выбранные фильтры.</p>
        )}

        {!loading && !error && forecastRows.length > 0 && filteredForecastRows.length > 0 && (
          <>
            <div className="guide-table-wrap forecast-table-wrap">
              <table className="guide-table table-compact forecast-table">
                <thead>
                  <tr>
                    {FORECAST_HIERARCHY_COLUMNS.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                    {FORECAST_MONTH_LABELS.map((month, monthIndex) => {
                      return (
                        <th key={month} className="number-cell forecast-month-col forecast-month-header">
                          <button
                            type="button"
                            className="forecast-month-header-button"
                            onClick={() => openForecastMonthPopup(monthIndex)}
                            title="Нажмите, чтобы открыть popup редактирования месяца"
                          >
                            {month}
                          </button>
                        </th>
                      )
                    })}
                    <th className="number-cell forecast-total-col">Итого за год</th>
                  </tr>
                  <tr className="filter-row">
                    {FORECAST_HIERARCHY_COLUMNS.map((column) => (
                      <th key={`forecast-filter-${column}`}>
                        <select
                          className="column-filter-input forecast-column-filter-select"
                          value={forecastFilters[column]}
                          onChange={(event) => setForecastFilter(column, event.target.value)}
                        >
                          <option value="">{FORECAST_FILTER_PLACEHOLDER}</option>
                          {forecastFilterOptions[column].map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                    {FORECAST_MONTH_LABELS.map((month) => (
                      <th key={`forecast-filter-${month}`} />
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredForecastRows.map((row, rowIndex) => {
                    const rowKey = getForecastRowKey(row)
                    const displayedMonthlyValues = getDisplayedMonthlyValues(row)
                    const displayedMonthlyFactValues = getDisplayedMonthlyFactValues(row)
                    const rowTotal = displayedMonthlyValues.reduce((sum, value) => sum + value, 0)

                    return (
                      <tr key={rowKey}>
                        {FORECAST_HIERARCHY_COLUMNS.map((column) => {
                          const span = filteredRowSpans[rowIndex]?.[column] ?? 0
                          if (span === 0) return null

                          return (
                            <td key={`${column}-${rowIndex}`} rowSpan={span}>
                              {row[column]}
                            </td>
                          )
                        })}

                        {displayedMonthlyValues.map((value, monthIndex) => (
                          <td
                            key={`month-${rowIndex}-${monthIndex}`}
                            className={`number-cell forecast-month-col forecast-month-cell--locked ${getForecastCellStatusClass(value, displayedMonthlyFactValues[monthIndex] ?? 0)}`}
                            title={`План: ${FORECAST_NUMBER_FORMATTER.format(value)}; Факт: ${FORECAST_NUMBER_FORMATTER.format(displayedMonthlyFactValues[monthIndex] ?? 0)}`}
                          >
                            <span className="forecast-month-value">{FORECAST_NUMBER_FORMATTER.format(value)}</span>
                          </td>
                        ))}

                        <td className="number-cell forecast-total-col">
                          {FORECAST_NUMBER_FORMATTER.format(rowTotal)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="budget-summary-total-row">
                    <td colSpan={FORECAST_HIERARCHY_COLUMNS.length}>Итого</td>
                    {totalByMonths.map((value, index) => (
                      <td key={`total-month-${index}`} className="number-cell forecast-month-col">
                        {FORECAST_NUMBER_FORMATTER.format(value)}
                      </td>
                    ))}
                    <td className="number-cell forecast-total-col">{FORECAST_NUMBER_FORMATTER.format(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="guide-table-wrap forecast-pivot-wrap">
              <h3 className="forecast-subtitle">Свод лимитов: подразделения × статьи бюджета</h3>
              <table className="guide-table table-compact forecast-pivot-table">
                <thead>
                  <tr>
                    <th>Статья бюджета</th>
                    {limitPivot.departments.map((department) => (
                      <th key={department}>{department}</th>
                    ))}
                    <th className="number-cell forecast-total-col">Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {limitPivot.rows.map((row) => (
                    <tr key={row.budgetItem}>
                      <td>{row.budgetItem}</td>
                      {limitPivot.departments.map((department) => (
                        <td key={`${row.budgetItem}-${department}`} className="number-cell">
                          {FORECAST_NUMBER_FORMATTER.format(row.byDepartment[department] ?? 0)}
                        </td>
                      ))}
                      <td className="number-cell forecast-total-col">{FORECAST_NUMBER_FORMATTER.format(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="budget-summary-total-row">
                    <td>Итого</td>
                    {limitPivot.departments.map((department) => (
                      <td key={`pivot-total-${department}`} className="number-cell">
                        {FORECAST_NUMBER_FORMATTER.format(limitPivot.totalsByDepartment[department] ?? 0)}
                      </td>
                    ))}
                    <td className="number-cell forecast-total-col">{FORECAST_NUMBER_FORMATTER.format(limitPivot.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

interface ForecastMonthPopupPageProps {
  monthIndex: number
  onBack: () => void
}

function ForecastMonthPopupPage({ monthIndex, onBack }: ForecastMonthPopupPageProps) {
  const [rows, setRows] = useState<ForecastSourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [monthlyEdits, setMonthlyEdits] = useState<ForecastMonthlyEdits>({})
  const [monthlyFactEdits, setMonthlyFactEdits] = useState<ForecastMonthlyFactEdits>({})

  const editableMonthIndexes = useMemo(
    () => [monthIndex - 1, monthIndex, monthIndex + 1].filter((index) => index >= 0 && index < 12),
    [monthIndex]
  )

  useEffect(() => {
    setLoading(true)
    setError(null)

    Promise.all([
      fetch('/api/gn/bdr'),
      fetch('/api/gn/forecast-monthly'),
    ])
      .then(async ([bdrResponse, forecastResponse]) => {
        if (!bdrResponse.ok) throw new Error(`HTTP ${bdrResponse.status}`)
        if (!forecastResponse.ok) throw new Error(`HTTP ${forecastResponse.status}`)

        const [bdrRows, forecastPayload] = await Promise.all([
          bdrResponse.json() as Promise<ForecastSourceRow[]>,
          forecastResponse.json() as Promise<{ rows?: ForecastMonthlyApiRow[] }>,
        ])

        const nextMonthlyEdits: ForecastMonthlyEdits = {}
        const nextMonthlyFactEdits: ForecastMonthlyFactEdits = {}
        ;(forecastPayload.rows ?? []).forEach((row) => {
          const key = String(toForecastNumber(row.rowId))
          const values = Array.isArray(row.monthlyValues)
            ? row.monthlyValues.map((value) => toForecastNumber(value))
            : []
          const factValues = Array.isArray(row.monthlyFactValues)
            ? row.monthlyFactValues.map((value) => toForecastNumber(value))
            : []

          nextMonthlyEdits[key] = normalizeMonthlyValues(values)
          nextMonthlyFactEdits[key] = normalizeMonthlyValues(factValues)
        })

        setRows(bdrRows)
        setMonthlyEdits(nextMonthlyEdits)
        setMonthlyFactEdits(nextMonthlyFactEdits)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [monthIndex])

  const forecastRows = useMemo(() => buildForecastRows(rows), [rows])
  const rowSpans = useMemo(() => buildRowSpans(forecastRows), [forecastRows])

  function getDisplayedMonthlyValues(row: ForecastRow): number[] {
    return monthlyEdits[getForecastRowKey(row)] ?? row.monthlyValues
  }

  function getDisplayedMonthlyFactValues(row: ForecastRow): number[] {
    return monthlyFactEdits[getForecastRowKey(row)] ?? new Array<number>(12).fill(0)
  }

  function updateMonthlyValue(row: ForecastRow, targetMonthIndex: number, rawValue: string): void {
    const rowKey = getForecastRowKey(row)
    const parsed = rawValue.trim() === '' ? 0 : toForecastNumber(rawValue)
    setSaveError(null)
    setSaveSuccess(null)

    setMonthlyEdits((prev) => {
      const base = prev[rowKey] ?? row.monthlyValues
      const nextValues = [...base]
      nextValues[targetMonthIndex] = parsed
      return { ...prev, [rowKey]: nextValues }
    })
  }

  function updateMonthlyFactValue(row: ForecastRow, targetMonthIndex: number, rawValue: string): void {
    const rowKey = getForecastRowKey(row)
    const parsed = rawValue.trim() === '' ? 0 : toForecastNumber(rawValue)
    setSaveError(null)
    setSaveSuccess(null)

    setMonthlyFactEdits((prev) => {
      const base = prev[rowKey] ?? new Array<number>(12).fill(0)
      const nextValues = [...base]
      nextValues[targetMonthIndex] = parsed
      return { ...prev, [rowKey]: nextValues }
    })
  }

  async function saveMonthlyForecastEdits(): Promise<void> {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(null)

    try {
      const rowsToSave: ForecastMonthlyApiRow[] = forecastRows.map((row) => ({
        rowId: row.rowId,
        monthlyValues: normalizeMonthlyValues(getDisplayedMonthlyValues(row)),
        monthlyFactValues: normalizeMonthlyValues(getDisplayedMonthlyFactValues(row)),
      }))

      const response = await fetch('/api/gn/forecast-monthly', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rows: rowsToSave }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || `HTTP ${response.status}`)
      }

      setSaveSuccess('Изменения сохранены')
      localStorage.setItem(FORECAST_UPDATED_EVENT_KEY, String(Date.now()))
      localStorage.setItem(BDR_UPDATED_EVENT_KEY, String(Date.now()))
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить прогноз')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="guide forecast-section">
      <div className="guide-section forecast-section-content">
        <div className="limit-details-header">
          <h2>Редактирование месяца: {FORECAST_MONTH_LABELS[monthIndex]}</h2>
          <button type="button" className="page-action-btn page-action-btn--secondary" onClick={onBack}>
            Закрыть
          </button>
        </div>

        <p className="hint">Показаны три месяца: предыдущий, выбранный и следующий.</p>
        {loading && <p className="hint">Загрузка данных...</p>}
        {error && <p className="hint hint--error">Ошибка: {error}</p>}

        {!loading && !error && forecastRows.length > 0 && (
          <div className="guide-table-wrap forecast-table-wrap">
            <table className="guide-table table-compact forecast-table">
              <thead>
                <tr>
                  {FORECAST_HIERARCHY_COLUMNS.map((column) => (
                    <th key={column} rowSpan={2}>{column}</th>
                  ))}
                  {editableMonthIndexes.map((index) => (
                    <th key={`month-group-${index}`} className="number-cell" colSpan={2}>
                      {FORECAST_MONTH_LABELS[index]}
                    </th>
                  ))}
                  <th className="number-cell forecast-total-col" rowSpan={2}>Итого за год</th>
                </tr>
                <tr>
                  {editableMonthIndexes.map((index) => (
                    <>
                      <th key={`month-plan-${index}`} className="number-cell forecast-month-col">План</th>
                      <th key={`month-fact-${index}`} className="number-cell forecast-month-col">Факт</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {forecastRows.map((row, rowIndex) => {
                  const rowKey = getForecastRowKey(row)
                  const displayedMonthlyValues = getDisplayedMonthlyValues(row)
                  const displayedMonthlyFactValues = getDisplayedMonthlyFactValues(row)
                  const rowTotal = displayedMonthlyValues.reduce((sum, value) => sum + value, 0)

                  return (
                    <tr key={rowKey}>
                      {FORECAST_HIERARCHY_COLUMNS.map((column) => {
                        const span = rowSpans[rowIndex]?.[column] ?? 0
                        if (span === 0) return null

                        return (
                          <td key={`${column}-${rowIndex}`} rowSpan={span}>
                            {row[column]}
                          </td>
                        )
                      })}

                      {editableMonthIndexes.map((index) => (
                        <>
                          <td key={`month-popup-${rowIndex}-${index}`} className="number-cell forecast-month-col forecast-month-cell--editable">
                            <input
                              className="forecast-month-input"
                              type="number"
                              step="0.01"
                              value={Number.isFinite(displayedMonthlyValues[index]) ? displayedMonthlyValues[index] : 0}
                              onChange={(event) => updateMonthlyValue(row, index, event.target.value)}
                            />
                          </td>
                          <td key={`month-popup-fact-${rowIndex}-${index}`} className="number-cell forecast-month-col forecast-month-cell--editable">
                            <input
                              className="forecast-month-input"
                              type="number"
                              step="0.01"
                              value={Number.isFinite(displayedMonthlyFactValues[index]) ? displayedMonthlyFactValues[index] : 0}
                              onChange={(event) => updateMonthlyFactValue(row, index, event.target.value)}
                            />
                          </td>
                        </>
                      ))}

                      <td className="number-cell forecast-total-col">{FORECAST_NUMBER_FORMATTER.format(rowTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="budget-actions" style={{ marginTop: '12px' }}>
              <button type="button" className="form-submit-btn" disabled={saving} onClick={() => void saveMonthlyForecastEdits()}>
                Сохранить
              </button>
              <button type="button" className="page-action-btn page-action-btn--secondary" disabled={saving} onClick={onBack}>
                Закрыть
              </button>
            </div>

            {saveSuccess && <p className="hint">{saveSuccess}</p>}
            {saveError && <p className="hint hint--error">Ошибка сохранения: {saveError}</p>}
          </div>
        )}
      </div>
    </section>
  )
}

export default function App() {
  const isAddRowPopup = window.location.hash === '#add-row-window'
  const limitPopupMatch = window.location.hash.match(/^#limit-window-(\d+)$/)
  const limitPopupRowId = limitPopupMatch ? Number(limitPopupMatch[1]) : null
  const isLimitPopup = limitPopupRowId != null && !Number.isNaN(limitPopupRowId)
  const contractPopupMatch = window.location.hash.match(/^#contract-window-(.+)$/)
  const contractPopupName = contractPopupMatch ? decodeURIComponent(contractPopupMatch[1]) : null
  const isContractPopup = contractPopupName != null && contractPopupName !== ''
  const forecastMonthPopupMatch = window.location.hash.match(/^#forecast-month-window-(\d{1,2})$/)
  const forecastMonthIndex = forecastMonthPopupMatch ? Number(forecastMonthPopupMatch[1]) : null
  const isForecastMonthPopup = forecastMonthIndex != null && forecastMonthIndex >= 0 && forecastMonthIndex < 12
  const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash))

  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === '#add-row-window') return
      if (/^#limit-window-\d+$/.test(window.location.hash)) return
      if (/^#contract-window-.+$/.test(window.location.hash)) return
      if (/^#forecast-month-window-\d{1,2}$/.test(window.location.hash)) return
      setPage(pageFromHash(window.location.hash))
    }

    window.addEventListener('hashchange', onHashChange)

    if (!window.location.hash && !isAddRowPopup && !isLimitPopup && !isContractPopup && !isForecastMonthPopup) {
      window.location.hash = '#budget'
    }

    return () => window.removeEventListener('hashchange', onHashChange)
  }, [isAddRowPopup, isLimitPopup, isContractPopup, isForecastMonthPopup])

  function goTo(nextPage: Page): void {
    if (nextPage === 'contracts') {
      window.location.hash = '#contracts'
      return
    }
    if (nextPage === 'invest-program-table') {
      window.location.hash = '#invest-program-table'
      return
    }
    if (nextPage === 'forecasts') {
      window.location.hash = '#forecasts'
      return
    }
    if (nextPage === 'guide') {
      window.location.hash = '#guide'
      return
    }
    window.location.hash = '#budget'
  }

  function openAddRowWindow(): void {
    const popupUrl = `${window.location.pathname}#add-row-window`
    const popup = window.open(
      popupUrl,
      'add-row-window',
      'popup=yes,width=980,height=900,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  function openLimitWindow(rowId: number): void {
    const popupUrl = `${window.location.pathname}#limit-window-${rowId}`
    const popup = window.open(
      popupUrl,
      `limit-window-${rowId}`,
      'popup=yes,width=900,height=760,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  function openContractWindow(contractName: string): void {
    const encodedName = encodeURIComponent(contractName)
    const popupUrl = `${window.location.pathname}#contract-window-${encodedName}`
    const popup = window.open(
      popupUrl,
      `contract-window-${encodedName}`,
      'popup=yes,width=900,height=700,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  if (isAddRowPopup) {
    return (
      <main>
        <AddBudgetRowPage onBack={() => window.close()} showFormOnLoad={true} />
      </main>
    )
  }

  if (isLimitPopup && limitPopupRowId != null) {
    return (
      <main>
        <LimitDetailsPage rowId={limitPopupRowId} onBack={() => window.close()} />
      </main>
    )
  }

  if (isContractPopup && contractPopupName) {
    return (
      <main>
        <ContractDetailsPage contractName={contractPopupName} onBack={() => window.close()} />
      </main>
    )
  }

  if (isForecastMonthPopup && forecastMonthIndex != null) {
    return (
      <main>
        <ForecastMonthPopupPage monthIndex={forecastMonthIndex} onBack={() => window.close()} />
      </main>
    )
  }

  return (
    <main>
      <nav className="app-nav">
        <div className="app-nav-center">
          <a href="#budget" onClick={(event) => { event.preventDefault(); goTo('budget') }}>
            Бюджет
          </a>
          <a href="#forecasts" onClick={(event) => { event.preventDefault(); goTo('forecasts') }}>
            Прогнозы
          </a>
          <a href="#contracts" onClick={(event) => { event.preventDefault(); goTo('contracts') }}>
            Контракты
          </a>
          <a href="#invest-program-table" onClick={(event) => { event.preventDefault(); goTo('invest-program-table') }}>
            Инвестпрограмма
          </a>
        </div>
        <div className="app-nav-guide">
          <a href="#guide" onClick={(event) => { event.preventDefault(); goTo('guide') }}>
            Справочник
          </a>
        </div>
      </nav>

      {page === 'guide' && <Guide />}
      {page === 'budget' && <BudgetTable onAddRow={openAddRowWindow} onOpenLimit={openLimitWindow} onOpenContract={openContractWindow} />}
      {page === 'contracts' && <ContractsPage />}
      {page === 'forecasts' && <Forecasts />}
      {page === 'invest-program-table' && <InvestProgramTablePage />}
    </main>
  )
}
