import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import * as XLSX from 'xlsx'
import ExcelActionToolbar from '../components/ExcelActionToolbar'
import { formatErrorMessage, formatHttpError } from '../utils/httpUtils'

type Row = Record<string, unknown>
type LookupOption = { value: string; label: string }
type SortDirection = 'asc' | 'desc'
type Column = {
  key: string
  title: string
  type: 'text' | 'number' | 'lookup'
  lookupKey?: string
}

const ENTITY = 'gazprom-telecom'
const FILTERS_STORAGE_KEY = 'gazprom-telecom-filters'
const WIDTHS_STORAGE_KEY = 'gazprom-telecom-column-widths'
const COLUMNS: Column[] = [
  { key: 'GN_department_FK', title: 'Подразделение', type: 'lookup', lookupKey: 'GN_department_name' },
  { key: 'GN_departament_object_FK', title: 'Объект', type: 'lookup', lookupKey: 'GN_departament_object_name' },
  { key: 'tariff', title: 'Тариф', type: 'text' },
  { key: 'provided_services', title: 'Предоставляемые услуги связи', type: 'text' },
  { key: 'service_identifier', title: 'Идентификатор услуги', type: 'text' },
  { key: 'description', title: 'Описание', type: 'text' },
  { key: 'tariff_groups', title: 'Группы тарифов', type: 'text' },
  { key: 'unit', title: 'Ед.изм.', type: 'text' },
  { key: 'GN_dogovor_FK', title: 'Договор', type: 'lookup', lookupKey: 'GN_dogovor_name' },
  { key: 'quantity', title: 'Кол-во', type: 'text' },
  { key: 'monthly_tariff', title: 'Тариф, руб/мес.', type: 'number' },
  { key: 'monthly_total', title: 'Стоимость услуг связи всего, руб/мес.', type: 'number' },
  { key: 'PAO_budget_network_item_FK', title: 'Статья бюджета', type: 'lookup', lookupKey: 'PAO_budget_network_item_name' },
  { key: 'note', title: 'Примечание', type: 'text' },
]

const EDITABLE_COLUMNS = COLUMNS.filter((column) => column.key !== 'monthly_total')
const EMPTY_DRAFT: Row = {
  GN_department_FK: '',
  GN_departament_object_FK: '',
  tariff: '',
  provided_services: '',
  service_identifier: '',
  description: '',
  tariff_groups: '',
  unit: '',
  GN_dogovor_FK: '',
  quantity: '',
  monthly_tariff: '',
  PAO_budget_network_item_FK: '',
  note: '',
}
const NUMBER_FORMATTER = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function readSavedRecord(key: string, validate: (value: unknown) => boolean): Record<string, string | number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => validate(value)))
  } catch {
    return {}
  }
}

