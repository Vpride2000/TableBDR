import { useRef, useState, useMemo, useEffect } from 'react'
import * as XLSX from 'xlsx'
import BudgetTable from './BudgetTable'
import Guide from './Guide'
import AddBudgetRowPage from './AddBudgetRowPage'
import LimitDetailsPage from './LimitDetailsPage'
import ContractDetailsPage from './ContractDetailsPage'
import ContractsPage from './ContractsPage'
import InvestProgramTablePage from './InvestProgramTablePage'
import { useForecast } from './hooks/useForecast'
import { Page, FORECAST_HIERARCHY_COLUMNS, FORECAST_MONTH_LABELS, FORECAST_NUMBER_FORMATTER, FORECAST_UPDATED_EVENT_KEY, BDR_UPDATED_EVENT_KEY, ForecastRow, ForecastMonthlyApiRow, ForecastMonthlyEdits, ForecastMonthlyFactEdits } from './types/forecast'
import { pageFromHash, toForecastNumber, buildForecastRows, normalizeMonthlyValues, getForecastRowKey, toForecastKeyPart, buildRowSpans } from './utils/forecastUtils'
import './styles.css'

/*
  Основная точка входа клиентской части приложения.
  Отвечает за маршрутизацию между страницами по хэшу,
  отображение попапов и навигацию между разделами.
*/

interface ForecastsProps {
  onOpenLimit: (rowId: number) => void
  onOpenContract: (contractName: string) => void
}

