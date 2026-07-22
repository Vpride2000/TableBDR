import { Fragment, useEffect, useState } from 'react'
import { formatHttpError } from '../utils/forecastUtils'

// Страница управления договорами.
// Загружает справочники, отображает список договоров и позволяет сохранять изменения.
type Row = Record<string, unknown>
type LookupOption = { value: string; label: string; meta?: Row }

type ContractRow = {
  GN_contract_id: number
  GN_contract_contractor_FK: number
  GN_contract_dogovor_FK: number
  GN_contract_sed_launch_date: string
  GN_contract_asez_load_date: string
  GN_contract_state: string
  GN_contract_status_updated_at: string
  GN_contract_approval_status?: string
  GN_contract_date?: string
  GN_contract_term_from?: string
  GN_contract_term_to?: string
  GN_contract_department?: string
  GN_contract_side?: string
  GN_contract_asez_number?: string
}

type ContractAgreement = {
  GN_additional_agreement_id: number
  GN_contract_id_FK: number
  GN_additional_agreement_number: string
  GN_additional_agreement_date: string
  GN_additional_agreement_description: string
  GN_additional_agreement_amount: number
  GN_additional_agreement_status?: string
}

type ContractTermSegment = { label: string; color: 'blue' | 'yellow' | 'red' }

type ContractTermVisual = {
  fromLabel: string
  toLabel: string
  monthsTotal: number
  segments: ContractTermSegment[]
  visualStartLabel: string
}

const COLUMNS = [
  { key: 'GN_contract_contractor_FK', label: 'контрагент', kind: 'lookup' as const, narrow: true },
  { key: 'GN_contract_department', label: 'подразделение', kind: 'text' as const, narrow: true },
  { key: 'GN_contract_side', label: 'сторона', kind: 'text' as const, narrow: true },
  { key: 'GN_contract_dogovor_FK', label: 'договор', kind: 'lookup' as const, narrow: true },
  { key: 'GN_contract_asez_number', label: 'номер АСЭЗ', kind: 'text' as const, narrow: true },
  { key: 'GN_contract_date', label: 'дата', kind: 'date' as const },
  { key: 'GN_contract_term_from', label: 'срок С', kind: 'date' as const },
  { key: 'GN_contract_term_to', label: 'срок ПО', kind: 'date' as const },
  { key: 'GN_contract_state', label: 'состояние', kind: 'text' as const, narrow: true },
  { key: 'GN_contract_status_updated_at', label: 'обновлён', kind: 'date' as const },
  { key: 'GN_contract_approval_status', label: 'статус', kind: 'status' as const },
]

const DISPLAY_COLUMNS = COLUMNS.filter((column) => column.kind !== 'status')
const ACTIVE_TABLE_COLSPAN = DISPLAY_COLUMNS.length + 3

const MONTHS_SHORT_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function mapLookupOptions(rows: Row[], valueKey: string, labelKey: string): LookupOption[] {
  return rows.map((row) => ({
    value: String(row[valueKey] ?? ''),
    label: String(row[labelKey] ?? ''),
    meta: row,
  }))
}

function toRow(data: Row): ContractRow {
  return {
    GN_contract_id: Number(data.GN_contract_id ?? 0),
    GN_contract_contractor_FK: Number(data.GN_contract_contractor_FK ?? 0),
    GN_contract_dogovor_FK: Number(data.GN_contract_dogovor_FK ?? 0),
    GN_contract_sed_launch_date: normalizeDateValue(data.GN_contract_sed_launch_date),
    GN_contract_asez_load_date: normalizeDateValue(data.GN_contract_asez_load_date),
    GN_contract_state: String(data.GN_contract_state ?? ''),
    GN_contract_status_updated_at: normalizeDateValue(data.GN_contract_status_updated_at),
    GN_contract_approval_status: String(data.GN_contract_approval_status ?? 'действующий'),
    GN_contract_date: normalizeDateValue(data.GN_contract_date),
    GN_contract_term_from: normalizeDateValue(data.GN_contract_term_from),
    GN_contract_term_to: normalizeDateValue(data.GN_contract_term_to),
    GN_contract_department: String(data.GN_contract_department ?? ''),
    GN_contract_side: String(data.GN_contract_side ?? ''),
    GN_contract_asez_number: String(data.GN_contract_asez_number ?? ''),
  }
}

function displayLookupLabel(options: LookupOption[], value: unknown): string {
  const normalizedValue = String(value ?? '')
  return options.find((option) => option.value === normalizedValue)?.label ?? normalizedValue
}

function normalizeDateValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  const normalizedValue = String(value ?? '')
  if (normalizedValue === '') return ''
  return normalizedValue.length >= 10 ? normalizedValue.slice(0, 10) : normalizedValue
}

function formatDateDisplay(value: string): string {
  if (!value) return value
  // Получаем только часть с датой (YYYY-MM-DD)
  const dateOnly = value.slice(0, 10)
  if (dateOnly.length < 10) return value
  const [year, month, day] = dateOnly.split('-')
  const shortYear = year.slice(-2)
  return `${day}.${month}.${shortYear}`
}

function parseIsoDate(value: string): Date | null {
  if (!value) return null

  const dateOnly = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null

  const [yearRaw, monthRaw, dayRaw] = dateOnly.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null

  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null
  }

  return parsed
}

