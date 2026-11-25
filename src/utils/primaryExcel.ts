import * as XLSX from 'xlsx'
import type { PrimaryImportFields, PrimaryImportRecord } from '../../shared/primaryExcel'
import { getBdrContractorIds, type BdrOption } from './primaryBdr'

export type PrimaryExcelField = 'id' | 'department' | 'objects' | 'contractor' | 'contract' | 'personalAccount' | 'amountWithVat' | 'sedLaunched' | 'acceptedIn1C' | 'note'
export type PrimaryExcelMapping = Partial<Record<PrimaryExcelField, number>>
type Lookup = { id: number; label: string; departmentIds?: number[]; contractorId?: number; date?: string }
type ExistingRow = {
  id: number
  departmentId: number | null
  contractId: number | null
  objects: Array<{ id: number }>
}
type References = {
  rows: ExistingRow[]
  departments: Lookup[]
  objects: Lookup[]
  contractors: Lookup[]
  contracts: Lookup[]
  bdr: BdrOption[]
}

export const PRIMARY_EXCEL_FIELDS: Array<{ key: PrimaryExcelField; label: string }> = [
  { key: 'id', label: 'ID' },
  { key: 'personalAccount', label: 'Лицевой счет' },
  { key: 'amountWithVat', label: 'Сумма с НДС' },
  { key: 'note', label: 'Примечание' },
]

export function defaultPrimaryExcelMapping(header: unknown[]): PrimaryExcelMapping {
  const id = header.findIndex((value) => String(value ?? '').trim() === 'ID')
  return id === -1 ? {} : { id }
}

export function readPrimaryExcelWorkbook(data: ArrayBuffer): XLSX.WorkBook {
  const bytes = new Uint8Array(data)
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error('Файл не является корректным XLSX')
  }
  return XLSX.read(bytes, { type: 'array' })
}

export function primaryContractLabel(contract: Lookup): string {
  if (!contract.date) return contract.label
  return `${contract.label} от ${contract.date.slice(0, 10).split('-').reverse().join('.')}`
}

function lookup(value: unknown, options: Lookup[], label: string, rowNumber: number, withDate = false): Lookup | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  let matches = options.filter((option) => option.label.trim() === text || (withDate && primaryContractLabel(option).trim() === text))
  if (matches.length === 0) matches = options.filter((option) => String(option.id) === text)
  if (matches.length !== 1) {
    throw new Error(`Строка ${rowNumber}: ${label} «${text}» ${matches.length ? 'неоднозначен' : 'не найден'}`)
  }
  return matches[0]
}

function booleanValue(value: unknown, label: string, rowNumber: number): boolean {
  if (typeof value === 'boolean') return value
  const text = String(value ?? '').trim().toLocaleLowerCase('ru')
  if (['', '0', 'нет', 'false'].includes(text)) return false
  if (['1', 'да', 'true'].includes(text)) return true
  throw new Error(`Строка ${rowNumber}: для «${label}» укажите да/нет или 1/0`)
}

