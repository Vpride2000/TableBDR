import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import type { PrimaryImportMonth, PrimaryImportRecord } from '../shared/primaryExcel'
import { PRIMARY_MONTHS } from '../shared/primaryMonths'
import { formatHttpError } from './utils/httpUtils'
import { defaultPrimaryExcelMapping, parsePrimaryExcelRows, PRIMARY_EXCEL_FIELDS, readPrimaryExcelWorkbook, type PrimaryExcelMapping } from './utils/primaryExcel'
import type { BdrOption } from './utils/primaryBdr'

type Lookup = { id: number; label: string; departmentIds?: number[]; contractorId?: number; date?: string }
type ExistingRow = { id: number; departmentId: number | null; contractId: number | null; objects: Array<{ id: number }> }
type Props = {
  file: File
  rows: ExistingRow[]
  departments: Lookup[]
  objects: Lookup[]
  contractors: Lookup[]
  contracts: Lookup[]
  bdr: BdrOption[]
  initialMonth: PrimaryImportMonth
  onCancel: () => void
  onComplete: (created: number, updated: number) => void
  onSavingChange: (saving: boolean) => void
  onError: (message: string) => void
}

function readSheet(workbook: XLSX.WorkBook, name: string): unknown[][] {
  const sheet = workbook.Sheets[name]
  if (!sheet || !sheet['!ref']) throw new Error('Выбранный лист пуст')
  const range = XLSX.utils.decode_range(sheet['!ref'])
  range.s = { r: 0, c: 0 }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true, range })
  if (!matrix[0]?.some((cell) => String(cell ?? '').trim())) throw new Error('В первой строке листа нет заголовков')
  return matrix
}

export default function PrimaryExcelImport({ file, rows, departments, objects, contractors, contracts, bdr, initialMonth, onCancel, onComplete, onSavingChange, onError }: Props): React.ReactElement {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [matrix, setMatrix] = useState<unknown[][]>([])
  const [month, setMonth] = useState<PrimaryImportMonth>(initialMonth)
  const [mapping, setMapping] = useState<PrimaryExcelMapping>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function openFile(): Promise<void> {
      try {
        const nextWorkbook = readPrimaryExcelWorkbook(await file.arrayBuffer())
        const first = nextWorkbook.SheetNames[0]
        if (!first) throw new Error('В файле отсутствуют листы')
        if (active) {
          setWorkbook(nextWorkbook)
          setSheetName(first)
        }
        const nextMatrix = readSheet(nextWorkbook, first)
        if (active) {
          setMatrix(nextMatrix)
          setMapping(defaultPrimaryExcelMapping(nextMatrix[0]))
          setError(null)
        }
      } catch (readError) {
        if (active) setError(readError instanceof Error ? readError.message : 'Не удалось прочитать Excel')
      } finally {
        if (active) setLoading(false)
      }
    }
    void openFile()
    return () => { active = false }
  }, [file, initialMonth])

  function changeSheet(name: string): void {
    if (!workbook) return
    setSheetName(name)
    try {
      const next = readSheet(workbook, name)
      setMatrix(next)
      setMapping(defaultPrimaryExcelMapping(next[0]))
      setError(null)
    } catch (readError) {
      setMatrix([])
      setMapping({})
      setError(readError instanceof Error ? readError.message : 'Не удалось прочитать лист')
    }
  }

  async function submit(): Promise<void> {
    setError(null)
    setSaving(true)
    onSavingChange(true)
    try {
      const records: PrimaryImportRecord[] = parsePrimaryExcelRows(matrix, mapping, { rows, departments, objects, contractors, contracts, bdr })
      const response = await fetch('/api/primary/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, records }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || formatHttpError(response.status))
      }
      const result = await response.json() as { created: number; updated: number }
      onComplete(result.created, result.updated)
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : 'Не удалось загрузить Excel'
      setError(message)
      onError(message)
    } finally {
      setSaving(false)
      onSavingChange(false)
    }
  }

  return (
    <section className="guide-new-row add-row-form-vertical" aria-label="Загрузка первичных документов из Excel">
      <h3>Загрузка Excel: {file.name}</h3>
      {loading && <p className="hint">Чтение файла...</p>}
      {workbook && (
        <div className="form-fields-vertical">
          <label className="form-field">
            <span className="form-field-label">Лист Excel</span>
            <select value={sheetName} disabled={saving} onChange={(event) => changeSheet(event.target.value)}>
              {workbook.SheetNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span className="form-field-label">Месяц данных</span>
            <select value={month} disabled={saving} onChange={(event) => {
              const next = event.target.value as PrimaryImportMonth
              setMonth(next)
            }}>
              {PRIMARY_MONTHS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <p className="hint">Заголовки должны быть в первой строке. Строки с ID обновляются, без ID добавляются. Пустые ячейки выбранных столбцов очищают значения; невыбранные столбцы не изменяются.</p>
          {PRIMARY_EXCEL_FIELDS.map((field) => (
            <label key={field.key} className="form-field">
              <span className="form-field-label">{field.label}</span>
              <select value={mapping[field.key] ?? ''} disabled={saving || matrix.length === 0} onChange={(event) => {
                const next = event.target.value
                setMapping((current) => {
                  const updated = { ...current }
                  if (next === '') delete updated[field.key]
                  else updated[field.key] = Number(next)
                  return updated
                })
              }}>
                <option value="">Не загружать</option>
                {(matrix[0] ?? []).map((heading, index) => (
                  <option key={index} value={index}>{XLSX.utils.encode_col(index)}: {String(heading ?? '')}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      {error && <p className="hint hint--error" role="alert">{error}</p>}
      <div className="form-actions-row-compact">
        <button type="button" className="form-submit-btn" onClick={() => void submit()} disabled={loading || saving || matrix.length === 0}>
          {saving ? 'Загрузка...' : 'Загрузить'}
        </button>
        <button type="button" className="page-action-btn page-action-btn--secondary" onClick={onCancel} disabled={saving}>Отмена</button>
      </div>
    </section>
  )
}