function parseNumber(value: unknown): number {
  const normalized = String(value ?? '').replace(/\s+/g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function rowTotal(row: Row): number {
  return parseNumber(row.quantity) * parseNumber(row.monthly_tariff)
}

function compareValues(left: unknown, right: unknown): number {
  const leftText = String(left ?? '').trim()
  const rightText = String(right ?? '').trim()
  const leftNumber = Number(leftText.replace(/\s+/g, '').replace(',', '.'))
  const rightNumber = Number(rightText.replace(/\s+/g, '').replace(',', '.'))
  if (leftText && rightText && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber
  }
  return leftText.localeCompare(rightText, 'ru', { numeric: true, sensitivity: 'base' })
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(payload.error || formatHttpError(response.status))
  }
  return response.json() as Promise<T>
}

export default function GazpromTelecomTable(): React.ReactElement {
  const [rows, setRows] = useState<Row[]>([])
  const [lookups, setLookups] = useState<Record<string, LookupOption[]>>({})
  const [objects, setObjects] = useState<Row[]>([])
  const [filters, setFilters] = useState<Record<string, string>>(() => (
    readSavedRecord(FILTERS_STORAGE_KEY, (value) => typeof value === 'string') as Record<string, string>
  ))
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => (
    readSavedRecord(WIDTHS_STORAGE_KEY, (value) => typeof value === 'number' && Number.isFinite(value) && value >= 60) as Record<string, number>
  ))
  const [sort, setSort] = useState<{ key: string; direction: SortDirection }>({ key: 'tariff', direction: 'asc' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Row>({})
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  async function loadRows(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      setRows(await readResponse<Row[]>(await fetch(`/api/gn/${ENTITY}`, { cache: 'no-store' })))
    } catch (loadError) {
      setError(formatErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRows()
    async function loadLookups(): Promise<void> {
      try {
        const [dogovorRows, budgetRows, departmentRows, objectRows] = await Promise.all([
          readResponse<Row[]>(await fetch(
            `/api/gn/dogovors?contractor=${encodeURIComponent('Газпром телеком ООО')}`,
          )),
          readResponse<Row[]>(await fetch('/api/gn/pao-budget-items')),
          readResponse<Row[]>(await fetch('/api/gn/departments')),
          readResponse<Row[]>(await fetch('/api/gn/objects')),
        ])
        setObjects(objectRows)
        setLookups({
          GN_dogovor_FK: dogovorRows.map((row) => ({
            value: String(row.GN_dgv_id),
            label: `#${row.GN_dgv_id} ${String(row.GN_dogovor ?? '')}`.trim(),
          })),
          PAO_budget_network_item_FK: budgetRows.map((row) => ({
            value: String(row.PAO_b_id),
            label: String(row.PAO__budget_network_item ?? ''),
          })),
          GN_department_FK: departmentRows.map((row) => ({
            value: String(row.GN_Dep_id),
            label: String(row.GN_department ?? ''),
          })),
          GN_departament_object_FK: objectRows.map((row) => ({
            value: String(row.GN_do_id),
            label: String(row.GN_departament_object ?? ''),
          })),
        })
      } catch (lookupError) {
        setLookupError(`Не удалось загрузить справочники: ${formatErrorMessage(lookupError)}`)
      }
    }
    void loadLookups()
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters))
    } catch {
      setSaveError('Не удалось сохранить фильтры в этом браузере')
    }
  }, [filters])

  useEffect(() => {
    try {
      localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths))
    } catch {
      setSaveError('Не удалось сохранить ширину столбцов в этом браузере')
    }
  }, [columnWidths])

  const sortedRows = useMemo(() => [...rows].sort((left, right) => {
    const leftValue = sort.key === 'monthly_total' ? rowTotal(left) : left[sort.key]
    const rightValue = sort.key === 'monthly_total' ? rowTotal(right) : right[sort.key]
    const result = compareValues(leftValue, rightValue)
    return sort.direction === 'asc' ? result : -result
  }), [rows, sort])

  const visibleRows = useMemo(() => sortedRows.filter((row) => COLUMNS.every((column) => {
    const filter = (filters[column.key] ?? '').trim().toLocaleLowerCase('ru')
    if (!filter) return true
    const value = column.key === 'monthly_total'
      ? NUMBER_FORMATTER.format(rowTotal(row))
      : column.lookupKey
        ? row[column.lookupKey]
        : row[column.key]
    return String(value ?? '').toLocaleLowerCase('ru').includes(filter)
  })), [sortedRows, filters])

  function startResize(event: ReactPointerEvent<HTMLSpanElement>, key: string): void {
    event.preventDefault()
    event.stopPropagation()
    const header = event.currentTarget.closest('th')
    if (!header) return
    const startX = event.clientX
    const startWidth = header.getBoundingClientRect().width
    const move = (moveEvent: PointerEvent): void => {
      setColumnWidths((previous) => ({ ...previous, [key]: Math.max(70, startWidth + moveEvent.clientX - startX) }))
    }
    const stop = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  function startCreate(): void {
    setCreating(true)
    setEditingId(null)
    setDraft({ ...EMPTY_DRAFT })
    setSaveError(null)
  }

  function startEdit(row: Row): void {
    setCreating(false)
    setEditingId(Number(row.GN_gazprom_telecom_id))
    setDraft(Object.fromEntries(EDITABLE_COLUMNS.map((column) => [
      column.key,
      column.type === 'lookup' ? row[column.key] ?? '' : row[column.key] ?? '',
    ])))
    setSaveError(null)
  }

  function cancelEdit(): void {
    setCreating(false)
    setEditingId(null)
    setDraft({})
    setSaveError(null)
  }

  function toggleSort(key: string): void {
    setSort((previous) => previous.key === key
      ? { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' })
  }

  async function saveDraft(): Promise<void> {
    setSaving(true)
    setSaveError(null)
    const payload: Row = { ...draft }
    EDITABLE_COLUMNS.filter((column) => column.type === 'lookup').forEach(({ key }) => {
      payload[key] = String(payload[key] ?? '') || null
    })
    try {
      const tariffText = String(payload.monthly_tariff ?? '').trim()
      if (tariffText !== '') {
        const tariff = Number(tariffText.replace(/\s+/g, '').replace(',', '.'))
        if (!Number.isFinite(tariff)) throw new Error('Тариф должен быть числом')
        payload.monthly_tariff = tariff
      } else {
        payload.monthly_tariff = null
      }
      const response = await fetch(
        creating ? `/api/gn/${ENTITY}` : `/api/gn/${ENTITY}/${editingId}`,
        {
          method: creating ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      await readResponse<Row>(response)
      cancelEdit()
      await loadRows()
    } catch (saveError) {
      setSaveError(formatErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function deleteRow(id: number): Promise<void> {
    if (!window.confirm('Удалить строку Газпром телеком?')) return
    setSaving(true)
    setSaveError(null)
    try {
      await readResponse<unknown>(await fetch(`/api/gn/${ENTITY}/${id}`, { method: 'DELETE' }))
      setRows((previous) => previous.filter((row) => Number(row.GN_gazprom_telecom_id) !== id))
      if (editingId === id) cancelEdit()
    } catch (deleteError) {
      setSaveError(formatErrorMessage(deleteError))
    } finally {
      setSaving(false)
    }
  }

  function displayValue(row: Row, column: Column): string {
    if (column.key === 'monthly_total') return NUMBER_FORMATTER.format(rowTotal(row))
    if (column.lookupKey) return String(row[column.lookupKey] ?? '')
    return String(row[column.key] ?? '')
  }

  function renderEditor(column: Column, values: Row, setValues: (update: (previous: Row) => Row) => void): React.ReactElement {
    if (column.type === 'lookup') {
      const options = column.key === 'GN_departament_object_FK'
        ? (lookups[column.key] ?? []).filter((option) => {
            const object = objects.find((row) => String(row.GN_do_id) === option.value)
            const departmentId = String(values.GN_department_FK ?? '')
            if (!departmentId || !object) return false
            const departmentIds = Array.isArray(object.GN_department_FKs) && object.GN_department_FKs.length > 0
              ? object.GN_department_FKs.map(String)
              : [String(object.GN_department_FK ?? '')]
            return departmentIds.includes(departmentId)
          })
        : lookups[column.key] ?? []

      return (
        <select
          aria-label={column.title}
          disabled={column.key === 'GN_departament_object_FK' && !values.GN_department_FK}
          value={String(values[column.key] ?? '')}
          onChange={(event) => setValues((previous) => {
            const nextValue = event.target.value
            if (column.key === 'GN_department_FK') {
              const object = objects.find((row) => String(row.GN_do_id) === String(previous.GN_departament_object_FK ?? ''))
              const departmentIds = Array.isArray(object?.GN_department_FKs) && object.GN_department_FKs.length > 0
                ? object.GN_department_FKs.map(String)
                : [String(object?.GN_department_FK ?? '')]
              return {
                ...previous,
                GN_department_FK: nextValue,
                GN_departament_object_FK: departmentIds.includes(nextValue) ? previous.GN_departament_object_FK : '',
              }
            }
            return { ...previous, [column.key]: nextValue }
          })}
        >
          <option value="">—</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      )
    }
    return (
      <input
        aria-label={column.title}
        type={column.key === 'monthly_tariff' ? 'number' : 'text'}
        step={column.key === 'monthly_tariff' ? '0.01' : undefined}
        value={String(values[column.key] ?? '')}
        onChange={(event) => setValues((previous) => ({ ...previous, [column.key]: event.target.value }))}
      />
    )
  }

  function exportToExcel(): void {
    const header = ['№', ...COLUMNS.map((column) => column.title)]
    const exportRows = visibleRows.map((row) => [
      row.GN_gazprom_telecom_id ?? '',
      ...COLUMNS.map((column) => column.key === 'monthly_total'
        ? rowTotal(row)
        : column.lookupKey
          ? row[column.lookupKey] ?? ''
          : row[column.key] ?? ''),
    ])
    const worksheet = XLSX.utils.aoa_to_sheet([header, ...exportRows])
    worksheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: exportRows.length, c: header.length - 1 } }),
    }
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Газпром телеком')
    XLSX.writeFile(workbook, 'Газпром_телеком.xlsx')
  }

  function lookupId(columnKey: string, value: unknown, rowNumber: number): string | null {
    const normalized = String(value ?? '').trim()
    if (!normalized) return null
    const options = lookups[columnKey] ?? []
    const match = options.find((option) => option.value === normalized || option.label === normalized)
    if (!match) throw new Error(`Строка ${rowNumber}: не найдено значение «${normalized}» в справочнике «${COLUMNS.find((column) => column.key === columnKey)?.title}»`)
    return match.value
  }

  async function importFromExcel(file: File): Promise<void> {
    setImporting(true)
    setImportError(null)
    setImportMessage(null)
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) throw new Error('В файле отсутствуют листы')
      const excelRows = XLSX.utils.sheet_to_json<Row>(workbook.Sheets[sheetName], { defval: '' })
      if (excelRows.length === 0) throw new Error('В файле нет строк для загрузки')

      const knownIds = new Set(rows.map((row) => Number(row.GN_gazprom_telecom_id)))
      let savedCount = 0
      for (const [index, excelRow] of excelRows.entries()) {
        const rawId = excelRow['№'] ?? excelRow.GN_gazprom_telecom_id
        const id = Number(rawId)
        const isUpdate = Number.isInteger(id) && knownIds.has(id)
        const payload: Row = {}
        EDITABLE_COLUMNS.forEach((column) => {
          const value = excelRow[column.title] ?? excelRow[column.key] ?? ''
          if (column.type === 'lookup') {
            payload[column.key] = lookupId(column.key, value, index + 2)
          } else if (column.key === 'monthly_tariff') {
            const tariffText = String(value).trim()
            const tariff = Number(tariffText.replace(/\s+/g, '').replace(',', '.'))
            if (tariffText !== '' && !Number.isFinite(tariff)) {
              throw new Error(`Строка ${index + 2}: тариф должен быть числом`)
            }
            payload[column.key] = tariffText === '' ? null : tariff
          } else {
            payload[column.key] = String(value ?? '')
          }
        })
        const response = await fetch(
          isUpdate ? `/api/gn/${ENTITY}/${id}` : `/api/gn/${ENTITY}`,
          {
            method: isUpdate ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        )
        try {
          await readResponse<Row>(response)
        } catch (rowError) {
          throw new Error(`Строка ${index + 2}: ${formatErrorMessage(rowError)}`)
        }
        savedCount += 1
      }
      await loadRows()
      setImportMessage(`Загружено строк: ${savedCount}. Стоимость вычисляется автоматически из количества и тарифа.`)
    } catch (uploadError) {
      setImportError(formatErrorMessage(uploadError))
    } finally {
      setImporting(false)
    }
  }

  function resetFilters(): void {
    setFilters({})
  }

  return (
    <section className="gazprom-telecom-table">
      <h2>Газпром телеком</h2>
      <ExcelActionToolbar
        className="excel-action-toolbar--equipment"
        onReset={resetFilters}
        onAddRow={startCreate}
        addRowDisabled={creating || editingId !== null || saving}
        onExport={exportToExcel}
        onUpload={(file) => void importFromExcel(file)}
        uploading={importing}
      />
      {loading && <p className="hint">Загрузка данных...</p>}
      {error && <p className="hint hint--error">Ошибка: {error}</p>}
      {lookupError && <p className="hint hint--error">{lookupError}</p>}
      {saveError && <p className="hint hint--error">Ошибка сохранения: {saveError}</p>}
      {importMessage && <p className="hint">{importMessage}</p>}
      {importError && <p className="hint hint--error">Ошибка импорта: {importError}</p>}
      {!loading && !error && (
        <div className="gazprom-telecom-table-wrap">
          <table className="guide-table table-compact gazprom-telecom-grid">
            <colgroup>
              <col style={{ width: '56px' }} />
              {COLUMNS.map((column) => <col key={column.key} style={{ width: `${columnWidths[column.key] ?? 150}px` }} />)}
              <col style={{ width: '100px' }} />
            </colgroup>
            <thead>
              <tr>
                <th>№</th>
                {COLUMNS.map((column) => (
                  <th key={column.key} className="gazprom-telecom-resizable-header">
                    <button
                      type="button"
                      className="gazprom-telecom-sort-button"
                      onClick={() => toggleSort(column.key)}
                    >
                      {column.title}{sort.key === column.key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                    <input
                      aria-label={`Фильтр: ${column.title}`}
                      placeholder="Фильтр"
                      value={filters[column.key] ?? ''}
                      onChange={(event) => setFilters((previous) => ({ ...previous, [column.key]: event.target.value }))}
                    />
                    <span role="separator" aria-orientation="vertical" onPointerDown={(event) => startResize(event, column.key)} />
                  </th>
                ))}
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {creating && (
                <tr>
                  <td>Новая</td>
                  {COLUMNS.map((column) => (
                    <td key={column.key}>
                      {column.key === 'monthly_total'
                        ? NUMBER_FORMATTER.format(rowTotal(draft))
                        : renderEditor(column, draft, setDraft)}
                    </td>
                  ))}
                  <td className="gazprom-telecom-actions">
                    <button type="button" onClick={() => void saveDraft()} disabled={saving}>Сохранить</button>
                    <button type="button" onClick={cancelEdit} disabled={saving}>Отмена</button>
                  </td>
                </tr>
              )}
              {visibleRows.map((row) => {
                const id = Number(row.GN_gazprom_telecom_id)
                const isEditing = editingId === id
                return (
                  <tr key={id}>
                    <td>{id}</td>
                    {COLUMNS.map((column) => (
                      <td key={column.key}>
                        {isEditing
                          ? column.key === 'monthly_total'
                            ? NUMBER_FORMATTER.format(rowTotal(draft))
                            : renderEditor(column, draft, setDraft)
                          : displayValue(row, column)}
                      </td>
                    ))}
                    <td className="gazprom-telecom-actions">
                      {isEditing ? (
                        <>
                          <button type="button" onClick={() => void saveDraft()} disabled={saving}>Сохранить</button>
                          <button type="button" onClick={cancelEdit} disabled={saving}>Отмена</button>
                          <button type="button" onClick={() => void deleteRow(id)} disabled={saving}>УДАЛИТЬ</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => startEdit(row)} disabled={creating || saving}>ИЗМ</button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {visibleRows.length === 0 && !creating && (
                <tr><td colSpan={COLUMNS.length + 2}>Нет строк, соответствующих фильтрам.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
          </section>
  )
}
