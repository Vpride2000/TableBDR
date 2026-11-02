import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { formatHttpError } from './utils/httpUtils'

type Lookup = { id: number; label: string; personalAccount?: string }
type PrimaryDocument = {
  id: number
  departmentId: number | null
  department: string | null
  objectIds: number[]
  objects: Lookup[]
  budgetItemIds: number[]
  budgetItems: Lookup[]
  contractId: number | null
  contract: string | null
  personalAccount: string | null
  amountWithVat: number
  details: string
  edoArrivalDate: string | null
  sedLaunchDate: string | null
  note: string
}
type Draft = {
  departmentId: string
  objectIds: string[]
  budgetItemIds: string[]
  contractId: string
  personalAccount: string
  amountWithVat: string
  details: string
  edoArrivalDate: string
  sedLaunchDate: string
  note: string
}
type ColumnKey = 'department' | 'objects' | 'budgetItems' | 'contract' | 'personalAccount' | 'amountWithVat' | 'details' | 'edoArrivalDate' | 'sedLaunchDate' | 'note'
type Column = { key: ColumnKey; label: string }

const COLUMNS: Column[] = [
  { key: 'department', label: 'Подразделение' },
  { key: 'objects', label: 'Объект' },
  { key: 'budgetItems', label: 'Статьи бюджета' },
  { key: 'contract', label: 'Договор' },
  { key: 'personalAccount', label: 'Лицевой счет' },
  { key: 'amountWithVat', label: 'Сумма с НДС' },
  { key: 'details', label: 'Детализация' },
  { key: 'edoArrivalDate', label: 'Дата прихода в ЭДО' },
  { key: 'sedLaunchDate', label: 'Дата запуска в СЭД' },
  { key: 'note', label: 'Примечание' },
]
const WIDTHS_STORAGE_KEY = 'primary-table-column-widths'
const EMPTY_DRAFT: Draft = {
  departmentId: '',
  objectIds: [],
  budgetItemIds: [],
  contractId: '',
  personalAccount: '',
  amountWithVat: '0',
  details: '',
  edoArrivalDate: '',
  sedLaunchDate: '',
  note: '',
}

function readWidths(): Partial<Record<ColumnKey, number>> {
  try {
    const stored = localStorage.getItem(WIDTHS_STORAGE_KEY)
    if (!stored) return {}
    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => (
      typeof value === 'number' && Number.isFinite(value) && value >= 70
    ))) as Partial<Record<ColumnKey, number>>
  } catch {
    return {}
  }
}

function labelList(values: Lookup[]): string {
  return values.map(({ label }) => label).join('; ')
}

function personalAccountOptions(value: string | undefined): string[] {
  return [...new Set((value ?? '').split(/\r?\n/).map((account) => account.trim()).filter(Boolean))]
}

function displayDate(value: string | null): string {
  if (!value) return ''
  const date = value.slice(0, 10)
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : date
}

