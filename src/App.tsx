import { useEffect, useMemo, useState } from 'react'
import BudgetTable from './BudgetTable'
import Guide from './Guide'
import AddBudgetRowPage from './AddBudgetRowPage'
import LimitDetailsPage from './LimitDetailsPage'
import ContractDetailsPage from './ContractDetailsPage'
import './styles.css'

type Page = 'budget' | 'guide' | 'forecasts'

function pageFromHash(hash: string): Page {
  if (hash === '#forecasts') return 'forecasts'
  if (hash === '#guide') return 'guide'
  return 'budget'
}

type ForecastSourceRow = Record<string, unknown>

interface ForecastRow {
  'Статья бюджета': string
  Контрагент: string
  Договор: string
  Подразделение: string
  monthlyValues: number[]
  totalLimit: number
}

type ForecastMonthlyEdits = Record<string, number[]>

const FORECAST_HIERARCHY_COLUMNS: Array<keyof Pick<ForecastRow, 'Статья бюджета' | 'Контрагент' | 'Договор' | 'Подразделение'>> = [
  'Статья бюджета',
  'Контрагент',
  'Договор',
  'Подразделение',
]

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
  return `${row['Статья бюджета']}|${row.Контрагент}|${row.Договор}|${row.Подразделение}`
}

function Forecasts() {
  const [rows, setRows] = useState<ForecastSourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monthlyEdits, setMonthlyEdits] = useState<ForecastMonthlyEdits>({})

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetch('/api/gn/bdr')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<ForecastSourceRow[]>
      })
      .then((data) => setRows(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const forecastRows = useMemo(() => {
    const aggregate = new Map<string, ForecastRow>()

    rows.forEach((row) => {
      const budget = toForecastKeyPart(row['Статья бюджета'])
      const contractor = toForecastKeyPart(row['Контрагент'])
      const contract = toForecastKeyPart(row['Договор'])
      const department = toForecastKeyPart(row['Подразделение'])
      const key = [budget, contractor, contract, department].join('||')
      const limit = toForecastNumber(row['Лимит'])

      const existing = aggregate.get(key)
      if (existing) {
        existing.totalLimit += limit
        existing.monthlyValues = distributeByMonths(existing.totalLimit)
      } else {
        aggregate.set(key, {
          'Статья бюджета': budget,
          Контрагент: contractor,
          Договор: contract,
          Подразделение: department,
          monthlyValues: distributeByMonths(limit),
          totalLimit: limit,
        })
      }
    })

    return [...aggregate.values()].sort((a, b) => {
      for (const column of FORECAST_HIERARCHY_COLUMNS) {
        const compare = a[column].localeCompare(b[column], 'ru')
        if (compare !== 0) return compare
      }
      return 0
    })
  }, [rows])

  const rowSpans = useMemo(() => buildRowSpans(forecastRows), [forecastRows])

  function getDisplayedMonthlyValues(row: ForecastRow): number[] {
    return monthlyEdits[getForecastRowKey(row)] ?? row.monthlyValues
  }

  function updateMonthlyValue(row: ForecastRow, monthIndex: number, rawValue: string): void {
    const rowKey = getForecastRowKey(row)
    const parsed = rawValue.trim() === '' ? 0 : toForecastNumber(rawValue)

    setMonthlyEdits((prev) => {
      const base = prev[rowKey] ?? row.monthlyValues
      const nextValues = [...base]
      nextValues[monthIndex] = parsed
      return { ...prev, [rowKey]: nextValues }
    })
  }

  const totalByMonths = useMemo(() => {
    const totals = new Array<number>(12).fill(0)
    forecastRows.forEach((row) => {
      getDisplayedMonthlyValues(row).forEach((value, index) => {
        totals[index] += value
      })
    })
    return totals
  }, [forecastRows, monthlyEdits])

  const grandTotal = useMemo(
    () =>
      forecastRows.reduce(
        (sum, row) => sum + getDisplayedMonthlyValues(row).reduce((acc, value) => acc + value, 0),
        0
      ),
    [forecastRows, monthlyEdits]
  )

  const limitPivot = useMemo(() => {
    const departmentsSet = new Set<string>()
    const byBudget = new Map<string, Map<string, number>>()

    forecastRows.forEach((row) => {
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
  }, [forecastRows, monthlyEdits])

  return (
    <section className="guide forecast-section">
      <div className="guide-section forecast-section-content">
        <h2>Прогнозы расходов лимита по месяцам</h2>
        {loading && <p className="hint">Загрузка данных...</p>}
        {error && <p className="hint hint--error">Ошибка: {error}</p>}
        {!loading && !error && forecastRows.length === 0 && <p className="hint">Нет данных для прогноза.</p>}

        {!loading && !error && forecastRows.length > 0 && (
          <>
            <div className="guide-table-wrap forecast-table-wrap">
              <table className="guide-table table-compact forecast-table">
                <thead>
                  <tr>
                    {FORECAST_HIERARCHY_COLUMNS.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                    {FORECAST_MONTH_LABELS.map((month) => (
                      <th key={month} className="number-cell forecast-month-col">{month}</th>
                    ))}
                    <th className="number-cell forecast-total-col">Итого за год</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastRows.map((row, rowIndex) => {
                    const rowKey = getForecastRowKey(row)
                    const displayedMonthlyValues = getDisplayedMonthlyValues(row)
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

                      {displayedMonthlyValues.map((value, monthIndex) => (
                        <td key={`month-${rowIndex}-${monthIndex}`} className="number-cell forecast-month-col">
                          <input
                            className="forecast-month-input"
                            type="number"
                            step="0.01"
                            value={Number.isFinite(value) ? value : 0}
                            onChange={(event) => updateMonthlyValue(row, monthIndex, event.target.value)}
                          />
                        </td>
                      ))}

                      <td className="number-cell forecast-total-col">{FORECAST_NUMBER_FORMATTER.format(rowTotal)}</td>
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

export default function App() {
  const isAddRowPopup = window.location.hash === '#add-row-window'
  const limitPopupMatch = window.location.hash.match(/^#limit-window-(\d+)$/)
  const limitPopupRowId = limitPopupMatch ? Number(limitPopupMatch[1]) : null
  const isLimitPopup = limitPopupRowId != null && !Number.isNaN(limitPopupRowId)
  const contractPopupMatch = window.location.hash.match(/^#contract-window-(.+)$/)
  const contractPopupName = contractPopupMatch ? decodeURIComponent(contractPopupMatch[1]) : null
  const isContractPopup = contractPopupName != null && contractPopupName !== ''
  const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash))

  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === '#add-row-window') return
      if (/^#limit-window-\d+$/.test(window.location.hash)) return
      if (/^#contract-window-.+$/.test(window.location.hash)) return
      setPage(pageFromHash(window.location.hash))
    }
    window.addEventListener('hashchange', onHashChange)

    if (!window.location.hash && !isAddRowPopup && !isLimitPopup && !isContractPopup) {
      window.location.hash = '#budget'
    }

    return () => window.removeEventListener('hashchange', onHashChange)
  }, [isAddRowPopup, isLimitPopup, isContractPopup])

  function goTo(nextPage: Page): void {
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

  if (isContractPopup && contractPopupName != null) {
    return (
      <main>
        <ContractDetailsPage contractName={contractPopupName} onBack={() => window.close()} />
      </main>
    )
  }

  return (
    <main>
      <nav className="app-nav">
        <a
          href="#guide"
          onClick={() => goTo('guide')}
        >
          Справочник
        </a>
        <a
          href="#budget"
          onClick={() => goTo('budget')}
        >
          Бюджет
        </a>
        <a
          href="#forecasts"
          onClick={() => goTo('forecasts')}
        >
          Прогнозы
        </a>
      </nav>

      {page === 'guide' && <Guide />}
      {page === 'budget' && <BudgetTable onAddRow={openAddRowWindow} onOpenLimit={openLimitWindow} onOpenContract={openContractWindow} />}
      {page === 'forecasts' && <Forecasts />}
    </main>
  )
}