function formatMonthLabel(date: Date): string {
  return `${MONTHS_SHORT_RU[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(-2)}`
}

function shiftMonth(date: Date, monthOffset: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1))
}

function buildContractTermVisual(fromValue: string, toValue: string): ContractTermVisual | null {
  const fromDate = parseIsoDate(fromValue)
  const toDate = parseIsoDate(toValue)
  if (!fromDate || !toDate) return null

  const startDate = fromDate.getTime() <= toDate.getTime() ? fromDate : toDate
  const endDate = fromDate.getTime() <= toDate.getTime() ? toDate : fromDate

  const now = new Date()
  const currentYearStart = new Date(Date.UTC(now.getFullYear(), 0, 1))

  const monthsTotal = (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12
    + (endDate.getUTCMonth() - startDate.getUTCMonth()) + 1
  if (monthsTotal <= 0) return null

  // Для завершившихся до текущего года оставляем строку, но без цветовой индикации.
  if (endDate.getTime() < currentYearStart.getTime()) {
    return {
      fromLabel: formatMonthLabel(startDate),
      toLabel: formatMonthLabel(endDate),
      monthsTotal,
      segments: [],
      visualStartLabel: formatMonthLabel(startDate),
    }
  }

  // Визуал начинается с начала текущего года (или с даты начала договора, если она позже)
  const visualStart = startDate.getTime() > currentYearStart.getTime() ? startDate : currentYearStart

  const visualMonths = (endDate.getUTCFullYear() - visualStart.getUTCFullYear()) * 12
    + (endDate.getUTCMonth() - visualStart.getUTCMonth()) + 1
  if (visualMonths <= 0) return null

  const segments: ContractTermSegment[] = []
  for (let i = 0; i < visualMonths; i += 1) {
    const segDate = shiftMonth(visualStart, i)
    const monthsToEnd = (endDate.getUTCFullYear() - segDate.getUTCFullYear()) * 12
      + (endDate.getUTCMonth() - segDate.getUTCMonth())
    let color: ContractTermSegment['color'] = 'blue'
    if (monthsToEnd < 3) color = 'red'
    else if (monthsToEnd < 6) color = 'yellow'
    segments.push({ label: formatMonthLabel(segDate), color })
  }

  return {
    fromLabel: formatMonthLabel(startDate),
    toLabel: formatMonthLabel(endDate),
    monthsTotal,
    segments,
    visualStartLabel: formatMonthLabel(visualStart),
  }
}

type SortState = { key: string | null; direction: 'asc' | 'desc' }

export default function ContractsPage({ onOpenContract }: { onOpenContract: (contractId: number) => void }) {
  const [rows, setRows] = useState<ContractRow[]>([])
  const [contractorOptions, setContractorOptions] = useState<LookupOption[]>([])
  const [dogovorOptions, setDogovorOptions] = useState<LookupOption[]>([])
  const [departmentOptions, setDepartmentOptions] = useState<LookupOption[]>([])
  const [agreementsByContract, setAgreementsByContract] = useState<Record<number, ContractAgreement[]>>({})
  const [expandedContracts, setExpandedContracts] = useState<Set<number>>(new Set())
  const [sortState, setSortState] = useState<SortState>({ key: 'GN_contract_id', direction: 'asc' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editingAgreementId, setEditingAgreementId] = useState<number | null>(null)
  const [draftAgreement, setDraftAgreement] = useState<ContractAgreement | null>(null)
  const [editingPendingDocId, setEditingPendingDocId] = useState<string | null>(null)
  const [draftPendingDoc, setDraftPendingDoc] = useState<{
    id: string
    type: 'contract' | 'agreement'
    number: string
    date: string
    description: string
    amount?: number
    contractName?: string
    department?: string
  } | null>(null)
  const [pendingDocuments, setPendingDocuments] = useState<Array<{
    id: string
    type: 'contract' | 'agreement'
    number: string
    date: string
    description: string
    amount?: number
    contractName?: string
    department?: string
  }>>([])
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  useEffect(() => {
    async function load(): Promise<void> {
      setLoading(true)
      setError(null)

      try {
        const [rowsRes, contractorRes, dogovorRes, agreementsRes, bdrRes, deptRes] = await Promise.all([
          fetch('/api/gn/contracts'),
          fetch('/api/gn/contractors'),
          fetch('/api/gn/dogovors'),
          fetch('/api/gn/contract-additional-agreements'),
          fetch('/api/gn/bdr'),
          fetch('/api/gn/departments'),
        ])

        if (!rowsRes.ok) throw new Error(formatHttpError(rowsRes.status))
        if (!contractorRes.ok) throw new Error(formatHttpError(contractorRes.status))
        if (!dogovorRes.ok) throw new Error(formatHttpError(dogovorRes.status))
        if (!agreementsRes.ok) throw new Error(formatHttpError(agreementsRes.status))
        if (!bdrRes.ok) throw new Error(formatHttpError(bdrRes.status))

        const nextRows = (await rowsRes.json()) as Row[]
        const contractors = (await contractorRes.json()) as Row[]
        const dogovors = (await dogovorRes.json()) as Row[]
        const agreements = (await agreementsRes.json()) as ContractAgreement[]
        const bdrData = (await bdrRes.json()) as Row[]
        const depts = deptRes.ok ? (await deptRes.json()) as Row[] : []

        // Build a map of contract name to contract id (use first occurrence only)
        const contractNameToId: Record<string, number> = {}
        nextRows.forEach((contract) => {
          const contractName = String(contract.GN_contract_name ?? '').trim()
          if (contractName && !contractNameToId[contractName]) {
            contractNameToId[contractName] = Number(contract.GN_contract_id ?? 0)
          }
        })
        
        // Build a map of contract_id to all departments (comma-separated)
        const departmentsByContract: Record<number, string> = {}
        const departmentSets: Record<number, Set<string>> = {}
        
        bdrData.forEach((bdrRow) => {
          const contractName = String(bdrRow['Договор'] ?? '').trim()
          const contractId = contractNameToId[contractName] ?? 0
          const department = String(bdrRow['Подразделение'] ?? '').trim()
          
          if (contractId > 0 && department) {
            if (!departmentSets[contractId]) {
              departmentSets[contractId] = new Set()
            }
            departmentSets[contractId].add(department)
          }
        })
        
        // Convert sets to comma-separated strings
        Object.entries(departmentSets).forEach(([contractId, depts]) => {
          departmentsByContract[Number(contractId)] = Array.from(depts).join(', ')
        })

        const groupedAgreements: Record<number, ContractAgreement[]> = {}
        agreements.forEach((agreement) => {
          const contractId = Number(agreement.GN_contract_id_FK)
          if (!groupedAgreements[contractId]) groupedAgreements[contractId] = []
          groupedAgreements[contractId].push(agreement)
        })

        // Filter documents pending approval
        const pendingDocs: Array<{
          id: string
          type: 'contract' | 'agreement'
          number: string
          date: string
          description: string
          amount?: number
          contractName?: string
          contractId?: number
          department?: string
        }> = []

        // Add contracts pending approval
        nextRows.forEach((contract) => {
          if (contract.GN_contract_approval_status === 'на согласовании') {
            const contractName = String(dogovors.find(d => d.GN_dgv_id === contract.GN_contract_dogovor_FK)?.GN_dogovor || '')
            const contractId = Number(contract.GN_contract_id)
            pendingDocs.push({
              id: `contract-${contract.GN_contract_id}`,
              type: 'contract',
              number: contractName,
              date: String(contract.GN_contract_sed_launch_date || ''),
              description: `Договор: ${contractName}`,
              contractName,
              contractId: contract.GN_contract_id,
              department: departmentsByContract[contractId] || '',
            })
          }
        })

        // Add agreements pending approval
        agreements.forEach((agreement) => {
          if (agreement.GN_additional_agreement_status === 'на согласовании') {
            const contract = nextRows.find(c => c.GN_contract_id === agreement.GN_contract_id_FK)
            const contractName = String(dogovors.find(d => d.GN_dgv_id === contract?.GN_contract_dogovor_FK)?.GN_dogovor || '')
            const contractId = Number(contract?.GN_contract_id ?? 0)
            pendingDocs.push({
              id: `agreement-${agreement.GN_additional_agreement_id}`,
              type: 'agreement',
              number: agreement.GN_additional_agreement_number,
              date: agreement.GN_additional_agreement_date,
              description: agreement.GN_additional_agreement_description,
              amount: agreement.GN_additional_agreement_amount,
              contractName,
              department: departmentsByContract[contractId] || '',
            })
          }
        })

        const converted = nextRows.map((row) => {
          const converted = toRow(row)
          converted.GN_contract_department = departmentsByContract[converted.GN_contract_id] || ''
          return converted
        })
        setRows(converted)
        setContractorOptions(mapLookupOptions(contractors, 'GN_c_id', 'GN_contarctor'))
        setDogovorOptions(mapLookupOptions(dogovors, 'GN_dgv_id', 'GN_dogovor'))
        setDepartmentOptions(depts.map((d) => ({ value: String(d.GN_department ?? ''), label: String(d.GN_department ?? '') })))
        setAgreementsByContract(groupedAgreements)
        setPendingDocuments(pendingDocs)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить данные')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  // Update pending documents when data changes
  useEffect(() => {
    const pendingDocs: Array<{
      id: string
      type: 'contract' | 'agreement'
      number: string
      date: string
      description: string
      amount?: number
      contractName?: string
    }> = []

    // Add contracts pending approval
    rows.forEach((contract) => {
      if (contract.GN_contract_approval_status === 'на согласовании') {
        const contractName = dogovorOptions.find(d => d.value === String(contract.GN_contract_dogovor_FK))?.label || ''
        pendingDocs.push({
          id: `contract-${contract.GN_contract_id}`,
          type: 'contract',
          number: contractName,
          date: contract.GN_contract_sed_launch_date,
          description: `Договор: ${contractName}`,
          contractName,
          contractId: contract.GN_contract_id,
        })
      }
    })

    // Add agreements pending approval
    Object.values(agreementsByContract).flat().forEach((agreement) => {
      if (agreement.GN_additional_agreement_status === 'на согласовании') {
        const contract = rows.find(c => c.GN_contract_id === agreement.GN_contract_id_FK)
        const contractName = dogovorOptions.find(d => d.value === String(contract?.GN_contract_dogovor_FK))?.label || ''
        pendingDocs.push({
          id: `agreement-${agreement.GN_additional_agreement_id}`,
          type: 'agreement',
          number: agreement.GN_additional_agreement_number,
          date: agreement.GN_additional_agreement_date,
          description: agreement.GN_additional_agreement_description,
          amount: agreement.GN_additional_agreement_amount,
          contractName,
          contractId: contract?.GN_contract_id,
        })
      }
    })

    setPendingDocuments(pendingDocs)
  }, [rows, agreementsByContract, dogovorOptions])

  function toggleContractAgreements(contractId: number): void {
    setExpandedContracts((prev) => {
      const next = new Set(prev)
      if (next.has(contractId)) {
        next.delete(contractId)
      } else {
        next.add(contractId)
      }
      return next
    })
  }

  function toggleSort(key: string): void {
    setSortState((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        }
      }
      return {
        key,
        direction: 'asc',
      }
    })
  }

  function getSortMark(key: string): string {
    if (sortState.key !== key) return '↕'
    return sortState.direction === 'asc' ? '↑' : '↓'
  }

  function compareValues(left: unknown, right: unknown, direction: 'asc' | 'desc'): number {
    const factor = direction === 'asc' ? 1 : -1
    if (left == null && right == null) return 0
    if (left == null) return factor
    if (right == null) return -factor

    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * factor
    }

    const leftStr = String(left).toLowerCase()
    const rightStr = String(right).toLowerCase()
    return leftStr.localeCompare(rightStr, 'ru') * factor
  }

  function getSortedActiveRows(): ContractRow[] {
    let activeRows = rows.filter(row => String(row.GN_contract_approval_status ?? 'действующий') === 'действующий')

    // Apply column filters
    Object.entries(columnFilters).forEach(([key, filterValue]) => {
      const normalized = filterValue.trim().toLowerCase()
      if (!normalized) return
      activeRows = activeRows.filter((row) => {
        let displayValue: string
        if (key === 'GN_contract_contractor_FK') {
          displayValue = displayLookupLabel(contractorOptions, row[key as keyof ContractRow])
        } else if (key === 'GN_contract_dogovor_FK') {
          displayValue = displayLookupLabel(dogovorOptions, row[key as keyof ContractRow])
        } else {
          displayValue = String(row[key as keyof ContractRow] ?? '')
        }
        return displayValue.toLowerCase().includes(normalized)
      })
    })

    if (!sortState.key) {
      return activeRows
    }

    return [...activeRows].sort((left, right) => {
      const leftVal = left[sortState.key as keyof ContractRow]
      const rightVal = right[sortState.key as keyof ContractRow]

      // For lookup columns, compare by label instead of id
      if (sortState.key === 'GN_contract_contractor_FK' || sortState.key === 'GN_contract_dogovor_FK') {
        const options = sortState.key === 'GN_contract_contractor_FK' ? contractorOptions : dogovorOptions
        const leftLabel = displayLookupLabel(options, leftVal)
        const rightLabel = displayLookupLabel(options, rightVal)
        return compareValues(leftLabel, rightLabel, sortState.direction)
      }

      return compareValues(leftVal, rightVal, sortState.direction)
    })
  }

  function startEditAgreement(agreement: ContractAgreement): void {
    setEditingAgreementId(agreement.GN_additional_agreement_id)
    setDraftAgreement({ ...agreement })
    setSaveError(null)
  }

  function cancelAgreementEdit(): void {
    setEditingAgreementId(null)
    setDraftAgreement(null)
    setSaveError(null)
  }

  async function saveAgreementEdit(): Promise<void> {
    if (editingAgreementId == null || draftAgreement == null) return

    setSaveError(null)

    try {
      const response = await fetch(`/api/gn/contract-additional-agreements/${editingAgreementId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: draftAgreement.GN_contract_id_FK,
          number: draftAgreement.GN_additional_agreement_number,
          date: draftAgreement.GN_additional_agreement_date,
          description: draftAgreement.GN_additional_agreement_description,
          amount: draftAgreement.GN_additional_agreement_amount,
          approvalStatus: draftAgreement.GN_additional_agreement_status,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || formatHttpError(response.status))
      }

      const updatedAgreement = (await response.json()) as ContractAgreement
      setAgreementsByContract((prev) => ({
        ...prev,
        [updatedAgreement.GN_contract_id_FK]: (prev[updatedAgreement.GN_contract_id_FK] ?? []).map((agreement) =>
          agreement.GN_additional_agreement_id === editingAgreementId ? updatedAgreement : agreement
        ),
      }))
      cancelAgreementEdit()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить изменения')
    }
  }

  function updateAgreementDraft(field: keyof ContractAgreement, value: string | number): void {
    setDraftAgreement((prevAgreement) => {
      if (!prevAgreement) return prevAgreement

      if (field === 'GN_additional_agreement_amount') {
        return { ...prevAgreement, [field]: Number(value) }
      }

      return { ...prevAgreement, [field]: value }
    })
  }

  function getAgreementDraftValue(field: keyof ContractAgreement): string {
    if (!draftAgreement) return ''
    const value = draftAgreement[field]
    if (field === 'GN_additional_agreement_amount') {
      return String(value ?? 0)
    }
    if (field === 'GN_additional_agreement_date' && typeof value === 'string') {
      return value.slice(0, 10) // Extract date part
    }
    return String(value ?? '')
  }


  function updatePendingDocDraft(field: string, value: string | number): void {
    setDraftPendingDoc((prevDoc) => {
      if (!prevDoc) return prevDoc

      if (field === 'amount') {
        return { ...prevDoc, [field]: Number(value) }
      }

      return { ...prevDoc, [field]: value }
    })
  }

  function getPendingDocDraftValue(field: string): string {
    if (!draftPendingDoc) return ''
    const value = (draftPendingDoc as any)[field]
    if (field === 'amount') {
      return String(value ?? 0)
    }
    return String(value ?? '')
  }

  // Add-contract quick form state
  const [showAddContractForm, setShowAddContractForm] = useState(false)
  const [newContractorId, setNewContractorId] = useState('')
  const [newDogovorId, setNewDogovorId] = useState('')
  const [newDogovorStatus, setNewDogovorStatus] = useState('на согласовании')
  const [newSide, setNewSide] = useState('')
  const [newAsezNumber, setNewAsezNumber] = useState('')

  // Фильтрует список договоров по выбранному контрагенту
  const filteredDogovorOptions = newContractorId
    ? dogovorOptions.filter((opt) => opt.meta && String(opt.meta.GN_contarctor_FK) === newContractorId)
    : dogovorOptions

  async function addPendingContract(): Promise<void> {
    if (!newDogovorId) return
    const selectedDogovor = dogovorOptions.find((opt) => opt.value === newDogovorId)
    if (!selectedDogovor) return

    const contractorFk = newContractorId ? Number(newContractorId) : Number(selectedDogovor.meta?.GN_contarctor_FK ?? 0)
    if (!contractorFk) {
      setSaveError('Не найден контрагент для выбранного договора')
      return
    }

    setSaveError(null)
    try {
      const payload = {
        GN_contract_contractor_FK: contractorFk,
        GN_contract_dogovor_FK: Number(newDogovorId),
        GN_contract_sed_launch_date: new Date().toISOString().slice(0, 10),
        GN_contract_asez_load_date: new Date().toISOString().slice(0, 10),
        GN_contract_state: '',
        GN_contract_approval_status: newDogovorStatus,
        GN_contract_side: newSide,
        GN_contract_asez_number: newAsezNumber,
      }

      const response = await fetch('/api/gn/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const payloadErr = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payloadErr.error || formatHttpError(response.status))
      }

      const created = await response.json()

      setRows((prev) => [toRow(created), ...prev])

      const id = `contract-${created.GN_contract_id ?? `new-${Date.now()}`}`
      const contractName = selectedDogovor.label
      setPendingDocuments((prev) => [
        {
          id,
          type: 'contract',
          number: contractName,
          date: created.GN_contract_sed_launch_date || new Date().toISOString().slice(0, 10),
          description: `Договор: ${contractName}`,
          contractName,
        },
        ...prev,
      ])

      setNewContractorId('')
      setNewDogovorId('')
      setNewDogovorStatus('на согласовании')
      setNewSide('')
      setNewAsezNumber('')
      setShowAddContractForm(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось создать договор')
    }
  }

  return (
    <section className="guide invest-program-section transparent-section contracts-page-no-bg">
      <div className="guide-section invest-program-content">
        {loading && <p className="hint">Загрузка данных...</p>}
        {error && <p className="hint hint--error">Ошибка: {error}</p>}
        {saveError && <p className="hint hint--error">Ошибка сохранения: {saveError}</p>}

        {!loading && !error && (
          <div>
            {/* Documents pending approval */}
            <div className="guide-table-wrap invest-program-table-wrap section-bottom-space">
              <div className="form-fields-inline" style={{ marginBottom: '10px' }}>
              <button
                type="button"
                className="page-action-btn page-action-btn--success"
                onClick={() => setShowAddContractForm((prev) => !prev)}
              >
                {showAddContractForm ? 'Отмена' : 'Добавить договор на контроль'}
              </button>
            </div>
            {showAddContractForm && (
              <div style={{ marginBottom: '10px' }}>
                <div className="form-fields-inline" style={{ marginBottom: '6px' }}>
                  <select
                    value={newContractorId}
                    onChange={(e) => { setNewContractorId(e.target.value); setNewDogovorId('') }}
                  >
                    <option value="">Контрагент (все)</option>
                    {contractorOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newDogovorId}
                    onChange={(e) => setNewDogovorId(e.target.value)}
                  >
                    <option value="">Выберите договор</option>
                    {filteredDogovorOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select value={newDogovorStatus} onChange={(e) => setNewDogovorStatus(e.target.value)}>
                    <option value="на согласовании">на согласовании</option>
                    <option value="действующий">действующий</option>
                  </select>
                </div>
                <div className="form-fields-inline" style={{ marginBottom: '6px' }}>
                  <select
                    value={newSide}
                    onChange={(e) => setNewSide(e.target.value)}
                  >
                    <option value="">Сторона (подразделение)</option>
                    {departmentOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Номер АСЭЗ"
                    value={newAsezNumber}
                    onChange={(e) => setNewAsezNumber(e.target.value)}
                  />
                  <button
                    type="button"
                    className="page-action-btn page-action-btn--success"
                    onClick={addPendingContract}
                    disabled={!newDogovorId}
                  >
                    Добавить
                  </button>
                </div>
              </div>
            )}
            <h3 className="section-title section-title--warning">На согласовании</h3>
              <table className="guide-table table-compact invest-program-table-min">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Тип</th>
                      <th>Подразделение</th>
                      <th>Номер</th>
                      <th>Дата</th>
                      <th>Описание</th>
                      <th>Сумма</th>
                      <th>Договор</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingDocuments.map((doc, rowIndex) => {
                      const isEditingDoc = editingPendingDocId === doc.id && draftPendingDoc != null
                      return (
                        <tr key={doc.id}>
                          <td className="invest-program-row-number">{rowIndex + 1}</td>
                          <td>
                            <span className={`doc-type-badge ${doc.type === 'contract' ? 'doc-type-badge--contract' : 'doc-type-badge--agreement'}`}>
                              {doc.type === 'contract' ? 'Договор' : 'Доп. соглашение'}
                            </span>
                          </td>
                          <td>
                            <span className="invest-program-cell-text">{doc.department || ''}</span>
                          </td>
                          <td>
                            {isEditingDoc ? (
                              <input
                                type="text"
                                value={getPendingDocDraftValue('number')}
                                onChange={(e) => updatePendingDocDraft('number', e.target.value)}
                                className="guide-input"
                              />
                            ) : (
                              doc.number
                            )}
                          </td>
                          <td>
                            {isEditingDoc ? (
                              <input
                                type="date"
                                value={getPendingDocDraftValue('date')}
                                onChange={(e) => updatePendingDocDraft('date', e.target.value)}
                                className="guide-input"
                              />
                            ) : (
                              doc.date ? formatDateDisplay(doc.date) : ''
                            )}
                          </td>
                          <td>
                            {isEditingDoc ? (
                              <input
                                type="text"
                                value={getPendingDocDraftValue('description')}
                                onChange={(e) => updatePendingDocDraft('description', e.target.value)}
                                className="guide-input"
                              />
                            ) : (
                              doc.description
                            )}
                          </td>
                          <td>
                            {isEditingDoc ? (
                              <input
                                type="number"
                                value={getPendingDocDraftValue('amount')}
                                onChange={(e) => updatePendingDocDraft('amount', e.target.value)}
                                className="guide-input"
                              />
                            ) : (
                              doc.amount !== undefined ? Number(doc.amount).toLocaleString('ru-RU', {
                                style: 'currency',
                                currency: 'RUB',
                              }) : ''
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="contract-cell-button"
                              disabled={!doc.contractId}
                              onClick={() => doc.contractId && onOpenContract(doc.contractId)}
                            >
                              {doc.contractName || '-'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
       <h3 className="section-title section-title--success">Действующие договора</h3>
            {/* Main contracts table */}
            <div className="guide-table-wrap invest-program-table-wrap">
              <table className="guide-table table-compact invest-program-table-min contracts-active-table">
              <thead>
                <tr>
                  <th>
                    <button className="contract-sort-btn" type="button" onClick={() => toggleSort('GN_contract_id')} title="Сортировать по №">
                      № {getSortMark('GN_contract_id')}
                    </button>
                  </th>
                  {DISPLAY_COLUMNS.map((column) => (
                    <th key={column.key}>
                      <button className="contract-sort-btn" type="button" onClick={() => toggleSort(column.key)} title={`Сортировать по ${column.label}`}>
                        {column.label} {getSortMark(column.key)}
                      </button>
                    </th>
                  ))}
                  <th>Срок по месяцам</th>
                  <th>ДС</th>
                </tr>
                <tr>
                  <td></td>
                  {DISPLAY_COLUMNS.map((column) => (
                    <td key={`filter-${column.key}`}>
                      <input
                        className="guide-input contract-filter-input"
                        value={columnFilters[column.key] ?? ''}
                        onChange={(e) => setColumnFilters((prev) => ({ ...prev, [column.key]: e.target.value }))}
                        placeholder="фильтр"
                      />
                    </td>
                  ))}
                  <td></td>
                  <td></td>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const activeRows = getSortedActiveRows()
                  return activeRows.map((row, rowIndex) => (
                    <Fragment key={`contract-block-${row.GN_contract_id}`}>
                      <tr key={`contract-${row.GN_contract_id}`}>
                    <td className="invest-program-row-number">{rowIndex + 1}</td>
                    {DISPLAY_COLUMNS.map((column) => {
                        if (column.kind === 'lookup') {
                          const options = column.key === 'GN_contract_contractor_FK' ? contractorOptions : dogovorOptions
                          const label = displayLookupLabel(options, row[column.key as keyof ContractRow])
                          const narrowClass = column.narrow ? 'contracts-cell-narrow' : ''
                          return (
                            <td key={column.key} className={narrowClass}>
                              {column.key === 'GN_contract_dogovor_FK' ? (
                                <button
                                  type="button"
                                  className="contract-cell-button contracts-cell-truncate"
                                  onClick={() => onOpenContract(row.GN_contract_id)}
                                  title={label}
                                >
                                  {label}
                                </button>
                              ) : (
                                <span className="invest-program-cell-text contracts-cell-truncate" title={label}>{label}</span>
                              )}
                            </td>
                          )
                        }

                        if (column.kind === 'date') {
                          const value = String(row[column.key as keyof ContractRow] ?? '')
                          return (
                            <td key={column.key}>
                              <span className="invest-program-cell-text">{formatDateDisplay(value)}</span>
                            </td>
                          )
                        }

                        if (column.kind === 'status') {
                          const statusValue = String(row[column.key as keyof ContractRow] ?? 'действующий')
                          const statusClass = statusValue === 'на согласовании'
                            ? 'status-cell status-cell--pending'
                            : statusValue === 'действующий'
                              ? 'status-cell status-cell--active'
                              : statusValue === 'не действующий'
                                ? 'status-cell status-cell--inactive'
                                : 'status-cell'
                          return (
                            <td key={column.key} className={statusClass}>
                              <span className={`invest-program-cell-text status-label ${statusClass}`}>{statusValue}</span>
                            </td>
                          )
                        }

                        const value = String(row[column.key as keyof ContractRow] ?? '')
                        const narrowClass = column.narrow ? 'contracts-cell-narrow' : ''
                        return (
                          <td key={column.key} className={narrowClass}>
                            <span className="invest-program-cell-text contracts-cell-truncate" title={value}>{value}</span>
                          </td>
                        )
                      })}
                      <td>
                        {(() => {
                          const termVisual = buildContractTermVisual(
                            String(row.GN_contract_term_from ?? ''),
                            String(row.GN_contract_term_to ?? ''),
                          )

                          if (!termVisual) {
                            return <span className="contracts-term-empty">нет данных</span>
                          }

                          return (
                            <div className="contracts-term-visual" title={`${termVisual.fromLabel} – ${termVisual.toLabel}, всего ${termVisual.monthsTotal} мес.`}>
                              <div className="contracts-term-range">
                                <span>{termVisual.segments.length > 0 ? termVisual.visualStartLabel : termVisual.fromLabel}</span>
                                <span>{termVisual.toLabel}</span>
                              </div>
                              <div className="contracts-term-track" aria-label={`Срок договора ${termVisual.monthsTotal} месяцев`}>
                                {termVisual.segments.map((seg, monthIndex) => (
                                  <span
                                    key={`${row.GN_contract_id}-${seg.label}-${monthIndex}`}
                                    className={`contracts-term-segment contracts-term-segment--${seg.color}`}
                                    title={seg.label}
                                  />
                                ))}
                              </div>
                              <div className="contracts-term-meta">{termVisual.monthsTotal} мес. — до {termVisual.toLabel}</div>
                            </div>
                          )
                        })()}
                      </td>
                      <td className="invest-program-actions-cell">
                        {(() => {
                          const contractAgreements = agreementsByContract[row.GN_contract_id] ?? []
                          const agreementCount = contractAgreements.length
                          const hasAgreements = agreementCount > 0
                          const isExpanded = expandedContracts.has(row.GN_contract_id)

                          return (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              {hasAgreements ? (
                                <button
                                  type="button"
                                  className="invest-program-row-action-button invest-program-row-action-button--secondary"
                                  onClick={() => toggleContractAgreements(row.GN_contract_id)}
                                  aria-label={isExpanded ? `Скрыть ${agreementCount} дополнительных соглашений` : `Показать ${agreementCount} дополнительных соглашений`}
                                >
                                  {isExpanded ? `− ${agreementCount}` : `+ ${agreementCount}`}
                                </button>
                              ) : (
                                <span className="invest-program-cell-text">нет</span>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                    </tr>
                    {(() => {
                      const contractAgreements = agreementsByContract[row.GN_contract_id] ?? []
                      if (contractAgreements.length === 0 || !expandedContracts.has(row.GN_contract_id)) {
                        return null
                      }

                      return (
                        <tr key={`agreements-${row.GN_contract_id}`} className="contracts-agreements-row">
                          <td colSpan={ACTIVE_TABLE_COLSPAN} className="contracts-agreements-cell">
                            <div className="contracts-agreements-nested">
                              <div className="contracts-agreements-title">Дополнительные соглашения</div>
                              <table className="guide-table table-compact contracts-agreements-table">
                                <thead>
                                  <tr>
                                    <th>Номер</th>
                                    <th>Дата</th>
                                    <th>Описание</th>
                                    <th>Сумма</th>
                                    <th>Статус</th>
                                    <th>Действия</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {contractAgreements.map((agreement) => {
                                    const isAgreementEditing = editingAgreementId === agreement.GN_additional_agreement_id && draftAgreement != null

                                    return (
                                      <tr key={agreement.GN_additional_agreement_id}>
                                        <td>
                                          {isAgreementEditing ? (
                                            <input
                                              className="invest-program-inline-input"
                                              value={getAgreementDraftValue('GN_additional_agreement_number')}
                                              onChange={(event) => updateAgreementDraft('GN_additional_agreement_number', event.target.value)}
                                            />
                                          ) : (
                                            agreement.GN_additional_agreement_number
                                          )}
                                        </td>
                                        <td>
                                          {isAgreementEditing ? (
                                            <input
                                              className="invest-program-inline-input"
                                              type="date"
                                              value={getAgreementDraftValue('GN_additional_agreement_date')}
                                              onChange={(event) => updateAgreementDraft('GN_additional_agreement_date', event.target.value)}
                                            />
                                          ) : (
                                            formatDateDisplay(agreement.GN_additional_agreement_date)
                                          )}
                                        </td>
                                        <td>
                                          {isAgreementEditing ? (
                                            <input
                                              className="invest-program-inline-input"
                                              value={getAgreementDraftValue('GN_additional_agreement_description')}
                                              onChange={(event) => updateAgreementDraft('GN_additional_agreement_description', event.target.value)}
                                            />
                                          ) : (
                                            agreement.GN_additional_agreement_description
                                          )}
                                        </td>
                                        <td>
                                          {isAgreementEditing ? (
                                            <input
                                              className="invest-program-inline-input"
                                              type="number"
                                              step="0.01"
                                              value={getAgreementDraftValue('GN_additional_agreement_amount')}
                                              onChange={(event) => updateAgreementDraft('GN_additional_agreement_amount', event.target.value)}
                                            />
                                          ) : (
                                            Number(agreement.GN_additional_agreement_amount).toLocaleString('ru-RU', {
                                              style: 'currency',
                                              currency: 'RUB',
                                            })
                                          )}
                                        </td>
                                        <td>
                                          {(() => {
                                            const agreementStatusValue = isAgreementEditing ? getAgreementDraftValue('GN_additional_agreement_status') : (agreement.GN_additional_agreement_status || 'действующий')
                                            const statusClass = agreementStatusValue === 'на согласовании'
                                              ? 'status-cell status-cell--pending'
                                              : agreementStatusValue === 'действующий'
                                                ? 'status-cell status-cell--active'
                                                : 'status-cell'
                                            return isAgreementEditing ? (
                                              <select
                                                className={`invest-program-cell-select status-select ${statusClass}`}
                                                value={agreementStatusValue}
                                                onChange={(event) => updateAgreementDraft('GN_additional_agreement_status', event.target.value)}
                                              >
                                                <option value="действующий">действующий</option>
                                                <option value="на согласовании">на согласовании</option>
                                              </select>
                                            ) : (
                                              <span className={`status-label ${statusClass}`}>
                                                {agreementStatusValue}
                                              </span>
                                            )
                                          })()}
                                        </td>
                                        <td>
                                          {isAgreementEditing ? (
                                            <>
                                              <button type="button" className="invest-program-row-action-button" onClick={() => void saveAgreementEdit()}>
                                                СОХР
                                              </button>
                                              <button
                                                type="button"
                                                className="invest-program-row-action-button invest-program-row-action-button--secondary"
                                                onClick={cancelAgreementEdit}
                                              >
                                                ОТМ
                                              </button>
                                            </>
                                          ) : (
                                            <button type="button" className="invest-program-row-action-button" onClick={() => startEditAgreement(agreement)}>
                                              ИЗМ
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )
                    })()}
                    </Fragment>
                  ))
                })()}
              </tbody>
            </table>
          </div>
          </div>
        )}
        {/* Archive table for inactive contracts */}
        {!loading && !error && (() => {
          const inactiveForVisibility = rows.filter(row => String(row.GN_contract_approval_status ?? 'действующий') === 'не действующий')
          return inactiveForVisibility.length > 0
        })() && (
          <div className="guide-table-wrap invest-program-table-wrap section-top-space">
            <h3 className="section-title section-title--danger">Архив (не действующие договора)</h3>
            <table className="guide-table table-compact invest-program-table-min">
              <thead>
                <tr>
                  <th>№</th>
                  {DISPLAY_COLUMNS.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const inactiveRows = rows.filter(row => String(row.GN_contract_approval_status ?? 'действующий') === 'не действующий')
                  return inactiveRows.map((row, rowIndex) => (
                    <Fragment key={`archive-contract-block-${row.GN_contract_id}`}>
                      <tr key={`archive-contract-${row.GN_contract_id}`}>
                        <td className="invest-program-row-number">{rowIndex + 1}</td>
                        {DISPLAY_COLUMNS.map((column) => {
                          if (column.kind === 'lookup') {
                            const options = column.key === 'GN_contract_contractor_FK' ? contractorOptions : dogovorOptions
                            const label = displayLookupLabel(options, row[column.key as keyof ContractRow])
                            return (
                              <td key={column.key}>
                                {column.key === 'GN_contract_dogovor_FK' ? (
                                  <button
                                    type="button"
                                    className="contract-cell-button"
                                    onClick={() => onOpenContract(row.GN_contract_id)}
                                  >
                                    {label}
                                  </button>
                                ) : (
                                  <span className="invest-program-cell-text">{label}</span>
                                )}
                              </td>
                            )
                          }

                          if (column.kind === 'date') {
                            const value = String(row[column.key as keyof ContractRow] ?? '')
                            return (
                              <td key={column.key}>
                                <span className="invest-program-cell-text">{formatDateDisplay(value)}</span>
                              </td>
                            )
                          }

                          if (column.kind === 'status') {
                            const statusValue = String(row[column.key as keyof ContractRow] ?? 'действующий')
                            const statusClass = statusValue === 'на согласовании'
                              ? 'status-cell status-cell--pending'
                              : statusValue === 'действующий'
                                ? 'status-cell status-cell--active'
                                : statusValue === 'не действующий'
                                  ? 'status-cell status-cell--inactive'
                                  : 'status-cell'
                            return (
                              <td key={column.key} className={statusClass}>
                                <span className={`invest-program-cell-text status-label ${statusClass}`}>{statusValue}</span>
                              </td>
                            )
                          }

                          const value = String(row[column.key as keyof ContractRow] ?? '')
                          return (
                            <td key={column.key}>
                              <span className="invest-program-cell-text">{value}</span>
                            </td>
                          )
                        })}
                        <td className="invest-program-actions-cell">
                        </td>
                      </tr>
                    </Fragment>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </section>
  )
}