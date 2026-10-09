import { useEffect, useState } from 'react'
import { formatHttpError, formatErrorMessage } from '../utils/forecastUtils'

const PURCHASE_COLUMNS = [
  'Подразделение', 'Тип', 'Наименование ТКО', 'Вендор ТКО', 'Количество', 'Примечание', 'Статус закупки', 'Платеж ТР без НДС',
] as const
const SORTABLE_COLUMNS = [...PURCHASE_COLUMNS, 'Поставщик', 'Огрузочный реквизит', 'оплата'] as const

const PURCHASE_YEAR = 2026

type LookupOption = { value: string; label: string }
type Row = Record<string, unknown>
type SortColumn = typeof SORTABLE_COLUMNS[number]
type SortDirection = 'asc' | 'desc'
const PURCHASE_STATUS_OPTIONS = ['план', 'согласован', 'в закупе', 'поставка', 'поставленно'] as const
const NUMERIC_COLUMNS = new Set(['Количество', 'Платеж ТР без НДС'])
const PAYMENT_TOTAL_FORMATTER = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const COMPACT_HIDDEN_COLUMNS = new Set([
  'Тип',
  'Примечание',
  'Поставщик',
  'Огрузочный реквизит',
  'оплата',
])

type PurchaseStateTableProps = {
  title: string
  costItem: string
  contractorOptions: LookupOption[]
  ogruzOptions: LookupOption[]
  loadingLookups: boolean
}

