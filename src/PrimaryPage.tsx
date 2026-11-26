import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import * as XLSXStyle from 'xlsx-js-style'
import ExcelActionToolbar from './components/ExcelActionToolbar'
import SearchableSelect from './components/PrimarySearchableSelect'
import PrimaryPaymentPlan, { formatBdr26Corr, PAYMENT_PLAN_HEADERS, type PaymentPlanRow } from './components/PrimaryPaymentPlan'
import PrimaryExcelImport from './PrimaryExcelImport'
import { formatHttpError } from './utils/httpUtils'
import { fetchReferences } from './utils/referenceRequests'
import { buildBdr26CorrIndex, buildBdrBudgetItemIndex, buildBdrExpenseDepartmentIndex, completePrimarySelection, getBdr26Corr, getBdr26Summary, getBdrBudgetItemCodes, getBdrBudgetItems, getBdrContractorIds, getBdrExpenseDepartments, getBdrPaymentDetails, parseBdrOptions, primaryBdrProgress, primaryBdrSearchText, sumBdr26Corr, type BdrExpenseOption } from './utils/primaryBdr'
import { primaryContractLabel as contractLabel } from './utils/primaryExcel'
import { formatBudgetDepartment } from './budget/budgetDepartment'
import { personalAccountOptions } from '../shared/personalAccounts'
import { PRIMARY_MONTHS, PRIMARY_QUARTERS, primaryMonthStatusClass, type PrimaryMonth } from '../shared/primaryMonths'

type Lookup = {
  id: number
  label: string
  personalAccount?: string
  contractor?: string
  contractorId?: number
  contractWindowId?: number
  contractRemainingLimit?: number | null
  date?: string
  departmentIds?: number[]
}
type PrimaryMonthData = {
  amountWithVat: number | string | null
  edoArrivalDate: string | null
  sedLaunchDate: string | null
  sedLaunched: boolean
  acceptedIn1C: boolean
  note: string
}
type PrimaryDocument = {
  id: number
  departmentId: number | null
  department: string | null
  objectIds: number[]
  objects: Lookup[]
  expenseDepartments: Lookup[]
  budgetItemIds: number[]
  budgetItems: Lookup[]
  contractId: number | null
  contract: string | null
  personalAccount: string | null
  month: PrimaryMonth
  details: string
  detailsEnabled: boolean
  generalNote: string
  monthData: Partial<Record<PrimaryMonth, PrimaryMonthData>>
}
type Draft = {
  departmentId: string
  objectIds: string[]
  expenseDepartmentIds: string[]
  budgetItemIds: string[]
  contractorId: string
  contractId: string
  personalAccount: string
  month: PrimaryMonth
  amountWithVat: string
  details: string
  detailsEnabled: boolean
  generalNote: string
  edoArrivalDate: string
  sedLaunchDate: string
  sedLaunched: boolean
  acceptedIn1C: boolean
  note: string
}
type MonthDraft = Pick<Draft, 'amountWithVat' | 'sedLaunched' | 'acceptedIn1C' | 'note'>
type ColumnKey = 'department' | 'objects' | 'contractor' | 'contract' | 'expenseDepartment' | 'budgetItem' | 'bdr26Corr' | 'personalAccount' | 'generalNote' | 'amountWithVat' | 'sedLaunched' | 'acceptedIn1C' | 'note'
type ColumnWidthKey = ColumnKey | `${PrimaryMonth}:${ColumnKey}`
type Column = { key: ColumnKey; label: string }

const BDR_COLUMN: Column = { key: 'bdr26Corr', label: 'БДР26корр' }
const GENERAL_NOTE_COLUMN: Column = { key: 'generalNote', label: 'Общее примечания' }
const BASE_COLUMNS: Column[] = [
  { key: 'department', label: 'Подписант (расходы)' },
  { key: 'objects', label: 'Объект' },
  { key: 'contractor', label: 'Контрагенты' },
  { key: 'contract', label: 'Договора (лицевой счет)' },
  { key: 'budgetItem', label: 'Статья бюджета' },
  BDR_COLUMN,
  GENERAL_NOTE_COLUMN,
]
const LEADING_COLUMNS = BASE_COLUMNS.filter(({ key }) => key !== BDR_COLUMN.key && key !== GENERAL_NOTE_COLUMN.key)
const EXPORT_LEADING_HEADERS = ['Подразделение записи', 'Объект', 'Контрагенты', 'Договор', 'На кого расходы', 'Статья бюджета', 'Лицевой счет']
const MONTH_COLUMNS: Column[] = [
  { key: 'amountWithVat', label: 'Сумма с НДС' },
  { key: 'sedLaunched', label: 'Запущен в СЭД' },
  { key: 'acceptedIn1C', label: 'Принято на учет в 1С' },
  { key: 'note', label: 'Примечание' },
]
const MONTH_COLUMN_KEYS = new Set<ColumnKey>(MONTH_COLUMNS.map(({ key }) => key))
const WIDTHS_STORAGE_KEY = 'primary-table-column-widths-compact-v2'
const COLUMN_WIDTHS: Record<ColumnKey, number> = {
  department: 150,
  contractor: 90,
  objects: 80,
  contract: 140,
  expenseDepartment: 110,
  budgetItem: 110,
  bdr26Corr: 100,
  personalAccount: 75,
  generalNote: 120,
  amountWithVat: 100,
  sedLaunched: 80,
  acceptedIn1C: 100,
  note: 80,
}
const EMPTY_DRAFT: Draft = {
  departmentId: '',
  objectIds: [],
  expenseDepartmentIds: [],
  budgetItemIds: [],
  contractorId: '',
  contractId: '',
  personalAccount: '',
  month: 'october',
  amountWithVat: '0',
  details: '',
  detailsEnabled: false,
  generalNote: '',
  edoArrivalDate: '',
  sedLaunchDate: '',
  sedLaunched: false,
  acceptedIn1C: false,
  note: '',
}

function readWidths(): Partial<Record<ColumnWidthKey, number>> {
  try {
    const stored = localStorage.getItem(WIDTHS_STORAGE_KEY)
    if (!stored) return {}
    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => (
      typeof value === 'number' && Number.isFinite(value) && value >= 50
    ))) as Partial<Record<ColumnWidthKey, number>>
  } catch {
    return {}
  }
}

function labelList(values: Lookup[]): string {
  return values.map(({ label }) => label).join('; ')
}

function renderBdrProgress(
  summary: { amount: number; count: number } | null,
  amounts: Array<number | string | null | undefined>,
  contractRemainingLimit: number | null,
): React.ReactElement {
  const budget = summary?.amount ?? null
  const { total, percent } = primaryBdrProgress(budget, amounts)
  const filled = percent === null ? 0 : Math.max(0, Math.min(100, percent))
  const details = [
    `В бюджете по ЛС: ${summary === null ? 'нет данных' : `${formatBdr26Corr(summary.amount)} (${summary.count} стр.)`}`,
    `Расход за год, с НДС: ${total === null ? 'некорректное значение' : formatBdr26Corr(total)}`,
    percent === null ? 'Прогресс не рассчитан' : `Выполнение бюджета по ЛС: ${percent.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`,
    `Остаток лимита договора: ${contractRemainingLimit === null ? 'нет данных' : formatBdr26Corr(contractRemainingLimit)}`,
  ]
  const description = details.join('\n')
  return (
    <>
      <span
        className={`equipment-dashboard-percent__track primary-table__bdr-progress${percent !== null && percent > 100 ? ' primary-table__bdr-progress--over' : ''}`}
        role={percent === null ? 'img' : 'progressbar'}
        aria-label={description}
        aria-valuemin={percent === null ? undefined : 0}
        aria-valuemax={percent === null ? undefined : 100}
        aria-valuenow={percent === null ? undefined : filled}
        aria-valuetext={percent === null ? undefined : description}
      >
        <span style={{ width: `${filled}%` }} />
      </span>
      {details.map((line) => (
        <div key={line}>
          {line.startsWith('Остаток лимита договора:') ? <em>{line}</em> : line}
        </div>
      ))}
    </>
  )
}