export default function PrimaryPage(): React.ReactElement {
  const [rows, setRows] = useState<PrimaryDocument[]>([])
  const [departments, setDepartments] = useState<Lookup[]>([])
  const [objects, setObjects] = useState<Lookup[]>([])
  const [budgetItems, setBudgetItems] = useState<Lookup[]>([])
  const [contracts, setContracts] = useState<Lookup[]>([])
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [filters, setFilters] = useState<Partial<Record<ColumnKey, string>>>({})
  const [sort, setSort] = useState<{ key: ColumnKey; direction: 'asc' | 'desc' }>({ key: 'department', direction: 'asc' })
  const [widths, setWidths] = useState<Partial<Record<ColumnKey, number>>>(readWidths)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const resizeRef = useRef<{ key: ColumnKey; startX: number; startWidth: number } | null>(null)

  async function loadData(): Promise<void> {
    setLoading(true)
    setError(null)
    setActionError(null)
    try {
      const responses = await Promise.all([
        fetch('/api/primary', { cache: 'no-store' }),
        fetch('/api/gn/departments'),
        fetch('/api/gn/objects'),
        fetch('/api/gn/budget-items'),
        fetch('/api/gn/dogovors'),
      ])
      const failed = responses.find((response) => !response.ok)
      if (failed) throw new Error(formatHttpError(failed.status))
      const [primaryRows, departmentRows, objectRows, budgetRows, contractRows] = await Promise.all(
        responses.map((response) => response.json() as Promise<Record<string, unknown>[]>),
      )
      setRows(primaryRows as PrimaryDocument[])
      setDepartments(departmentRows.map((row) => ({ id: Number(row.GN_Dep_id), label: String(row.GN_department ?? '') })))
      setObjects(objectRows.map((row) => ({ id: Number(row.GN_do_id), label: String(row.GN_departament_object ?? '') })))
      setBudgetItems(budgetRows.map((row) => ({ id: Number(row.GN_b_id), label: String(row.GN_budget_network_item ?? '') })))
      setContracts(contractRows.map((row) => ({
        id: Number(row.GN_dgv_id),
        label: String(row.GN_dogovor ?? ''),
        personalAccount: String(row.GN_dogovor_personal_account ?? ''),
      })))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const visibleRows = useMemo(() => {
    const normalizedFilter = (key: ColumnKey): string => (filters[key] ?? '').trim().toLocaleLowerCase('ru')
    const valueFor = (row: PrimaryDocument, key: ColumnKey): string | number => {
      if (key === 'objects') return labelList(row.objects)
      if (key === 'budgetItems') return labelList(row.budgetItems)
      if (key === 'amountWithVat') return Number(row.amountWithVat ?? 0)
      if (key === 'edoArrivalDate') return displayDate(row.edoArrivalDate)
      if (key === 'sedLaunchDate') return displayDate(row.sedLaunchDate)
      return String(row[key] ?? '')
    }
    return rows.filter((row) => COLUMNS.every(({ key }) => {
      const filter = normalizedFilter(key)
      return !filter || String(valueFor(row, key)).toLocaleLowerCase('ru').includes(filter)
    })).sort((left, right) => {
      const leftValue = valueFor(left, sort.key)
      const rightValue = valueFor(right, sort.key)
      const compare = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'ru', { numeric: true, sensitivity: 'base' })
      return sort.direction === 'asc' ? compare : -compare
    })
  }, [filters, rows, sort])

  function toggleSort(key: ColumnKey): void {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' })
  }

  function startCreate(): void {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setFormError(null)
    setFormOpen(true)
  }

  function startEdit(row: PrimaryDocument): void {
    setEditingId(row.id)
    setDraft({
      departmentId: String(row.departmentId ?? ''),
      objectIds: row.objects.map((item) => String(item.id)),
      budgetItemIds: row.budgetItems.map((item) => String(item.id)),
      contractId: String(row.contractId ?? ''),
      personalAccount: row.personalAccount ?? '',
      amountWithVat: String(row.amountWithVat ?? 0),
      details: row.details ?? '',
      edoArrivalDate: row.edoArrivalDate?.slice(0, 10) ?? '',
      sedLaunchDate: row.sedLaunchDate?.slice(0, 10) ?? '',
      note: row.note ?? '',
    })
    setFormError(null)
    setFormOpen(true)
  }

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]): void {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function cancelEdit(): void {
    setFormOpen(false)
    setEditingId(null)
    setFormError(null)
  }

  function renderEditorCell(key: ColumnKey): React.ReactElement {
    if (key === 'department') {
      return (
        <select value={draft.departmentId} onChange={(event) => updateDraft('departmentId', event.target.value)}>
          <option value="">Выберите подразделение</option>
          {departments.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      )
    }
    if (key === 'objects' || key === 'budgetItems') {
      const options = key === 'objects' ? objects : budgetItems
      const value = key === 'objects' ? draft.objectIds : draft.budgetItemIds
      const draftKey = key === 'objects' ? 'objectIds' : 'budgetItemIds'
      return (
        <select
          multiple
          className="primary-table__multi-select"
          value={value}
          onChange={(event) => updateDraft(draftKey, [...event.target.selectedOptions].map((option) => option.value))}
        >
          {options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      )
    }
    if (key === 'contract') {
      return (
        <select value={draft.contractId} onChange={(event) => {
          updateDraft('contractId', event.target.value)
          updateDraft('personalAccount', '')
        }}>
          <option value="">Выберите договор</option>
          {contracts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      )
    }
    if (key === 'personalAccount') {
      const contract = contracts.find((item) => String(item.id) === draft.contractId)
      const options = personalAccountOptions(contract?.personalAccount)
      return (
        <select value={draft.personalAccount} onChange={(event) => updateDraft('personalAccount', event.target.value)} disabled={!draft.contractId}>
          <option value="">Выберите лицевой счет</option>
          {draft.personalAccount && !options.includes(draft.personalAccount) && (
            <option value={draft.personalAccount}>{draft.personalAccount}</option>
          )}
          {options.map((account) => <option key={account} value={account}>{account}</option>)}
        </select>
      )
    }
    if (key === 'amountWithVat') {
      return <input type="number" step="0.01" value={draft.amountWithVat} onChange={(event) => updateDraft('amountWithVat', event.target.value)} />
    }
    if (key === 'details') {
      return <textarea value={draft.details} onChange={(event) => updateDraft('details', event.target.value)} />
    }
    if (key === 'edoArrivalDate') {
      return <input type="date" value={draft.edoArrivalDate} onChange={(event) => updateDraft('edoArrivalDate', event.target.value)} />
    }
    if (key === 'sedLaunchDate') {
      return <input type="date" value={draft.sedLaunchDate} onChange={(event) => updateDraft('sedLaunchDate', event.target.value)} />
    }
    return <input value={draft.note} onChange={(event) => updateDraft('note', event.target.value)} />
  }

  async function save(): Promise<void> {
    const amount = Number(draft.amountWithVat.replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(amount)) {
      setFormError('Сумма должна быть числом.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const response = await fetch(editingId == null ? '/api/primary' : `/api/primary/${editingId}`, {
        method: editingId == null ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId: draft.departmentId || null,
          objectIds: draft.objectIds,
          budgetItemIds: draft.budgetItemIds,
          contractId: draft.contractId || null,
          personalAccount: draft.personalAccount,
          amountWithVat: amount,
          details: draft.details,
          edoArrivalDate: draft.edoArrivalDate,
          sedLaunchDate: draft.sedLaunchDate,
          note: draft.note,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || formatHttpError(response.status))
      }
      cancelEdit()
      await loadData()
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить запись')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRow(row: PrimaryDocument): Promise<void> {
    if (!window.confirm(`Удалить запись №${row.id}?`)) return
    setActionError(null)
    try {
      const response = await fetch(`/api/primary/${row.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || formatHttpError(response.status))
      }
      setRows((current) => current.filter((item) => item.id !== row.id))
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить запись')
    }
  }

  function startResize(event: ReactPointerEvent<HTMLSpanElement>, key: ColumnKey): void {
    event.preventDefault()
    event.stopPropagation()
    const startingWidth = widths[key] ?? 150
    resizeRef.current = { key, startX: event.clientX, startWidth: startingWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function resizeColumn(event: ReactPointerEvent<HTMLSpanElement>): void {
    const resize = resizeRef.current
    if (!resize) return
    const next = { ...widths, [resize.key]: Math.max(80, resize.startWidth + event.clientX - resize.startX) }
    setWidths(next)
    try {
      localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(next))
    } catch {
      setActionError('Не удалось сохранить ширину столбцов в браузере.')
    }
  }

  if (loading) return <main><p className="hint">Загрузка первичных документов...</p></main>

  return (
    <main className="primary-page">
      <section className="page-section">
        <div className="page-header">
          <h2>Первичные</h2>
          <button type="button" className="page-action-btn page-action-btn--success" onClick={startCreate} disabled={formOpen}>
            Добавить запись
          </button>
        </div>
        {error && <p className="hint hint--error" role="alert">{error}</p>}
        {actionError && <p className="hint hint--error" role="alert">{actionError}</p>}
        {!error && (
          <div className="guide-table-wrap primary-table-wrap">
            <table className="guide-table table-compact primary-table">
              <colgroup>
                <col style={{ width: 58 }} />
                {COLUMNS.map(({ key }) => <col key={key} style={{ width: widths[key] ?? 150 }} />)}
                <col style={{ width: 130 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>№</th>
                  {COLUMNS.map(({ key, label }) => (
                    <th key={key} className="primary-table__resizable-header">
                      <button type="button" className="guide-sort-button" onClick={() => toggleSort(key)}>
                        {label}{sort.key === key ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                      <span className="primary-table__resizer" role="separator" aria-orientation="vertical" aria-label={`Изменить ширину столбца ${label}`} onPointerDown={(event) => startResize(event, key)} onPointerMove={resizeColumn} onPointerUp={() => { resizeRef.current = null }} />
                    </th>
                  ))}
                  <th>Действия</th>
                </tr>
                <tr className="guide-search-row">
                  <th />
                  {COLUMNS.map(({ key, label }) => (
                    <th key={key}>
                      <input type="search" aria-label={`Фильтр: ${label}`} value={filters[key] ?? ''} onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))} />
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {formOpen && editingId == null && (
                  <tr className="primary-table__editing-row">
                    <td>Новая</td>
                    {COLUMNS.map(({ key }) => <td key={key}>{renderEditorCell(key)}</td>)}
                    <td>
                      <div className="primary-table__actions">
                        <button type="button" className="page-action-btn page-action-btn--success" onClick={() => void save()} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
                        <button type="button" className="page-action-btn page-action-btn--secondary" onClick={cancelEdit} disabled={saving}>Отмена</button>
                      </div>
                    </td>
                  </tr>
                )}
                {visibleRows.map((row, index) => (
                  <tr key={row.id} className={editingId === row.id ? 'primary-table__editing-row' : undefined}>
                    <td>{index + 1} ({row.id})</td>
                    {COLUMNS.map(({ key }) => (
                      <td key={key}>
                        {editingId === row.id
                          ? renderEditorCell(key)
                          : key === 'objects' ? labelList(row.objects)
                            : key === 'budgetItems' ? labelList(row.budgetItems)
                              : key === 'department' ? row.department ?? ''
                                : key === 'contract' ? row.contract ?? ''
                                  : key === 'personalAccount' ? row.personalAccount ?? ''
                                    : key === 'amountWithVat'
                                      ? Number(row.amountWithVat ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                      : key === 'edoArrivalDate' ? displayDate(row.edoArrivalDate)
                                        : key === 'sedLaunchDate' ? displayDate(row.sedLaunchDate)
                                          : key === 'details' ? row.details : row.note}
                      </td>
                    ))}
                    <td>
                      <div className="primary-table__actions">
                        {editingId === row.id ? (
                          <>
                            <button type="button" className="page-action-btn page-action-btn--success" onClick={() => void save()} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
                            <button type="button" className="page-action-btn page-action-btn--secondary" onClick={cancelEdit} disabled={saving}>Отмена</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="page-action-btn page-action-btn--secondary" onClick={() => startEdit(row)} disabled={formOpen}>ИЗМ</button>
                            <button type="button" className="page-action-btn page-action-btn--danger" onClick={() => void deleteRow(row)} disabled={formOpen}>Удалить</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {formError && <p className="hint hint--error" role="alert">{formError}</p>}
            {visibleRows.length === 0 && !formOpen && <p className="hint">{rows.length === 0 ? 'Записей пока нет.' : 'По заданным фильтрам данные не найдены.'}</p>}
          </div>
        )}
      </section>
    </main>
  )
}