export function parsePrimaryExcelRows(matrix: unknown[][], mapping: PrimaryExcelMapping, references: References): PrimaryImportRecord[] {
  const selected = Object.values(mapping)
  if (selected.length === 0 || !selected.some((index) => index !== mapping.id)) throw new Error('Выберите хотя бы один столбец для загрузки')
  if (new Set(selected).size !== selected.length) throw new Error('Один столбец Excel нельзя сопоставить с несколькими полями')
  const seen = new Set<number>()
  const records: PrimaryImportRecord[] = []
  for (let index = 1; index < matrix.length; index += 1) {
    const cells = matrix[index] ?? []
    if (selected.every((column) => String(cells[column] ?? '').trim() === '')) continue
    const rowNumber = index + 1
    const has = (key: PrimaryExcelField): boolean => mapping[key] !== undefined
    const value = (key: PrimaryExcelField): unknown => {
      const column = mapping[key]
      return column === undefined ? undefined : cells[column]
    }
    const idText = String(value('id') ?? '').trim()
    const id = idText ? Number(idText) : undefined
    if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0 || seen.has(id))) {
      throw new Error(`Строка ${rowNumber}: неверный или повторяющийся ID`)
    }
    const existing = id === undefined ? undefined : references.rows.find((row) => row.id === id)
    if (id !== undefined && !existing) throw new Error(`Строка ${rowNumber}: запись с ID ${id} не найдена`)
    if (id !== undefined) seen.add(id)

    const fields: PrimaryImportFields = {}
    if (has('department')) fields.departmentId = lookup(value('department'), references.departments, 'Подразделение', rowNumber)?.id ?? null
    if (has('objects')) {
      const text = String(value('objects') ?? '').trim()
      const exact = references.objects.filter((object) => object.label.trim() === text)
      const names = text ? (exact.length === 1 ? [text] : text.split(';').map((part) => part.trim())) : []
      fields.objectIds = [...new Set(names.map((name) => {
        const object = lookup(name, references.objects, 'Объект', rowNumber)
        if (!object) throw new Error(`Строка ${rowNumber}: пустое название объекта`)
        return object.id
      }))]
    }
    const contractor = has('contractor') ? lookup(value('contractor'), references.contractors, 'Контрагент', rowNumber) : undefined
    if (has('contract')) {
      const candidates = contractor ? references.contracts.filter((contract) => contract.contractorId === contractor.id) : references.contracts
      fields.contractId = lookup(value('contract'), candidates, 'Договор', rowNumber, true)?.id ?? null
    }
    const departmentId = fields.departmentId === undefined ? existing?.departmentId ?? null : fields.departmentId
    const objectIds = fields.objectIds ?? existing?.objects.map((object) => object.id) ?? []
    const contractId = fields.contractId === undefined ? existing?.contractId ?? null : fields.contractId
    const contract = references.contracts.find((item) => item.id === contractId)
    if (has('contractor') && (contractor?.id ?? null) !== (contract?.contractorId ?? null)) {
      throw new Error(`Строка ${rowNumber}: контрагент не соответствует договору`)
    }
    const changed = !existing || departmentId !== existing.departmentId || contractId !== existing.contractId
      || objectIds.length !== existing.objects.length || objectIds.some((objectId) => !existing.objects.some((object) => object.id === objectId))
    if (changed) {
      if (departmentId !== null && !references.bdr.some((row) => row.departmentId === departmentId)) {
        throw new Error(`Строка ${rowNumber}: подразделение отсутствует в БДР`)
      }
      if (objectIds.some((objectId) => !references.bdr.some((row) => row.objectId === objectId)
        || !references.objects.find((object) => object.id === objectId)?.departmentIds?.includes(departmentId ?? 0))) {
        throw new Error(`Строка ${rowNumber}: объект не относится к подразделению или отсутствует в БДР`)
      }
      if (contractId !== null && (!contract || !references.bdr.some((row) => row.contractId === contractId)
        || !getBdrContractorIds(references.bdr, String(departmentId ?? ''), objectIds.map(String)).has(contract.contractorId ?? 0))) {
        throw new Error(`Строка ${rowNumber}: договор или контрагент не соответствует данным БДР`)
      }
    }
    if (has('personalAccount')) fields.personalAccount = String(value('personalAccount') ?? '').trim()
    if (has('amountWithVat')) {
      const text = String(value('amountWithVat') ?? '').trim().replace(/\s/g, '').replace(',', '.')
      const amount = text === '' ? null : Number(text)
      if (amount !== null && !Number.isFinite(amount)) throw new Error(`Строка ${rowNumber}: сумма должна быть числом`)
      fields.amountWithVat = amount
    }
    if (has('sedLaunched')) fields.sedLaunched = booleanValue(value('sedLaunched'), 'Запущен в СЭД', rowNumber)
    if (has('acceptedIn1C')) fields.acceptedIn1C = booleanValue(value('acceptedIn1C'), 'Принято на учет в 1С', rowNumber)
    if (has('note')) fields.note = String(value('note') ?? '')
    if (Object.keys(fields).length === 0) throw new Error(`Строка ${rowNumber}: нет полей для загрузки`)
    records.push({ rowNumber, ...(id === undefined ? {} : { id }), fields })
  }
  if (records.length === 0) throw new Error('В файле нет строк для загрузки')
  return records
}