function monthLabel(month: PrimaryMonth): string {
  return PRIMARY_MONTHS.find((item) => item.key === month)?.label ?? month
}

export default function PrimaryPage({ onOpenContract }: { onOpenContract: (contractId: number) => void }): React.ReactElement {
  const [rows, setRows] = useState<PrimaryDocument[]>([])
  const [departments, setDepartments] = useState<Lookup[]>([])
  const [contractors, setContractors] = useState<Lookup[]>([])
  const [objects, setObjects] = useState<Lookup[]>([])
  const [contracts, setContracts] = useState<Lookup[]>([])
  const [bdrOptions, setBdrOptions] = useState<BdrExpenseOption[]>([])
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [monthDrafts, setMonthDrafts] = useState<Record<number, MonthDraft>>({})
  const [monthEdit, setMonthEdit] = useState<PrimaryMonth | null>(null)
  const [savingMonth, setSavingMonth] = useState(false)
  const [quarter, setQuarter] = useState(3)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [columnFilters, setColumnFilters] = useState<Partial<Record<ColumnKey, string>>>({})
  const [sort, setSort] = useState<{ key: ColumnKey; month?: PrimaryMonth; direction: 'asc' | 'desc' }>({ key: 'contractor', direction: 'asc' })
  const [widths, setWidths] = useState<Partial<Record<ColumnWidthKey, number>>>(readWidths)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [bdrRefreshError, setBdrRefreshError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPopup, setImportPopup] = useState<HTMLElement | null>(null)
  const [paymentPopup, setPaymentPopup] = useState<{ container: HTMLElement; month: PrimaryMonth } | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [expandedMonths, setExpandedMonths] = useState<Partial<Record<PrimaryMonth, boolean>>>({})
  const resizeRef = useRef<{ key: ColumnWidthKey; startX: number; startWidth: number } | null>(null)
  const bdrRequestRef = useRef(0)
  const importPopupRef = useRef<Window | null>(null)
  const paymentPopupRef = useRef<Window | null>(null)
  const importSavingRef = useRef(false)

  useEffect(() => () => {
    importPopupRef.current?.close()
    paymentPopupRef.current?.close()
  }, [])

  function closeImportPopup(): void {
    const popup = importPopupRef.current
    importPopupRef.current = null
    setImportPopup(null)
    setImportFile(null)
    popup?.close()
  }

  function closePaymentPopup(): void {
    const popup = paymentPopupRef.current
    paymentPopupRef.current = null
    setPaymentPopup(null)
    popup?.close()
  }

  function openPaymentPopup(month: PrimaryMonth): void {
    setPaymentError(null)
    const existing = paymentPopupRef.current
    if (existing && !existing.closed) {
      existing.document.title = `План платежей: ${monthLabel(month)}`
      setPaymentPopup((current) => current ? { ...current, month } : current)
      existing.focus()
      return
    }
    const popup = window.open('', '_blank', 'popup=yes,width=850,height=700,resizable=yes,scrollbars=yes')
    if (!popup) {
      setActionError('Не удалось открыть окно плана платежей. Проверьте настройки всплывающих окон браузера.')
      return
    }
    popup.document.title = `План платежей: ${monthLabel(month)}`
    document.querySelectorAll('style, link[rel~="stylesheet"]').forEach((style) => {
      popup.document.head.appendChild(style.cloneNode(true))
    })
    const container = popup.document.createElement('main')
    container.className = 'add-row-page'
    popup.document.body.appendChild(container)
    paymentPopupRef.current = popup
    popup.addEventListener('beforeunload', () => {
      if (paymentPopupRef.current === popup) {
        paymentPopupRef.current = null
        setPaymentPopup(null)
      }
    })
    setActionError(null)
    setPaymentPopup({ container, month })
    popup.focus()
  }

  function openImportPopup(): void {
    if (monthEdit !== null || formOpen || importFile || importPopupRef.current) {
      setActionError('Завершите редактирование или текущую загрузку Excel.')
      return
    }
    const popup = window.open('', '_blank', 'popup=yes,width=850,height=850,resizable=yes,scrollbars=yes')
    if (!popup) {
      setActionError('Не удалось открыть окно загрузки Excel. Проверьте настройки всплывающих окон браузера.')
      return
    }
    popup.document.title = 'Загрузка первичных документов из Excel'
    document.querySelectorAll('style, link[rel~="stylesheet"]').forEach((style) => {
      popup.document.head.appendChild(style.cloneNode(true))
    })
    const container = popup.document.createElement('main')
    container.className = 'add-row-page'
    popup.document.body.appendChild(container)
    importPopupRef.current = popup
    popup.addEventListener('beforeunload', () => {
      if (importPopupRef.current !== popup) return
      importPopupRef.current = null
      setImportPopup(null)
      if (importSavingRef.current) {
        setActionError('Окно закрыто во время загрузки Excel. Дождитесь результата операции.')
      } else {
        setImportFile(null)
      }
    })
    setActionError(null)
    setImportMessage(null)
    setImportPopup(container)
    popup.focus()
  }

  async function loadData(): Promise<void> {
    setLoading(true)
    setError(null)
    setActionError(null)
    const bdrRequest = ++bdrRequestRef.current
    try {
      const responses = await Promise.all([
        fetch('/api/primary', { cache: 'no-store' }),
        ...fetchReferences('departments', 'objects', 'dogovors', 'contractors'),
        fetch('/api/primary/bdr-options'),
        fetch('/api/gn/contracts'),
      ])
      const failed = responses.find((response) => !response.ok)
      if (failed) throw new Error(formatHttpError(failed.status))
      const [primaryRows, departmentRows, objectRows, contractRows, contractorRows, bdrRows, contractRegistryRows] = await Promise.all(
        responses.map((response) => response.json() as Promise<Record<string, unknown>[]>),
      )
      const nextRows = primaryRows as PrimaryDocument[]
      setRows(nextRows)
      setDepartmentFilter((current) => (
        current && !nextRows.some((row) => String(row.departmentId) === current) ? '' : current
      ))
      setDepartments(departmentRows.map((row) => ({ id: Number(row.GN_Dep_id), label: String(row.GN_department ?? '') })))
      setContractors(contractorRows.map((row) => ({ id: Number(row.GN_c_id), label: String(row.GN_contarctor ?? '') })))
      setObjects(objectRows.map((row) => ({
        id: Number(row.GN_do_id),
        label: String(row.GN_departament_object ?? ''),
        departmentIds: Array.isArray(row.GN_department_FKs) && row.GN_department_FKs.length > 0
          ? row.GN_department_FKs.map(Number)
          : [Number(row.GN_department_FK)].filter(Number.isSafeInteger),
      })))
      const contractorNames = new Map(contractorRows.map((row) => [Number(row.GN_c_id), String(row.GN_contarctor ?? '')]))
      const contractDetailsByDogovor = new Map<number, { contractWindowId: number; contractRemainingLimit: number | null }>()
      contractRegistryRows.forEach((row) => {
        const dogovorId = Number(row.GN_contract_dogovor_FK)
        const contractId = Number(row.GN_contract_id)
        const rawRemainingLimit = row.GN_contract_remaining_limit
        const contractRemainingLimit = rawRemainingLimit === null || rawRemainingLimit === undefined || rawRemainingLimit === ''
          ? null
          : Number(rawRemainingLimit)
        if (contractRemainingLimit !== null && !Number.isFinite(contractRemainingLimit)) {
          throw new Error('Некорректный остаток лимита договора')
        }
        if (Number.isSafeInteger(dogovorId) && Number.isSafeInteger(contractId) && !contractDetailsByDogovor.has(dogovorId)) {
          contractDetailsByDogovor.set(dogovorId, { contractWindowId: contractId, contractRemainingLimit })
        }
      })
      setContracts(contractRows.map((row) => ({
        id: Number(row.GN_dgv_id),
        label: String(row.GN_dogovor ?? ''),
        personalAccount: String(row.GN_dogovor_personal_account ?? ''),
        contractor: contractorNames.get(Number(row.GN_contarctor_FK)) ?? '',
        contractorId: Number(row.GN_contarctor_FK),
        ...contractDetailsByDogovor.get(Number(row.GN_dgv_id)),
        date: row.GN_dogovor_date ? String(row.GN_dogovor_date) : '',
      })))
      const options = parseBdrOptions(bdrRows)
      if (bdrRequest === bdrRequestRef.current) {
        setBdrOptions(options)
        setBdrRefreshError(null)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    let active = true
    async function refreshBdrOptions(): Promise<void> {
      const request = ++bdrRequestRef.current
      try {
        const response = await fetch('/api/primary/bdr-options', { cache: 'no-store' })
        if (!response.ok) throw new Error(formatHttpError(response.status))
        const options = parseBdrOptions(await response.json() as Record<string, unknown>[])
        if (active && request === bdrRequestRef.current) {
          setBdrOptions(options)
          setBdrRefreshError(null)
        }
      } catch (refreshError) {
        if (active && request === bdrRequestRef.current) {
          setBdrRefreshError(refreshError instanceof Error ? refreshError.message : 'Не удалось обновить данные БДР')
        }
      }
    }
    function onStorage(event: StorageEvent): void {
      if (event.key === 'bdr:last-update') void refreshBdrOptions()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      active = false
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const expenseDepartmentIndex = useMemo(() => buildBdrExpenseDepartmentIndex(bdrOptions), [bdrOptions])
  const budgetItemIndex = useMemo(() => buildBdrBudgetItemIndex(bdrOptions), [bdrOptions])
  const bdr26CorrIndex = useMemo(() => buildBdr26CorrIndex(bdrOptions), [bdrOptions])
  const bdrIds = useMemo(() => ({
    departments: new Set(bdrOptions.map((row) => row.departmentId)),
    objects: new Set(bdrOptions.map((row) => row.objectId)),
    contracts: new Set(bdrOptions.map((row) => row.contractId)),
  }), [bdrOptions])

  const departmentFilterOptions = useMemo(() => {
    const options = new Map<number, string>()
    rows.forEach((row) => {
      if (row.departmentId !== null && row.department !== null) options.set(row.departmentId, row.department)
    })
    return [...options].map(([id, label]) => ({ value: String(id), label }))
  }, [rows])

  const visibleRows = useMemo(() => {
    const expenseDepartmentFor = (row: PrimaryDocument): string => getBdrExpenseDepartments(
      expenseDepartmentIndex,
      String(row.departmentId ?? ''),
      row.objects.map((object) => String(object.id)),
      String(row.contractId ?? ''),
    )
    const personalAccountFor = (row: PrimaryDocument): string => {
      const contract = contracts.find((item) => item.id === row.contractId)
      return row.personalAccount || (contract && personalAccountOptions(contract.personalAccount).length === 0 ? 'НЕТ' : '')
    }
    const contractFor = (row: PrimaryDocument): string => {
      const contract = contracts.find((item) => item.id === row.contractId)
      return contract ? contractLabel(contract) : row.contract ?? ''
    }
    const valueFor = (row: PrimaryDocument, key: ColumnKey): string | number => {
      if (key === 'department') return formatBudgetDepartment(row.department, expenseDepartmentFor(row))
      if (key === 'contractor') return contracts.find((contract) => contract.id === row.contractId)?.contractor ?? ''
      if (key === 'objects') return labelList(row.objects)
      if (key === 'expenseDepartment') return expenseDepartmentFor(row)
      if (key === 'budgetItem') return getBdrBudgetItemCodes(getBdrBudgetItems(budgetItemIndex, row.personalAccount))
      if (key === 'generalNote') return row.generalNote ?? ''
      if (key === 'bdr26Corr') return getBdr26Corr(bdr26CorrIndex, row.personalAccount) ?? ''
      if (key === 'contract') {
        const account = personalAccountFor(row)
        return formatBudgetDepartment(contractFor(row), account ? `ЛС № ${account}. расчет детализации` : '')
      }
      if (key === 'personalAccount') return personalAccountFor(row)
      const monthData = sort.month ? row.monthData[sort.month] : undefined
      if (key === 'amountWithVat') return Number(monthData?.amountWithVat ?? 0)
      if (key === 'sedLaunched') return Number(monthData?.sedLaunched ?? false)
      if (key === 'acceptedIn1C') return Number(monthData?.acceptedIn1C ?? false)
      if (key === 'note') return monthData?.note ?? ''
      return ''
    }
    const bdrSearchTextFor = (row: PrimaryDocument): string => {
      const summary = getBdr26Summary(bdr26CorrIndex, row.personalAccount)
      const monthlyAmounts = PRIMARY_MONTHS.map(({ key: month }) => (
        monthEdit === month && monthDrafts[row.id]
          ? monthDrafts[row.id].amountWithVat
          : row.monthData[month]?.amountWithVat
      ))
      const otherValues = [
        JSON.stringify(row),
        ...BASE_COLUMNS
          .filter(({ key }) => key !== 'bdr26Corr')
          .map(({ key }) => valueFor(row, key)),
        getBdrBudgetItems(budgetItemIndex, row.personalAccount),
      ]
      const contractRemainingLimit = contracts.find((contract) => contract.id === row.contractId)?.contractRemainingLimit ?? null
      return primaryBdrSearchText(summary, monthlyAmounts, otherValues, contractRemainingLimit)
    }
    return rows.filter((row) => {
      if (departmentFilter && String(row.departmentId) !== departmentFilter) return false
      return BASE_COLUMNS.every(({ key }) => {
        const filter = columnFilters[key]?.trim()
        if (key === 'bdr26Corr') {
          return !filter || bdrSearchTextFor(row).includes(filter.toLocaleLowerCase('ru'))
        }
        const value = valueFor(row, key)
        const text = String(value)
        return !filter || text.toLocaleLowerCase('ru').includes(filter.toLocaleLowerCase('ru'))
      })
    }).sort((left, right) => {
      const leftValue = valueFor(left, sort.key)
      const rightValue = valueFor(right, sort.key)
      const compare = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'ru', { numeric: true, sensitivity: 'base' })
      return sort.direction === 'asc' ? compare : -compare
    })
  }, [bdr26CorrIndex, budgetItemIndex, columnFilters, contracts, departmentFilter, expenseDepartmentIndex, monthDrafts, monthEdit, rows, sort])

  function toggleSort(key: ColumnKey, month?: PrimaryMonth): void {
    setSort((current) => current.key === key && current.month === month
      ? { key, month, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, month, direction: 'asc' })
  }

  function resetFilters(): void {
    if (monthEdit !== null || formOpen) {
      setActionError('Завершите редактирование перед сбросом фильтров.')
      return
    }
    setDepartmentFilter('')
    setColumnFilters({})
    setActionError(null)
  }

  function exportToExcel(): void {
    if (monthEdit !== null || formOpen) {
      setActionError('Завершите редактирование перед выгрузкой.')
      return
    }
    try {
      setActionError(null)
      const header = ['ID', ...EXPORT_LEADING_HEADERS,
        ...PRIMARY_MONTHS.flatMap((month) => MONTH_COLUMNS.map((column) => `${month.label}: ${column.label}`)),
        BDR_COLUMN.label, GENERAL_NOTE_COLUMN.label]
      const values = visibleRows.map((row) => {
        const contract = contracts.find((item) => item.id === row.contractId)
        const departmentId = String(row.departmentId ?? '')
        const objectIds = row.objects.map((object) => String(object.id))
        const contractId = String(row.contractId ?? '')
        return [
          row.id, row.department ?? '', labelList(row.objects), contract?.contractor ?? '',
          contract ? contractLabel(contract) : row.contract ?? '',
          getBdrExpenseDepartments(expenseDepartmentIndex, departmentId, objectIds, contractId),
          getBdrBudgetItems(budgetItemIndex, row.personalAccount),
          row.personalAccount ?? '',
          ...PRIMARY_MONTHS.flatMap((month) => {
            const data = row.monthData[month.key]
            return data ? [data.amountWithVat, data.sedLaunched, data.acceptedIn1C, data.note] : ['', '', '', '']
          }),
          getBdr26Corr(bdr26CorrIndex, row.personalAccount),
          row.generalNote ?? '',
        ]
      })
      const worksheet = XLSX.utils.aoa_to_sheet([header, ...values])
      worksheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: values.length, c: header.length - 1 } }) }
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Первичные')
      XLSX.writeFile(workbook, 'Первичные.xlsx')
    } catch (exportError) {
      setActionError(exportError instanceof Error ? exportError.message : 'Не удалось выгрузить Excel')
    }
  }

  function toggleMonthExpanded(month: PrimaryMonth): void {
    setExpandedMonths((current) => ({ ...current, [month]: !current[month] }))
  }

  async function toggleMonthEdit(month: PrimaryMonth): Promise<void> {
    if (monthEdit === month) {
      const documents = visibleRows.map((row) => {
        const monthDraft = monthDrafts[row.id] ?? { amountWithVat: '', sedLaunched: false, acceptedIn1C: false, note: '' }
        const amountText = monthDraft.amountWithVat.trim()
        const amount = amountText === '' ? null : Number(amountText.replace(/\s/g, '').replace(',', '.'))
        return { id: row.id, amountWithVat: amount, sedLaunched: monthDraft.sedLaunched, acceptedIn1C: monthDraft.acceptedIn1C, note: monthDraft.note }
      })
      const invalid = documents.findIndex((document) => document.amountWithVat !== null
        && !Number.isFinite(document.amountWithVat))
      if (invalid !== -1) {
        setActionError(`Проверьте сумму, отметки СЭД и 1С и примечание в строке ${invalid + 1}.`)
        return
      }

      setSavingMonth(true)
      setActionError(null)
      try {
        const response = await fetch(`/api/primary/month/${month}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documents }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(payload.error || formatHttpError(response.status))
        }
        setRows((current) => current.map((row) => {
          const document = documents.find((item) => item.id === row.id)
          if (!document) return row
          const currentMonthData = row.monthData[month]
          return {
            ...row,
            monthData: {
              ...row.monthData,
              [month]: {
                amountWithVat: document.amountWithVat,
                edoArrivalDate: currentMonthData?.edoArrivalDate ?? null,
                sedLaunchDate: currentMonthData?.sedLaunchDate ?? null,
                sedLaunched: document.sedLaunched,
                acceptedIn1C: document.acceptedIn1C,
                note: document.note,
              },
            },
          }
        }))
        setMonthEdit(null)
        setMonthDrafts({})
      } catch (saveError) {
        setActionError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить данные месяца')
      } finally {
        setSavingMonth(false)
      }
      return
    }
    if (monthEdit !== null || formOpen || editingId !== null) return
    setExpandedMonths((current) => ({ ...current, [month]: true }))
    setMonthEdit(month)
    setMonthDrafts(Object.fromEntries(visibleRows.map((row) => {
      const monthData = row.monthData[month]
      return [row.id, {
        amountWithVat: monthData?.amountWithVat == null ? '' : String(monthData.amountWithVat),
        sedLaunched: monthData?.sedLaunched ?? false,
        acceptedIn1C: monthData?.acceptedIn1C ?? false,
        note: monthData?.note ?? '',
      }]
    })))
  }

  function updateMonthDraft<K extends keyof MonthDraft>(rowId: number, key: K, value: MonthDraft[K]): void {
    setMonthDrafts((current) => ({
      ...current,
      [rowId]: { ...current[rowId], [key]: value },
    }))
  }

  function startCreate(): void {
    setEditingId(null)
    const initial = { ...EMPTY_DRAFT, departmentId: departmentFilter, month: PRIMARY_QUARTERS[quarter][0].key }
    setDraft({ ...initial, ...completePrimarySelection(initial, { bdr: bdrOptions, objects, contractors, contracts }, 'department') })
    setFormError(null)
    setFormOpen(true)
  }

  function startEdit(row: PrimaryDocument): void {
    const monthData = row.monthData[row.month]
    const contract = contracts.find((item) => item.id === row.contractId)
    setEditingId(row.id)
    setDraft({
      departmentId: String(row.departmentId ?? ''),
      objectIds: row.objects.map((item) => String(item.id)),
      expenseDepartmentIds: row.expenseDepartments.map((item) => String(item.id)),
      budgetItemIds: row.budgetItems.map((item) => String(item.id)),
      contractorId: String(contract?.contractorId ?? ''),
      contractId: String(row.contractId ?? ''),
      personalAccount: row.personalAccount || (contract && personalAccountOptions(contract.personalAccount).length === 0 ? 'НЕТ' : ''),
      month: row.month,
      amountWithVat: String(monthData?.amountWithVat ?? 0),
      details: row.details ?? '',
      detailsEnabled: row.detailsEnabled,
      generalNote: row.generalNote ?? '',
      edoArrivalDate: monthData?.edoArrivalDate?.slice(0, 10) ?? '',
      sedLaunchDate: monthData?.sedLaunchDate?.slice(0, 10) ?? '',
      sedLaunched: monthData?.sedLaunched ?? false,
      acceptedIn1C: monthData?.acceptedIn1C ?? false,
      note: monthData?.note ?? '',
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
    if (key === 'expenseDepartment') {
      return <span>{getBdrExpenseDepartments(expenseDepartmentIndex, draft.departmentId, draft.objectIds, draft.contractId)}</span>
    }
    if (key === 'budgetItem') return <span>{getBdrBudgetItems(budgetItemIndex, draft.personalAccount)}</span>
    if (key === 'generalNote') return <textarea aria-label="Общее примечания" value={draft.generalNote} onChange={(event) => updateDraft('generalNote', event.target.value)} />
    if (key === 'bdr26Corr') {
      const summary = getBdr26Summary(bdr26CorrIndex, draft.personalAccount)
      const row = editingId === null ? undefined : rows.find((item) => item.id === editingId)
      const amounts = row
        ? PRIMARY_MONTHS.map(({ key: month }) => row.monthData[month]?.amountWithVat)
        : [draft.amountWithVat]
      const contractRemainingLimit = contracts.find((contract) => contract.id === Number(draft.contractId))?.contractRemainingLimit ?? null
      return renderBdrProgress(summary, amounts, contractRemainingLimit)
    }
    if (key === 'department') {
      const selectedDepartment = editingId === null ? null : rows.find((row) => row.id === editingId)?.departmentId
      return (
        <>
          <SearchableSelect
            label="Подразделение"
            value={draft.departmentId}
            options={departments.filter((item) => item.id === selectedDepartment || bdrIds.departments.has(item.id))
              .map((item) => ({ value: String(item.id), label: item.label }))}
            placeholder="Не выбрано"
            onChange={(value) => {
              setDraft((current) => {
                const next = { ...current, departmentId: String(value) }
                return { ...next, ...completePrimarySelection(next, { bdr: bdrOptions, objects, contractors, contracts }, 'department') }
              })
            }}
          />
          <span>{formatBudgetDepartment('', getBdrExpenseDepartments(expenseDepartmentIndex, draft.departmentId, draft.objectIds, draft.contractId))}</span>
        </>
      )
    }
    if (key === 'contractor') {
      const selectedContract = editingId === null ? null : contracts.find((item) => item.id === rows.find((row) => row.id === editingId)?.contractId)
      const contractorIds = getBdrContractorIds(bdrOptions, draft.departmentId, draft.objectIds)
      return (
        <SearchableSelect
          label="Контрагент"
          value={draft.contractorId}
          options={contractors.filter((item) => contractorIds.has(item.id)
            || (item.id === selectedContract?.contractorId && String(item.id) === draft.contractorId))
            .map((item) => ({ value: String(item.id), label: item.label }))}
          placeholder="Выберите контрагента"
          disabled={!draft.departmentId || draft.objectIds.length === 0}
          onChange={(value) => {
            setDraft((current) => {
              const next = { ...current, contractorId: String(value), contractId: '', personalAccount: '' }
              return { ...next, ...completePrimarySelection(next, { bdr: bdrOptions, objects, contractors, contracts }, 'contractor') }
            })
          }}
        />
      )
    }
    if (key === 'objects') {
      const selectedObjects = editingId === null ? [] : rows.find((row) => row.id === editingId)?.objects ?? []
      const departmentId = Number(draft.departmentId)
      const matchingObjects = objects.filter((item) => (
        item.departmentIds?.includes(departmentId) && bdrIds.objects.has(item.id)
      ))
      const options = [...matchingObjects, ...selectedObjects.filter((item) => (
        draft.objectIds.includes(String(item.id)) && !matchingObjects.some((option) => option.id === item.id)
      ))]
      return (
        <SearchableSelect
          label="Объект"
          multiple
          value={draft.objectIds}
          options={options.map((item) => ({ value: String(item.id), label: item.label }))}
          disabled={!draft.departmentId}
          onChange={(value) => {
            const objectIds = Array.isArray(value) ? value : []
            setDraft((current) => {
              const next = { ...current, objectIds }
              return { ...next, ...completePrimarySelection(next, { bdr: bdrOptions, objects, contractors, contracts }, 'objects') }
            })
          }}
        />
      )
    }
    if (key === 'contract') {
      const contractOptions: Lookup[] = contracts.filter((item) => (
        item.contractorId === Number(draft.contractorId)
        && bdrIds.contracts.has(item.id)
      ))
      const selectedContract = contracts.find((item) => String(item.id) === draft.contractId)
      if (selectedContract && !contractOptions.some((item) => item.id === selectedContract.id)) contractOptions.push(selectedContract)
      return (
        <>
          <SearchableSelect
            label="Договор"
            value={draft.contractId}
            options={contractOptions.map((item) => ({ value: String(item.id), label: contractLabel(item) }))}
            disabled={!draft.contractorId}
            onChange={(value) => {
              const contract = contracts.find((item) => String(item.id) === String(value))
              setDraft((current) => {
                const next = { ...current, contractId: String(value), contractorId: String(contract?.contractorId ?? current.contractorId), personalAccount: '' }
                return { ...next, ...completePrimarySelection(next, { bdr: bdrOptions, objects, contractors, contracts }, 'contract') }
              })
            }}
          />
          {renderEditorCell('personalAccount')}
        </>
      )
    }
    if (key === 'personalAccount') {
      const contract = contracts.find((item) => String(item.id) === draft.contractId)
      const accounts = personalAccountOptions(contract?.personalAccount)
      const options = accounts.length === 0 ? ['НЕТ'] : accounts
      if (draft.personalAccount && !options.includes(draft.personalAccount)) options.push(draft.personalAccount)
      return (
        <SearchableSelect
          label="Лицевой счет"
          value={draft.personalAccount}
          options={options.map((account) => ({ value: account, label: account }))}
          disabled={!draft.contractId}
          onChange={(value) => updateDraft('personalAccount', String(value))}
        />
      )
    }
    if (key === 'amountWithVat') {
      return <input type="number" step="0.01" value={draft.amountWithVat} onChange={(event) => updateDraft('amountWithVat', event.target.value)} />
    }
    if (key === 'sedLaunched') {
      return <input type="checkbox" aria-label="Запущен в СЭД" checked={draft.sedLaunched} onChange={(event) => updateDraft('sedLaunched', event.target.checked)} />
    }
    if (key === 'acceptedIn1C') {
      return <input type="checkbox" aria-label="Принято на учет в 1С" checked={draft.acceptedIn1C} disabled={!draft.sedLaunched} onChange={(event) => updateDraft('acceptedIn1C', event.target.checked)} />
    }
    return <textarea value={draft.note} onChange={(event) => updateDraft('note', event.target.value)} />
  }

  async function save(): Promise<void> {
    const isCreating = editingId === null
    const amount = Number(draft.amountWithVat.replace(/\s/g, '').replace(',', '.'))
    if (isCreating && !Number.isFinite(amount)) {
      setFormError('Сумма должна быть числом.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const response = await fetch(isCreating ? '/api/primary' : `/api/primary/${editingId}/general`, {
        method: isCreating ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isCreating ? {
          departmentId: draft.departmentId || null,
          objectIds: draft.objectIds,
          expenseDepartmentIds: draft.expenseDepartmentIds,
          budgetItemIds: draft.budgetItemIds,
          contractId: draft.contractId || null,
          personalAccount: draft.personalAccount,
          month: draft.month,
          amountWithVat: amount,
          details: draft.details,
          detailsEnabled: draft.detailsEnabled,
          generalNote: draft.generalNote,
          edoArrivalDate: draft.edoArrivalDate,
          sedLaunchDate: draft.sedLaunchDate,
          sedLaunched: draft.sedLaunched,
          acceptedIn1C: draft.acceptedIn1C,
          note: draft.note,
        } : {
          departmentId: draft.departmentId || null,
          objectIds: draft.objectIds,
          expenseDepartmentIds: draft.expenseDepartmentIds,
          budgetItemIds: draft.budgetItemIds,
          contractId: draft.contractId || null,
          personalAccount: draft.personalAccount,
          details: draft.details,
          detailsEnabled: draft.detailsEnabled,
          generalNote: draft.generalNote,
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
      setDepartmentFilter((current) => (
        current === String(row.departmentId) && !rows.some((item) => item.id !== row.id && String(item.departmentId) === current)
          ? ''
          : current
      ))
      cancelEdit()
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить запись')
    }
  }

  function startResize(event: ReactPointerEvent<HTMLSpanElement>, key: ColumnWidthKey, defaultWidth: number): void {
    event.preventDefault()
    event.stopPropagation()
    const startingWidth = widths[key] ?? event.currentTarget.parentElement?.getBoundingClientRect().width ?? defaultWidth
    resizeRef.current = { key, startX: event.clientX, startWidth: startingWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function resizeColumn(event: ReactPointerEvent<HTMLSpanElement>): void {
    const resize = resizeRef.current
    if (!resize) return
    const next: Partial<Record<ColumnWidthKey, number>> = {
      ...widths,
      [resize.key]: Math.max(50, resize.startWidth + event.clientX - resize.startX),
    }
    setWidths(next)
    try {
      localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(next))
    } catch {
      setActionError('Не удалось сохранить ширину столбцов в браузере.')
    }
  }

  function renderResizeHandle(key: ColumnKey, widthKey: ColumnWidthKey, label: string): React.ReactElement {
    return (
      <span
        className="primary-table__resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Изменить ширину столбца ${label}`}
        onPointerDown={(event) => startResize(event, widthKey, COLUMN_WIDTHS[key])}
        onPointerMove={resizeColumn}
        onPointerUp={() => { resizeRef.current = null }}
      />
    )
  }

  function openPrimaryAccountDetails(row: PrimaryDocument): void {
    setActionError(null)
    const popup = window.open(
      `${window.location.pathname}#primary-account-window-${row.id}`,
      `primary-account-window-${row.id}`,
      'popup=yes,width=900,height=700,resizable=yes,scrollbars=yes',
    )
    if (popup) popup.focus()
    else setActionError('Не удалось открыть окно детализации. Проверьте настройки всплывающих окон браузера.')
  }

  function renderPrimaryValue(row: PrimaryDocument, key: ColumnKey, month?: PrimaryMonth): React.ReactNode {
    if (MONTH_COLUMN_KEYS.has(key)) {
      if (!month) return null
      const monthData = row.monthData[month]
      if (key === 'amountWithVat') {
        return monthData?.amountWithVat == null
          ? ''
          : Number(monthData.amountWithVat).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      }
      if (key === 'sedLaunched') return <input type="checkbox" aria-label="Запущен в СЭД" checked={monthData?.sedLaunched ?? false} disabled />
      if (key === 'acceptedIn1C') return <input type="checkbox" aria-label="Принято на учет в 1С" checked={monthData?.acceptedIn1C ?? false} disabled />
      if (key === 'note') return monthData?.note ?? ''
      return ''
    }
    if (key === 'department') {
      const expenseDepartment = getBdrExpenseDepartments(expenseDepartmentIndex, String(row.departmentId ?? ''), row.objects.map((object) => String(object.id)), String(row.contractId ?? ''))
      return formatBudgetDepartment(row.department, expenseDepartment)
    }
    if (key === 'objects') return labelList(row.objects)
    if (key === 'expenseDepartment') return getBdrExpenseDepartments(expenseDepartmentIndex, String(row.departmentId ?? ''), row.objects.map((object) => String(object.id)), String(row.contractId ?? ''))
    if (key === 'budgetItem') {
      const fullLabel = getBdrBudgetItems(budgetItemIndex, row.personalAccount)
      return <span title={fullLabel || undefined} aria-label={fullLabel || getBdrBudgetItemCodes(fullLabel)}>{getBdrBudgetItemCodes(fullLabel)}</span>
    }
    if (key === 'generalNote') return row.generalNote ?? ''
    if (key === 'bdr26Corr') {
      const summary = getBdr26Summary(bdr26CorrIndex, row.personalAccount)
      const amounts = PRIMARY_MONTHS.map(({ key: currentMonth }) => (
        monthEdit === currentMonth && monthDrafts[row.id]
          ? monthDrafts[row.id].amountWithVat
          : row.monthData[currentMonth]?.amountWithVat
      ))
      const contractRemainingLimit = contracts.find((contract) => contract.id === row.contractId)?.contractRemainingLimit ?? null
      return renderBdrProgress(summary, amounts, contractRemainingLimit)
    }
    if (key === 'contractor') return contracts.find((item) => item.id === row.contractId)?.contractor ?? ''
    if (key === 'contract') {
      const contract = contracts.find((item) => item.id === row.contractId)
      const label = contract ? contractLabel(contract) : row.contract ?? ''
      const account = row.personalAccount || (contract && personalAccountOptions(contract.personalAccount).length === 0 ? 'НЕТ' : '')
      const contractWindowId = contract?.contractWindowId
      const contractValue = contractWindowId ? (
        <button type="button" className="contract-cell-button" onClick={() => onOpenContract(contractWindowId)}>
          {label}
        </button>
      ) : label
      if (!account) return contractValue
      return (
        <>
          {contractValue} (ЛС № {account}.{' '}
          <button
            type="button"
            className="contract-cell-button"
            aria-label={`Расчёт детализации лицевого счёта ${account}, запись ${row.id}`}
            onClick={() => openPrimaryAccountDetails(row)}
          >
            расчет детализации
          </button>)
        </>
      )
    }
    if (key === 'personalAccount') {
      const contract = contracts.find((item) => item.id === row.contractId)
      const account = row.personalAccount || (contract && personalAccountOptions(contract.personalAccount).length === 0 ? 'НЕТ' : '')
      if (!account) return ''
      return (
        <button
          type="button"
          className="contract-cell-button"
          aria-label={`Расчёт детализации лицевого счёта ${account}, запись ${row.id}`}
          onClick={() => openPrimaryAccountDetails(row)}
        >
          {account}
        </button>
      )
    }
    return ''
  }

  function renderMonthEditorCell(month: PrimaryMonth, key: ColumnKey): React.ReactElement {
    if (draft.month === month) return renderEditorCell(key)
    const columnLabel = MONTH_COLUMNS.find((column) => column.key === key)?.label ?? ''
    return (
      <button
        type="button"
        className="page-action-btn page-action-btn--secondary"
        aria-label={`Выбрать ${monthLabel(month)}: ${columnLabel}`}
        title={`Перенести данные в ${monthLabel(month)}`}
        onClick={() => updateDraft('month', month)}
      >
        Выбрать
      </button>
    )
  }

  function renderMonthlyEditCell(row: PrimaryDocument, key: ColumnKey): React.ReactElement {
    const monthDraft = monthDrafts[row.id]
    if (!monthDraft) return <span />
    if (key === 'amountWithVat') {
      return <input type="number" step="0.01" value={monthDraft.amountWithVat} onChange={(event) => updateMonthDraft(row.id, 'amountWithVat', event.target.value)} />
    }
    if (key === 'sedLaunched') {
      return <input type="checkbox" aria-label="Запущен в СЭД" checked={monthDraft.sedLaunched} onChange={(event) => updateMonthDraft(row.id, 'sedLaunched', event.target.checked)} />
    }
    if (key === 'acceptedIn1C') {
      return <input type="checkbox" aria-label="Принято на учет в 1С" checked={monthDraft.acceptedIn1C} disabled={!monthDraft.sedLaunched} onChange={(event) => updateMonthDraft(row.id, 'acceptedIn1C', event.target.checked)} />
    }
    return <textarea value={monthDraft.note} onChange={(event) => updateMonthDraft(row.id, 'note', event.target.value)} />
  }

  function renderBaseHeader({ key, label }: Column): React.ReactElement {
    return (
      <th key={key} rowSpan={2} className="primary-table__resizable-header">
        <div className="primary-table__column-header">
          <button type="button" className="guide-sort-button" onClick={() => toggleSort(key)}>
            {label}{key === BDR_COLUMN.key ? ` (итого: ${formatBdr26Corr(bdrTotal)})` : ''}{sort.key === key ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
          </button>
          <input
            type="search"
            className="primary-table__column-filter"
            aria-label={`Поиск в столбце ${label}`}
            placeholder="Поиск..."
            value={columnFilters[key] ?? ''}
            onChange={(event) => setColumnFilters((current) => ({ ...current, [key]: event.target.value }))}
          />
        </div>
        {renderResizeHandle(key, key, label)}
      </th>
    )
  }

  function renderBaseCell({ key, label }: Column, row?: PrimaryDocument): React.ReactElement {
    return (
      <td key={key} className="primary-table__resizable-cell">
        {!row || editingId === row.id ? renderEditorCell(key) : renderPrimaryValue(row, key)}
        {renderResizeHandle(key, key, label)}
      </td>
    )
  }

  const visibleMonths = PRIMARY_QUARTERS[quarter]
  const visibleAccounts = visibleRows.map((row) => editingId === row.id ? draft.personalAccount : row.personalAccount)
  if (formOpen && editingId === null) visibleAccounts.push(draft.personalAccount)
  const bdrTotal = sumBdr26Corr(bdr26CorrIndex, visibleAccounts)
  function monthAmounts(month: PrimaryMonth): PaymentPlanRow[] {
    const values: Array<{ id: number | null; contractor: string; contractSubject: string; contract: string; calculation: string; amount: number | string | null | undefined }> = visibleRows.map((row) => {
      const contract = contracts.find((item) => item.id === row.contractId)
      const account = row.personalAccount || (contract && personalAccountOptions(contract.personalAccount).length === 0 ? 'НЕТ' : '')
      const paymentDetails = getBdrPaymentDetails(bdrOptions, row.contractId, account)
      return {
        id: row.id,
        contractor: contract?.contractor ?? '',
        contractSubject: paymentDetails.contractSubject,
        contract: contract ? contractLabel(contract) : row.contract ?? '',
        calculation: paymentDetails.calculation,
        amount: monthEdit === month && monthDrafts[row.id] ? monthDrafts[row.id].amountWithVat : row.monthData[month]?.amountWithVat,
      }
    })
    if (formOpen && editingId === null && draft.month === month) {
      const contract = contracts.find((item) => String(item.id) === draft.contractId)
      const contractor = contractors.find((item) => String(item.id) === draft.contractorId)
      const account = draft.personalAccount || (contract && personalAccountOptions(contract.personalAccount).length === 0 ? 'НЕТ' : '')
      const paymentDetails = getBdrPaymentDetails(bdrOptions, contract?.id ?? null, account)
      values.unshift({
        id: null,
        contractor: contract?.contractor ?? contractor?.label ?? '',
        contractSubject: paymentDetails.contractSubject,
        contract: contract ? contractLabel(contract) : '',
        calculation: paymentDetails.calculation,
        amount: draft.amountWithVat,
      })
    }
    return values
  }
  function exportPaymentPlan(month: PrimaryMonth): void {
    try {
      const amounts = monthAmounts(month)
      const total = primaryBdrProgress(null, amounts.map(({ amount }) => amount)).total
      if (total === null) throw new Error('Проверьте суммы перед выгрузкой.')
      const rows = amounts.map(({ contractor, contractSubject, contract, calculation, amount }, index) => [
        index + 1,
        contractor,
        contractSubject,
        contract,
        '',
        amount == null || amount === '' ? '' : primaryBdrProgress(null, [amount]).total,
        calculation,
      ])
      const sheetRows: Array<Array<string | number | null>> = Array.from({ length: 9 }, () => [])
      sheetRows[3] = ['Справка о планируемых расчетах']
      sheetRows.push(PAYMENT_PLAN_HEADERS, PAYMENT_PLAN_HEADERS.map((_, index) => index + 1), ...rows)
      const sheet = XLSXStyle.utils.aoa_to_sheet(sheetRows)
      const border = {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } },
      }
      const titleCell = sheet[XLSXStyle.utils.encode_cell({ r: 3, c: 0 })]
      if (titleCell) {
        titleCell.s = {
          font: { bold: true },
          alignment: { horizontal: 'center', vertical: 'center' },
        }
      }
      const lastTableRow = 10 + rows.length
      for (let rowIndex = 9; rowIndex <= lastTableRow; rowIndex += 1) {
        for (let columnIndex = 0; columnIndex < PAYMENT_PLAN_HEADERS.length; columnIndex += 1) {
          const address = XLSXStyle.utils.encode_cell({ r: rowIndex, c: columnIndex })
          const cell = sheet[address] ?? { t: 's', v: '' }
          cell.s = {
            border,
            alignment: {
              ...(rowIndex <= 10 || columnIndex === 0 ? { horizontal: 'center' } : {}),
              vertical: 'center',
              wrapText: true,
            },
            ...(rowIndex <= 10 ? {
              font: { bold: true },
              fill: { fgColor: { rgb: 'D9D9D9' } },
            } : {}),
          }
          if (rowIndex > 10 && columnIndex === 5 && typeof cell.v === 'number') cell.z = '#,##0.00'
          sheet[address] = cell
        }
      }
      sheet['!merges'] = [{ s: { r: 3, c: 0 }, e: { r: 3, c: 6 } }]
      sheet['!cols'] = [{ wch: 6 }, { wch: 28 }, { wch: 32 }, { wch: 32 }, { wch: 20 }, { wch: 16 }, { wch: 40 }]
      const workbook = XLSXStyle.utils.book_new()
      XLSXStyle.utils.book_append_sheet(workbook, sheet, 'План платежей')
      XLSXStyle.writeFile(workbook, `План_платежей_${monthLabel(month)}.xlsx`)
      setPaymentError(null)
    } catch (exportError) {
      setPaymentError(exportError instanceof Error ? exportError.message : 'Не удалось выгрузить план платежей')
    }
  }
  const visibleMonthColumns = visibleMonths.flatMap((month) => {
    const fields = expandedMonths[month.key] ? MONTH_COLUMNS : MONTH_COLUMNS.slice(0, 1)
    return fields.map((column) => ({ ...column, month: month.key }))
  })
  const numberColumnWidth = Math.max(58, String(visibleRows.length || 1).length * 7 + 42)

  if (loading) return <main><p className="hint">Загрузка первичных документов...</p></main>

  return (
    <main className="primary-page">
      <section className="page-section">
        <div className="page-header">
          <h2>Первичные</h2>
        </div>
        {!error && (
          <ExcelActionToolbar
            className="excel-action-toolbar--equipment"
            onReset={resetFilters}
            onExport={exportToExcel}
            onOpenUpload={openImportPopup}
            uploading={importFile !== null || importPopup !== null}
          />
        )}
        {error && <p className="hint hint--error" role="alert">{error}</p>}
        {actionError && <p className="hint hint--error" role="alert">{actionError}</p>}
        {bdrRefreshError && <p className="hint hint--error" role="alert">Не удалось обновить данные БДР: {bdrRefreshError}</p>}
        {importMessage && <p className="hint">{importMessage}</p>}
        {paymentPopup && createPortal(
          <PrimaryPaymentPlan
            monthLabel={monthLabel(paymentPopup.month)}
            amounts={monthAmounts(paymentPopup.month)}
            error={paymentError}
            onExport={() => exportPaymentPlan(paymentPopup.month)}
            onClose={closePaymentPopup}
          />,
          paymentPopup.container,
        )}
        {importPopup && createPortal(
          importFile ? <PrimaryExcelImport
            file={importFile}
            rows={rows}
            departments={departments}
            objects={objects}
            contractors={contractors}
            contracts={contracts}
            bdr={bdrOptions}
            initialMonth={visibleMonths[0].key}
            onCancel={closeImportPopup}
            onSavingChange={(next) => { importSavingRef.current = next }}
            onError={(message) => {
              if (!importPopupRef.current) {
                setImportFile(null)
                setActionError(message)
              }
            }}
            onComplete={(created, updated) => {
              closeImportPopup()
              setActionError(null)
              setImportMessage(`Загрузка завершена. Добавлено: ${created}, обновлено: ${updated}.`)
              void loadData()
            }}
          /> : (
            <section className="guide-new-row add-row-form-vertical" aria-label="Загрузка первичных документов из Excel">
              <h3>Загрузка первичных документов из Excel</h3>
              <label className="form-field">
                <span className="form-field-label">Файл Excel</span>
                <input type="file" accept=".xlsx" onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) setImportFile(file)
                }} />
              </label>
              <div className="form-actions-row-compact">
                <button type="button" className="page-action-btn page-action-btn--secondary" onClick={closeImportPopup}>Отмена</button>
              </div>
            </section>
          ),
          importPopup,
        )}
        {!error && (
          <div className="form-fields-compact primary-page__filters">
            <label className="form-field-compact">
              <select
                aria-label="Квартал"
                value={quarter}
                disabled={monthEdit !== null || savingMonth || saving || importFile !== null || importPopup !== null}
                onChange={(event) => {
                  const nextQuarter = Number(event.target.value)
                  setQuarter(nextQuarter)
                  if (formOpen && editingId === null) updateDraft('month', PRIMARY_QUARTERS[nextQuarter][0].key)
                  setSort((current) => current.month ? { key: 'contractor', direction: 'asc' } : current)
                }}
              >
                {PRIMARY_QUARTERS.map((_, index) => <option key={index} value={index}>{index + 1} квартал</option>)}
              </select>
            </label>
            <label className="form-field-compact">
              <SearchableSelect
                label="Фильтр по подразделению"
                value={departmentFilter}
                options={departmentFilterOptions}
                placeholder="Все подразделения"
                searchable={false}
                disabled={monthEdit !== null || savingMonth}
                onChange={(value) => setDepartmentFilter(String(value))}
              />
            </label>
          </div>
        )}
        {!error && (
          <div className="guide-table-wrap primary-table-wrap">
            <table className="guide-table table-compact primary-table">
              <colgroup>
                <col style={{ width: numberColumnWidth }} />
                {LEADING_COLUMNS.map(({ key }) => <col key={key} style={{ width: widths[key] ?? 'max-content' }} />)}
                {visibleMonthColumns.map(({ key, month }) => {
                  const widthKey: ColumnWidthKey = `${month}:${key}`
                  return <col key={`${month}-${key}`} style={{ width: widths[widthKey] ?? 'max-content' }} />
                })}
                <col style={{ width: widths[BDR_COLUMN.key] ?? 'max-content' }} />
                <col style={{ width: widths[GENERAL_NOTE_COLUMN.key] ?? 'max-content' }} />
              </colgroup>
              <thead>
                <tr>
                  <th rowSpan={2} className="primary-table__number-header">
                    <div className="primary-table__number-content">
                      <span>№</span>
                      <button
                        type="button"
                        className="primary-table__icon-button primary-table__add-button"
                        onClick={startCreate}
                        disabled={formOpen || monthEdit !== null || importFile !== null || importPopup !== null}
                        aria-label="Добавить запись"
                        title="Добавить запись"
                      >+</button>
                    </div>
                  </th>
                  {LEADING_COLUMNS.map(renderBaseHeader)}
                  {visibleMonths.map((month) => {
                    const expanded = expandedMonths[month.key]
                    return (
                      <th key={month.key} colSpan={expanded ? MONTH_COLUMNS.length : 1}>
                        <div className="primary-table__month-header">
                          <span>{month.label}</span>
                          <span>{formatBdr26Corr(primaryBdrProgress(null, monthAmounts(month.key).map((item) => item.amount)).total) || 'Некорректная сумма'}</span>
                          <div>
                          <button type="button" className="page-action-btn page-action-btn--secondary primary-table__month-toggle" disabled={monthEdit === month.key || savingMonth} onClick={() => toggleMonthExpanded(month.key)}>
                            {expanded ? '−' : '+'}
                          </button>
                          <button
                            type="button"
                            className="page-action-btn page-action-btn--secondary primary-table__month-edit-icon"
                            onClick={() => openPaymentPopup(month.key)}
                            aria-label={`План платежей: ${month.label}`}
                            title="План платежей"
                          >▤</button>
                          <button
                            type="button"
                            className="page-action-btn page-action-btn--secondary primary-table__month-edit-icon"
                            onClick={() => void toggleMonthEdit(month.key)}
                            disabled={savingMonth || importFile !== null || importPopup !== null || (monthEdit !== null && monthEdit !== month.key) || (monthEdit === null && (formOpen || editingId !== null))}
                            aria-label={monthEdit === month.key ? `Сохранить ${month.label}` : `Редактировать ${month.label}`}
                            title={monthEdit === month.key ? `Сохранить все изменения ${month.label}` : 'Редактировать данные месяца'}
                          >
                            {savingMonth && monthEdit === month.key ? '…' : monthEdit === month.key ? '✓' : '✎'}
                          </button>
                          </div>
                        </div>
                      </th>
                    )
                  })}
                  {renderBaseHeader(BDR_COLUMN)}
                  {renderBaseHeader(GENERAL_NOTE_COLUMN)}
                </tr>
                <tr>
                  {visibleMonthColumns.map(({ key, month, label }) => (
                    <th key={`${month}-${key}`} className="primary-table__resizable-header">
                      <button type="button" className="guide-sort-button" onClick={() => toggleSort(key, month)}>
                        {label}{sort.key === key && sort.month === month ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                      {renderResizeHandle(key, `${month}:${key}`, `${monthLabel(month)}: ${label}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {formOpen && editingId == null && (
                  <tr className="primary-table__editing-row">
                    <td className="primary-table__number-cell">
                      <div className="primary-table__number-content">
                        <span>Новая</span>
                        <button type="button" className="page-action-btn primary-table__icon-button" onClick={() => void save()} disabled={saving} aria-label="Сохранить запись" title={saving ? 'Сохранение...' : 'Сохранить'}>✓</button>
                        <button type="button" className="page-action-btn primary-table__icon-button" onClick={cancelEdit} disabled={saving} aria-label="Отменить создание записи" title="Отмена">×</button>
                      </div>
                    </td>
                    {LEADING_COLUMNS.map((column) => renderBaseCell(column))}
                    {visibleMonthColumns.map(({ key, month }) => (
                      <td key={`${month}-${key}`} className={`primary-table__resizable-cell ${draft.month === month ? primaryMonthStatusClass(draft) : ''}`}>
                        {renderMonthEditorCell(month, key)}
                        {renderResizeHandle(key, `${month}:${key}`, `${monthLabel(month)}: ${MONTH_COLUMNS.find((column) => column.key === key)?.label ?? ''}`)}
                      </td>
                    ))}
                    {renderBaseCell(BDR_COLUMN)}
                    {renderBaseCell(GENERAL_NOTE_COLUMN)}
                  </tr>
                )}
                {visibleRows.map((row, index) => (
                  <tr key={row.id} className={editingId === row.id ? 'primary-table__editing-row' : undefined}>
                    <td className="primary-table__number-cell">
                      <div className="primary-table__number-content">
                        <span>{index + 1}</span>
                        {editingId === row.id ? (
                          <>
                            <button type="button" className="page-action-btn primary-table__icon-button" onClick={() => void save()} disabled={saving} aria-label="Сохранить запись" title={saving ? 'Сохранение...' : 'Сохранить'}>✓</button>
                            <button type="button" className="page-action-btn primary-table__icon-button" onClick={cancelEdit} disabled={saving} aria-label="Отменить изменения" title="Отмена">×</button>
                            <button type="button" className="page-action-btn primary-table__icon-button" onClick={() => void deleteRow(row)} disabled={saving} aria-label={`Удалить запись №${row.id}`} title="Удалить">🗑</button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="page-action-btn primary-table__icon-button"
                            onClick={() => startEdit(row)}
                            disabled={formOpen || monthEdit !== null || importFile !== null || importPopup !== null}
                            aria-label={`Редактировать запись №${row.id}`}
                            title="Редактировать"
                          >
                            ✎
                          </button>
                        )}
                      </div>
                    </td>
                    {LEADING_COLUMNS.map((column) => renderBaseCell(column, row))}
                    {visibleMonthColumns.map(({ key, month }) => (
                      <td key={`${month}-${key}`} className={`primary-table__resizable-cell ${primaryMonthStatusClass(monthEdit === month ? monthDrafts[row.id] : row.monthData[month])}`}>
                        {monthEdit === month
                          ? renderMonthlyEditCell(row, key)
                          : renderPrimaryValue(row, key, month)}
                        {renderResizeHandle(key, `${month}:${key}`, `${monthLabel(month)}: ${MONTH_COLUMNS.find((column) => column.key === key)?.label ?? ''}`)}
                      </td>
                    ))}
                    {renderBaseCell(BDR_COLUMN, row)}
                    {renderBaseCell(GENERAL_NOTE_COLUMN, row)}
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