function parseNumericValue(value: unknown): number {
  const normalized = String(value ?? '').replace(/\s+/g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

// Свёрнутая по умолчанию таблица «Состояние закупок …», данные грузятся лениво
// (только при первом раскрытии) из раздела «Импортозамещение» по Году и статье затрат.
export default function PurchaseStateTable({
  title,
  costItem,
  contractorOptions,
  ogruzOptions,
  loadingLookups,
}: PurchaseStateTableProps) {
  const [expanded, setExpanded] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editingRowId, setEditingRowId] = useState<number | null>(null)
  const [editingDraft, setEditingDraft] = useState<Row | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [compact, setCompact] = useState(true)
  const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection }>({
    column: 'Подразделение',
    direction: 'asc',
  })

  useEffect(() => {
    if (!expanded || hasLoaded) return

    async function loadPurchaseRows(): Promise<void> {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/import-substitution', { cache: 'no-store' })
        if (!response.ok) throw new Error(formatHttpError(response.status))
        const data = (await response.json()) as Row[]

        setRows(data.filter((row) => (
          Number(row['Год']) === PURCHASE_YEAR
          && row['Статья затрат ТКО'] === costItem
          && String(row['Наименование ТКО'] ?? '').trim().toLowerCase() !== 'любой'
        )))
        setHasLoaded(true)
      } catch (err) {
        setError(formatErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }

    void loadPurchaseRows()
  }, [expanded, hasLoaded, costItem])

  function startEdit(row: Row): void {
    setEditingRowId(Number(row['GN_import_substitution_id']))
    setEditingDraft({ ...row })
    setSaveError(null)
  }

  function cancelEdit(): void {
    setEditingRowId(null)
    setEditingDraft(null)
    setSaveError(null)
  }

  function updateDraft(column: string, value: string): void {
    setEditingDraft((prev) => (prev ? { ...prev, [column]: value } : prev))
  }

  async function saveEdit(): Promise<void> {
    if (editingRowId == null || editingDraft == null) return
    setSaving(true)
    setSaveError(null)

    try {
      const response = await fetch(`/api/import-substitution/${editingRowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingDraft),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || formatHttpError(response.status))
      }

      const updatedRow = (await response.json()) as Row
      setRows((prev) => prev.map((row) => (
        Number(row['GN_import_substitution_id']) === editingRowId ? { ...row, ...editingDraft, ...updatedRow } : row
      )))
      cancelEdit()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить изменения')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRow(rowId: number): Promise<void> {
    if (!window.confirm('Удалить эту строку?')) return
    setSaving(true)
    setSaveError(null)

    try {
      const response = await fetch(`/api/import-substitution/${rowId}`, { method: 'DELETE' })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || formatHttpError(response.status))
      }
      setRows((prev) => prev.filter((row) => Number(row['GN_import_substitution_id']) !== rowId))
      if (editingRowId === rowId) cancelEdit()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось удалить строку')
    } finally {
      setSaving(false)
    }
  }

  function toggleSort(column: SortColumn): void {
    setSort((previous) => previous.column === column
      ? { column, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
      : { column, direction: 'asc' })
  }

  const sortedRows = [...rows].sort((left, right) => {
    const leftValue = String(left[sort.column] ?? '')
    const rightValue = String(right[sort.column] ?? '')
    const leftNumber = Number(leftValue.replace(',', '.'))
    const rightNumber = Number(rightValue.replace(',', '.'))
    const comparison = leftValue.trim() !== '' && rightValue.trim() !== ''
      && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
      ? leftNumber - rightNumber
      : leftValue.localeCompare(rightValue, 'ru', { numeric: true, sensitivity: 'base' })
    return sort.direction === 'asc' ? comparison : -comparison
  })
  const paymentTotal = rows.reduce(
    (total, row) => total + parseNumericValue(row['Платеж ТР без НДС']),
    0
  )
  const visiblePurchaseColumns = compact
    ? PURCHASE_COLUMNS.filter((column) => !COMPACT_HIDDEN_COLUMNS.has(column))
    : PURCHASE_COLUMNS
  const visibleAdditionalColumns = compact
    ? SORTABLE_COLUMNS.filter((column) => !COMPACT_HIDDEN_COLUMNS.has(column) && !PURCHASE_COLUMNS.includes(column))
    : SORTABLE_COLUMNS.filter((column) => !PURCHASE_COLUMNS.includes(column))

  return (
    <div className="guide-section">
      <h2>
        <button
          type="button"
          className="invest-program-section-toggle page-text-link"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          {title}
        </button>
      </h2>

      {expanded && (
        <>
          {loading && <p className="hint">Загрузка данных...</p>}
          {error && <p className="hint hint--error">Ошибка: {error}</p>}
          {saveError && <p className="hint hint--error">Ошибка: {saveError}</p>}

          {!loading && !error && (
            <>
              <label className="form-checkbox purchase-compact-toggle">
                <input
                  type="checkbox"
                  checked={compact}
                  onChange={(event) => setCompact(event.target.checked)}
                />
                Кратко
              </label>
              <div className="guide-table-wrap invest-program-table-wrap--narrow">
              <table className="guide-table table-compact">
                <thead>
                  <tr>
                    <th>№</th>
                    {[...visiblePurchaseColumns, ...visibleAdditionalColumns].map((column) => (
                      <th key={column}>
                        <button
                          type="button"
                          className="invest-program-row-action-button invest-program-row-action-button--secondary import-substitution-sort-button"
                          onClick={() => toggleSort(column)}
                        >
                          {column === 'Статус закупки' ? 'СТАТУС' : column}
                          {sort.column === column && (sort.direction === 'asc' ? ' ▲' : ' ▼')}
                        </button>
                        {column === 'Платеж ТР без НДС' && (
                          <span className="purchase-column-total">
                            Итого: {PAYMENT_TOTAL_FORMATTER.format(paymentTotal)}
                          </span>
                        )}
                      </th>
                    ))}
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, rowIndex) => {
                    const rowId = Number(row['GN_import_substitution_id'])
                    const isEditingRow = editingRowId === rowId && editingDraft != null

                    return (
                      <tr key={`purchase-row-${rowId}`}>
                        <td className="invest-program-row-number">{rowIndex + 1}</td>
                        {visiblePurchaseColumns.map((column) => (
                          <td key={`${column}-${rowId}`}>
                            {isEditingRow ? (
                              column === 'Статус закупки' ? (
                                <select
                                  className="invest-program-field"
                                  value={String(editingDraft[column] ?? 'план')}
                                  onChange={(event) => updateDraft(column, event.target.value)}
                                >
                                  {PURCHASE_STATUS_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  className="invest-program-field"
                                  type={NUMERIC_COLUMNS.has(column) ? 'number' : 'text'}
                                  step={NUMERIC_COLUMNS.has(column) ? '0.01' : undefined}
                                  value={String(editingDraft[column] ?? '')}
                                  onChange={(event) => updateDraft(column, event.target.value)}
                                />
                              )
                            ) : (
                              <span className="invest-program-cell-text">
                                {String(row[column] ?? (column === 'Статус закупки' ? 'план' : ''))}
                              </span>
                            )}
                          </td>
                        ))}
                        {!compact && <td>
                          {isEditingRow ? (
                            <select
                              className="invest-program-field"
                              value={String(editingDraft['Поставщик'] ?? '')}
                              onChange={(event) => updateDraft('Поставщик', event.target.value)}
                              disabled={loadingLookups}
                            >
                              <option value="">-</option>
                              {contractorOptions.map((option) => (
                                <option key={option.value} value={option.label}>{option.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="invest-program-cell-text">{String(row['Поставщик'] ?? '')}</span>
                          )}
                        </td>}
                        {!compact && <td>
                          {isEditingRow ? (
                            <select
                              className="invest-program-field"
                              value={String(editingDraft['Огрузочный реквизит'] ?? '')}
                              onChange={(event) => updateDraft('Огрузочный реквизит', event.target.value)}
                              disabled={loadingLookups}
                            >
                              <option value="">-</option>
                              {ogruzOptions.map((option) => (
                                <option key={option.value} value={option.label}>{option.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="invest-program-cell-text">{String(row['Огрузочный реквизит'] ?? '')}</span>
                          )}
                        </td>}
                        {!compact && <td>
                          {isEditingRow ? (
                            <input
                              className="invest-program-field"
                              value={String(editingDraft['оплата'] ?? '')}
                              onChange={(event) => updateDraft('оплата', event.target.value)}
                            />
                          ) : (
                            <span className="invest-program-cell-text">{String(row['оплата'] ?? '')}</span>
                          )}
                        </td>}
                        <td className="invest-program-actions-cell">
                          {isEditingRow ? (
                            <>
                              <button type="button" className="invest-program-row-action-button" onClick={() => void saveEdit()} disabled={saving}>
                                СОХР
                              </button>
                              <button type="button" className="invest-program-row-action-button invest-program-row-action-button--secondary" onClick={cancelEdit} disabled={saving}>
                                ОТМ
                              </button>
                              <button type="button" className="invest-program-row-action-button invest-program-row-action-button--secondary" onClick={() => void deleteRow(rowId)} disabled={saving}>
                                УДАЛИТЬ
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="invest-program-row-action-button" onClick={() => startEdit(row)}>
                                ИЗМ
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