// Основной компонент страницы прогнозов.
// Отвечает за отрисовку таблицы прогноза, фильтры по иерархии и
// действия по открытию окна редактирования лимита или просмотра договора.
function Forecasts({ onOpenLimit, onOpenContract }: ForecastsProps) {
  const {
    loading,
    error,
    forecastRows,
    filteredForecastRows,
    filteredRowSpans,
    getDisplayedMonthlyValues,
    getDisplayedMonthlyFactValues,
    getForecastCellStatusClass,
    setForecastFilter,
    openForecastMonthPopup,
    totalByMonths,
    grandTotal,
    forecastFilters,
  } = useForecast()

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
                    <th className="number-cell forecast-total-col">Итого за год</th>
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
                  </tr>
                  <tr className="budget-summary-total-row">
                    {FORECAST_HIERARCHY_COLUMNS.map((column) => (
                      <th key={`total-header-${column}`} />
                    ))}
                    <th className="number-cell forecast-total-col">{FORECAST_NUMBER_FORMATTER.format(grandTotal)}</th>
                    {totalByMonths.map((value, index) => (
                      <th key={`total-header-month-${index}`} className="number-cell forecast-month-col">
                        {FORECAST_NUMBER_FORMATTER.format(value)}
                      </th>
                    ))}
                  </tr>
                  <tr className="filter-row">
                    {FORECAST_HIERARCHY_COLUMNS.map((column) => (
                      <th key={`forecast-filter-${column}`}>
                        <input
                          className="column-filter-input"
                          type="text"
                          value={forecastFilters[column]}
                          onChange={(event) => setForecastFilter(column, event.target.value)}
                          placeholder="Фильтр..."
                        />
                      </th>
                    ))}
                    <th />
                    {FORECAST_MONTH_LABELS.map((month) => (
                      <th key={`forecast-filter-${month}`} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredForecastRows.map((row, rowIndex) => {
                    const rowKey = getForecastRowKey(row)
                    const displayedMonthlyValues = getDisplayedMonthlyValues(row)
                    const displayedMonthlyFactValues = getDisplayedMonthlyFactValues(row)
                    const rowTotal = displayedMonthlyValues.reduce((sum: number, value: number) => sum + value, 0)

                    return (
                      <tr key={rowKey}>
                        {FORECAST_HIERARCHY_COLUMNS.map((column) => {
                          const span = filteredRowSpans[rowIndex]?.[column] ?? 0
                          if (span === 0) return null

                          const cellContent =
                            column === 'Договор' && row[column].trim() !== '' ? (
                              <button
                                type="button"
                                className="contract-cell-button"
                                onClick={() => onOpenContract(row[column])}
                              >
                                {row[column]}
                              </button>
                            ) : (
                              row[column]
                            )

                          return (
                            <td key={`${column}-${rowIndex}`} rowSpan={span}>
                              {cellContent}
                            </td>
                          )
                        })}

                        <td className="number-cell forecast-total-col">
                          <button
                            type="button"
                            className="limit-cell-button"
                            onClick={() => onOpenLimit(row.rowId)}
                          >
                            {FORECAST_NUMBER_FORMATTER.format(rowTotal)}
                          </button>
                        </td>

                        {displayedMonthlyValues.map((value, monthIndex) => (
                          <td
                            key={`month-${rowIndex}-${monthIndex}`}
                            className={`number-cell forecast-month-col forecast-month-cell--locked ${getForecastCellStatusClass(value, displayedMonthlyFactValues[monthIndex] ?? 0)}`}
                            title={`План: ${FORECAST_NUMBER_FORMATTER.format(value)}; Факт: ${FORECAST_NUMBER_FORMATTER.format(displayedMonthlyFactValues[monthIndex] ?? 0)}`}
                          >
                            <span className="forecast-month-value">{FORECAST_NUMBER_FORMATTER.format(value)}</span>
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
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

// Попап для редактирования выбранного месяца.
// Отображает три месяца (предыдущий, текущий, следующий), позволяет вводить план и факт.
function ForecastMonthPopupPage({ monthIndex, onBack }: ForecastMonthPopupPageProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [monthlyEdits, setMonthlyEdits] = useState<ForecastMonthlyEdits>({})
  const [monthlyFactEdits, setMonthlyFactEdits] = useState<ForecastMonthlyFactEdits>({})
  const [editingRowKeys, setEditingRowKeys] = useState<Set<string>>(new Set())
  const importFileInputRef = useRef<HTMLInputElement | null>(null)

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
          bdrResponse.json() as Promise<Record<string, unknown>[]>,
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

  function updateMonthlyValue(row: ForecastRow, targetMonthIndex: number, rawValue: string): void {
    const rowKey = getForecastRowKey(row)
    const parsed = rawValue.trim() === '' ? 0 : toForecastNumber(rawValue)
    setSaveError(null)
    setSaveSuccess(null)

    setMonthlyEdits((prev: Record<string, number[]>) => {
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

    setMonthlyFactEdits((prev: Record<string, number[]>) => {
      const base = prev[rowKey] ?? new Array<number>(12).fill(0)
      const nextValues = [...base]
      nextValues[targetMonthIndex] = parsed
      return { ...prev, [rowKey]: nextValues }
    })
  }

  // Сохраняет текущие изменения прогноза на сервер.
  // Собирает все строки прогноза, нормализует значения и отправляет PUT-запрос.
  async function saveMonthlyForecastEdits(): Promise<void> {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(null)

    try {
      const getDisplayedMonthlyValues = (row: ForecastRow): number[] => {
        return monthlyEdits[getForecastRowKey(row)] ?? row.monthlyValues
      }

      const getDisplayedMonthlyFactValues = (row: ForecastRow): number[] => {
        return monthlyFactEdits[getForecastRowKey(row)] ?? new Array<number>(12).fill(0)
      }

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

  // Формирует XLSX-файл для текущего выбранного месяца и загружает его.
  function exportMonthTableToXlsx(): void {
    const getDisplayedMonthlyValues = (row: ForecastRow): number[] => {
      return monthlyEdits[getForecastRowKey(row)] ?? row.monthlyValues
    }

    const getDisplayedMonthlyFactValues = (row: ForecastRow): number[] => {
      return monthlyFactEdits[getForecastRowKey(row)] ?? new Array<number>(12).fill(0)
    }

    const monthColumns = editableMonthIndexes.flatMap((index) => {
      const monthLabel = FORECAST_MONTH_LABELS[index]
      return [`${monthLabel} План`, `${monthLabel} Факт`]
    })

    const header = [...FORECAST_HIERARCHY_COLUMNS, ...monthColumns, 'Итого за год']

    const exportRows = forecastRows.map((row) => {
      const displayedMonthlyValues = getDisplayedMonthlyValues(row)
      const displayedMonthlyFactValues = getDisplayedMonthlyFactValues(row)
      const rowTotal = displayedMonthlyValues.reduce((sum: number, value: number) => sum + value, 0)

      const rowData: Record<string, string | number> = {
        'Статья бюджета': row['Статья бюджета'],
        Контрагент: row.Контрагент,
        Договор: row.Договор,
        Подразделение: row.Подразделение,
      }

      editableMonthIndexes.forEach((index) => {
        const monthLabel = FORECAST_MONTH_LABELS[index]
        rowData[`${monthLabel} План`] = Number((displayedMonthlyValues[index] ?? 0).toFixed(2))
        rowData[`${monthLabel} Факт`] = Number((displayedMonthlyFactValues[index] ?? 0).toFixed(2))
      })

      rowData['Итого за год'] = Number(rowTotal.toFixed(2))
      return rowData
    })

    const totalsRow: Record<string, string | number> = {
      'Статья бюджета': 'Итого',
      Контрагент: '',
      Договор: '',
      Подразделение: '',
    }

    editableMonthIndexes.forEach((index) => {
      const monthLabel = FORECAST_MONTH_LABELS[index]
      const monthPlanTotal = forecastRows.reduce(
        (sum, row) => sum + (getDisplayedMonthlyValues(row)[index] ?? 0),
        0
      )
      const monthFactTotal = forecastRows.reduce(
        (sum, row) => sum + (getDisplayedMonthlyFactValues(row)[index] ?? 0),
        0
      )

      totalsRow[`${monthLabel} План`] = Number(monthPlanTotal.toFixed(2))
      totalsRow[`${monthLabel} Факт`] = Number(monthFactTotal.toFixed(2))
    })

    totalsRow['Итого за год'] = Number(
      forecastRows
        .reduce(
          (sum, row) => sum + getDisplayedMonthlyValues(row).reduce((innerSum, value) => innerSum + value, 0),
          0
        )
        .toFixed(2)
    )

    exportRows.push(totalsRow)

    const worksheet = XLSX.utils.json_to_sheet(exportRows, { header })

    const columnWidths = header.map((columnName) => {
      const maxValueLength = exportRows.reduce((maxLength, row) => {
        const cellValue = row[columnName]
        const nextLength = String(cellValue ?? '').length
        return Math.max(maxLength, nextLength)
      }, columnName.length)

      return { wch: Math.min(Math.max(maxValueLength + 2, 12), 40) }
    })
    worksheet['!cols'] = columnWidths

    const numericColumnIndexes = header
      .map((columnName, index) => ({ columnName, index }))
      .filter(({ columnName }) => columnName.endsWith('План') || columnName.endsWith('Факт') || columnName === 'Итого за год')
      .map(({ index }) => index)

    for (let rowIndex = 2; rowIndex <= exportRows.length + 1; rowIndex += 1) {
      numericColumnIndexes.forEach((columnIndex) => {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex - 1, c: columnIndex })
        const cell = worksheet[cellAddress]
        if (cell && typeof cell.v === 'number') {
          cell.z = '#,##0.00'
        }
      })
    }

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Прогноз')

    const dateSuffix = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `Редактирование-месяца-${FORECAST_MONTH_LABELS[monthIndex]}-${dateSuffix}.xlsx`)
  }

  // Открывает скрытый input для загрузки XLSX-файла.
  function openImportFileDialog(): void {
    importFileInputRef.current?.click()
  }

  // Импортирует данные из XLSX-файла, сопоставляет строки с текущим прогнозом
  // и обновляет локальные редактируемые значения.
  async function importMonthTableFromXlsx(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    try {
      setSaveError(null)
      setSaveSuccess(null)

      const monthColumns = editableMonthIndexes.flatMap((index) => {
        const monthLabel = FORECAST_MONTH_LABELS[index]
        return [`${monthLabel} План`, `${monthLabel} Факт`]
      })
      const requiredColumns = [...FORECAST_HIERARCHY_COLUMNS, ...monthColumns, 'Итого за год']

      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      if (!firstSheetName) {
        throw new Error('Файл XLSX пустой')
      }

      const worksheet = workbook.Sheets[firstSheetName]
      const importedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' })

      if (importedRows.length === 0) {
        throw new Error('В файле нет строк для импорта')
      }

      const firstRow = importedRows[0]
      const missingColumns = requiredColumns.filter((column) => !(column in firstRow))
      if (missingColumns.length > 0) {
        throw new Error(`В файле отсутствуют обязательные колонки: ${missingColumns.join(', ')}`)
      }

      const importedByHierarchy = new Map<string, Record<string, unknown>>()
      importedRows.forEach((row) => {
        const budgetItem = toForecastKeyPart(row['Статья бюджета'])
        if (budgetItem === 'Итого') return

        const hierarchyKey = FORECAST_HIERARCHY_COLUMNS
          .map((column) => toForecastKeyPart(row[column]))
          .join('||')

        importedByHierarchy.set(hierarchyKey, row)
      })

      let updatedRowsCount = 0

      setMonthlyEdits((prev: Record<string, number[]>) => {
        const next = { ...prev }

        forecastRows.forEach((row) => {
          const hierarchyKey = FORECAST_HIERARCHY_COLUMNS
            .map((column) => toForecastKeyPart(row[column]))
            .join('||')
          const importedRow = importedByHierarchy.get(hierarchyKey)
          if (!importedRow) return

          const rowKey = getForecastRowKey(row)
          const baseValues = [...(next[rowKey] ?? row.monthlyValues)]

          editableMonthIndexes.forEach((index) => {
            const monthLabel = FORECAST_MONTH_LABELS[index]
            baseValues[index] = toForecastNumber(importedRow[`${monthLabel} План`])
          })

          next[rowKey] = baseValues
          updatedRowsCount += 1
        })

        return next
      })

      setMonthlyFactEdits((prev: Record<string, number[]>) => {
        const next = { ...prev }

        forecastRows.forEach((row) => {
          const hierarchyKey = FORECAST_HIERARCHY_COLUMNS
            .map((column) => toForecastKeyPart(row[column]))
            .join('||')
          const importedRow = importedByHierarchy.get(hierarchyKey)
          if (!importedRow) return

          const rowKey = getForecastRowKey(row)
          const baseValues = [...(next[rowKey] ?? new Array<number>(12).fill(0))]

          editableMonthIndexes.forEach((index) => {
            const monthLabel = FORECAST_MONTH_LABELS[index]
            baseValues[index] = toForecastNumber(importedRow[`${monthLabel} Факт`])
          })

          next[rowKey] = baseValues
        })

        return next
      })

      if (updatedRowsCount === 0) {
        throw new Error('Совпадений строк для импорта не найдено')
      }

      setSaveSuccess(`Данные загружены из XLSX: ${updatedRowsCount} строк`) 
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось загрузить XLSX')
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
            <div className="budget-actions" style={{ marginBottom: '12px' }}>
              <input
                ref={importFileInputRef}
                type="file"
                accept=".xlsx"
                style={{ display: 'none' }}
                onChange={(event) => {
                  void importMonthTableFromXlsx(event)
                }}
              />
              <button
                type="button"
                className="page-action-btn page-action-btn--secondary"
                onClick={openImportFileDialog}
                disabled={saving}
              >
                загрузить из xlsx
              </button>
              <button
                type="button"
                className="page-action-btn"
                onClick={exportMonthTableToXlsx}
                disabled={saving}
              >
                выгрузить в xlsx
              </button>
            </div>

            <table className="guide-table table-compact forecast-table">
              <thead>
                <tr>
                  {FORECAST_HIERARCHY_COLUMNS.map((column) => (
                    <th key={column} rowSpan={2}>{column}</th>
                  ))}
                  <th className="number-cell forecast-total-col" rowSpan={2}>Итого за год</th>
                  {editableMonthIndexes.map((index) => (
                    <th key={`month-group-${index}`} className="number-cell" colSpan={2}>
                      {FORECAST_MONTH_LABELS[index]}
                    </th>
                  ))}
                  <th rowSpan={2}>Действия</th>
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
                  const isEditing = editingRowKeys.has(rowKey)
                  const displayedMonthlyValues = monthlyEdits[rowKey] ?? row.monthlyValues
                  const displayedMonthlyFactValues = monthlyFactEdits[rowKey] ?? new Array<number>(12).fill(0)
                  const rowTotal = displayedMonthlyValues.reduce((sum: number, value: number) => sum + value, 0)

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

                      <td className="number-cell forecast-total-col">{FORECAST_NUMBER_FORMATTER.format(rowTotal)}</td>

                      {editableMonthIndexes.map((index) => (
                        <>
                          <td key={`month-popup-${rowIndex}-${index}`} className="number-cell forecast-month-col forecast-month-cell--editable">
                            {isEditing ? (
                              <input
                                className="forecast-month-input"
                                type="number"
                                step="0.01"
                                value={Number.isFinite(displayedMonthlyValues[index]) ? displayedMonthlyValues[index] : 0}
                                onChange={(event) => updateMonthlyValue(row, index, event.target.value)}
                              />
                            ) : (
                              FORECAST_NUMBER_FORMATTER.format(displayedMonthlyValues[index] ?? 0)
                            )}
                          </td>
                          <td key={`month-popup-fact-${rowIndex}-${index}`} className="number-cell forecast-month-col forecast-month-cell--editable">
                            {isEditing ? (
                              <input
                                className="forecast-month-input"
                                type="number"
                                step="0.01"
                                value={Number.isFinite(displayedMonthlyFactValues[index]) ? displayedMonthlyFactValues[index] : 0}
                                onChange={(event) => updateMonthlyFactValue(row, index, event.target.value)}
                              />
                            ) : (
                              FORECAST_NUMBER_FORMATTER.format(displayedMonthlyFactValues[index] ?? 0)
                            )}
                          </td>
                        </>
                      ))}
                      <td>
                        <button
                          type="button"
                          className="invest-program-row-action-button"
                          disabled={saving}
                          onClick={() =>
                            setEditingRowKeys((prev) => {
                              const next = new Set(prev)
                              if (next.has(rowKey)) {
                                next.delete(rowKey)
                              } else {
                                next.add(rowKey)
                              }
                              return next
                            })
                          }
                        >
                          {isEditing ? 'ОТМ' : 'ИЗМ'}
                        </button>
                      </td>
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

  // Переключает активную страницу приложения, обновляя хэш URL.
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

  // Открывает отдельное окно для создания новой строки бюджета.
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

  // Открывает окно детальной страницы расчета лимита для выбранной строки.
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

  // Открывает окно просмотра деталей по договору, передавая его имя через хэш.
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
      {page === 'forecasts' && <Forecasts onOpenLimit={openLimitWindow} onOpenContract={openContractWindow} />}
      {page === 'invest-program-table' && <InvestProgramTablePage />}
    </main>
  )
}
