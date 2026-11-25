import { personalAccountOptions } from '../../shared/personalAccounts'

export type BdrOption = {
  departmentId: number | null
  objectId: number | null
  contractorId: number | null
  contractId: number | null
}

export type BdrExpenseOption = BdrOption & { expenseDepartment: string | null; personalAccount: string | null; budgetItem: string | null; contractSubject: string | null; calculation: string | null; bdr26Corr: number | null; bdr26Count: number }
type Bdr26Summary = { amount: number; count: number }

export function parseBdrOptions(rows: Record<string, unknown>[]): BdrExpenseOption[] {
  return rows.map((row) => {
    const parseId = (value: unknown): number | null => {
      if (value === null) return null
      const id = Number(value)
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Некорректные данные БДР')
      return id
    }
    if (row.expenseDepartment !== null && typeof row.expenseDepartment !== 'string') {
      throw new Error('Некорректное подразделение расходов в БДР')
    }
    if (row.budgetItem !== null && typeof row.budgetItem !== 'string') {
      throw new Error('Некорректная статья бюджета в БДР')
    }
    if (row.personalAccount !== null && typeof row.personalAccount !== 'string') {
      throw new Error('Некорректный лицевой счет в БДР')
    }
    if (row.contractSubject !== null && typeof row.contractSubject !== 'string') {
      throw new Error('Некорректный предмет договора в БДР')
    }
    if (row.calculation !== null && typeof row.calculation !== 'string') {
      throw new Error('Некорректное условие расчета в БДР')
    }
    if (row.bdr26Corr !== null && (typeof row.bdr26Corr !== 'string' || row.bdr26Corr.trim() === '' || !Number.isFinite(Number(row.bdr26Corr)))) {
      throw new Error('Некорректное значение БДР26корр')
    }
    if (typeof row.bdr26Count !== 'number' || !Number.isSafeInteger(row.bdr26Count) || row.bdr26Count < 0
      || (row.bdr26Corr !== null && row.bdr26Count === 0)) {
      throw new Error('Некорректное количество строк БДР26корр')
    }
    return {
      departmentId: parseId(row.departmentId),
      objectId: parseId(row.objectId),
      contractorId: parseId(row.contractorId),
      contractId: parseId(row.contractId),
      expenseDepartment: row.expenseDepartment,
      budgetItem: row.budgetItem,
      contractSubject: row.contractSubject,
      calculation: row.calculation,
      personalAccount: row.personalAccount,
      bdr26Corr: row.bdr26Corr === null ? null : Number(row.bdr26Corr),
      bdr26Count: row.bdr26Count,
    }
  })
}

export function getBdrPaymentDetails(
  rows: Array<Pick<BdrExpenseOption, 'contractId' | 'personalAccount' | 'contractSubject' | 'calculation'>>,
  contractId: number | null,
  personalAccount: string | null | undefined,
): { contractSubject: string; calculation: string } {
  const account = validAccount(personalAccount)
  if (contractId === null || account === null) return { contractSubject: '', calculation: '' }
  const matchingRows = rows.filter((row) => row.contractId === contractId && validAccount(row.personalAccount) === account)
  const uniqueValues = (key: 'contractSubject' | 'calculation'): string => [...new Set(
    matchingRows.map((row) => row[key]?.trim()).filter((value): value is string => Boolean(value)),
  )].sort((left, right) => left.localeCompare(right, 'ru')).join('; ')
  return { contractSubject: uniqueValues('contractSubject'), calculation: uniqueValues('calculation') }
}

export function buildBdrExpenseDepartmentIndex(rows: Array<Pick<BdrExpenseOption, 'departmentId' | 'objectId' | 'contractId' | 'expenseDepartment'>>): Map<string, string[]> {
  const grouped = new Map<string, Set<string>>()
  for (const row of rows) {
    if (row.departmentId === null || row.objectId === null || row.contractId === null || !row.expenseDepartment) continue
    const key = `${row.departmentId}:${row.objectId}:${row.contractId}`
    const labels = grouped.get(key) ?? new Set<string>()
    labels.add(row.expenseDepartment)
    grouped.set(key, labels)
  }
  return new Map([...grouped].map(([key, labels]) => [key, [...labels]]))
}

export function getBdrExpenseDepartments(
  index: Map<string, string[]>,
  departmentId: string,
  objectIds: string[],
  contractId: string,
): string {
  if (!departmentId || !contractId) return ''
  const labels = new Set(objectIds.flatMap((id) => index.get(`${departmentId}:${id}:${contractId}`) ?? []))
  return [...labels].sort((a, b) => a.localeCompare(b, 'ru')).join('; ')
}

function validAccount(value: string | null | undefined): string | null {
  const account = value?.trim()
  return !account || account.toLocaleUpperCase('ru') === 'НЕТ' ? null : account
}

export function buildBdrBudgetItemIndex(rows: Array<Pick<BdrExpenseOption, 'personalAccount' | 'budgetItem'>>): Map<string, string[]> {
  const grouped = new Map<string, Set<string>>()
  for (const row of rows) {
    const account = validAccount(row.personalAccount)
    const label = row.budgetItem?.trim()
    if (!account || !label) continue
    const labels = grouped.get(account) ?? new Set<string>()
    labels.add(label)
    grouped.set(account, labels)
  }
  return new Map([...grouped].map(([account, labels]) => [account, [...labels].sort((a, b) => a.localeCompare(b, 'ru'))]))
}

export function getBdrBudgetItems(index: Map<string, string[]>, personalAccount: string | null | undefined): string {
  const account = validAccount(personalAccount)
  return account ? (index.get(account) ?? []).join('; ') : ''
}

export function getBdrBudgetItemCodes(items: string): string {
  return items
    .split(';')
    .map((item) => item.trim().split('.')[0].replace(/\D/g, ''))
    .filter(Boolean)
    .join('; ')
}

export function buildBdr26CorrIndex(rows: Array<Pick<BdrExpenseOption, 'personalAccount' | 'bdr26Corr' | 'bdr26Count'>>): Map<string, Bdr26Summary> {
  const index = new Map<string, Bdr26Summary>()
  for (const row of rows) {
    const account = validAccount(row.personalAccount)
    if (!account || row.bdr26Corr === null) continue
    index.set(account, { amount: row.bdr26Corr, count: row.bdr26Count })
  }
  return index
}

export function getBdr26Summary(
  index: Map<string, Bdr26Summary>,
  personalAccount: string | null | undefined,
): Bdr26Summary | null {
  const account = validAccount(personalAccount)
  if (!account) return null
  return index.get(account) ?? null
}

export function getBdr26Corr(index: Map<string, Bdr26Summary>, personalAccount: string | null | undefined): number | null {
  return getBdr26Summary(index, personalAccount)?.amount ?? null
}

export function sumBdr26Corr(index: Map<string, Bdr26Summary>, personalAccounts: Array<string | null | undefined>): number {
  return personalAccounts.reduce<number>((total, account) => total + (getBdr26Corr(index, account) ?? 0), 0)
}

export function primaryBdrProgress(
  budget: number | null,
  monthlyAmounts: Array<number | string | null | undefined>,
): { total: number | null; percent: number | null } {
  let total = 0
  for (const amount of monthlyAmounts) {
    const text = typeof amount === 'string' ? amount.trim().replace(/\s/g, '').replace(',', '.') : amount
    const value = text === null || text === undefined || text === '' ? 0 : Number(text)
    if (!Number.isFinite(value)) return { total: null, percent: null }
    total += value
  }
  if (!Number.isFinite(total)) return { total: null, percent: null }
  if (budget === null || !Number.isFinite(budget) || budget <= 0) return { total, percent: null }
  const percent = total / budget * 100
  return { total, percent: Number.isFinite(percent) ? percent : null }
}

export function primaryBdrSearchText(
  summary: { amount: number; count: number } | null,
  monthlyAmounts: Array<number | string | null | undefined>,
  otherValues: unknown[],
): string {
  const { total, percent } = primaryBdrProgress(summary?.amount ?? null, monthlyAmounts)
  const amountValues = (value: number | null): string[] => value === null
    ? []
    : [String(value), value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })]
  return [
    summary === null ? 'нет данных' : '',
    ...amountValues(summary?.amount ?? null),
    summary ? `${summary.count} стр.` : '',
    total === null ? 'некорректное значение' : '',
    'сумма за год с ндс',
    ...amountValues(total),
    percent === null ? 'прогресс не рассчитан' : `выполнение ${percent} ${percent.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`,
    ...otherValues.map((value) => typeof value === 'string' ? value : String(value ?? '')),
  ].join(' ').toLocaleLowerCase('ru')
}

export function getBdrContractorIds(rows: BdrOption[], departmentId: string, objectIds: string[]): Set<number> {
  if (!departmentId || objectIds.length === 0) return new Set()
  const selectedObjects = new Set(objectIds)
  return new Set(rows.flatMap((row) => (
    String(row.departmentId) === departmentId
    && row.objectId !== null
    && selectedObjects.has(String(row.objectId))
    && row.contractorId !== null
      ? [row.contractorId]
      : []
  )))
}

type PrimarySelection = {
  departmentId: string
  objectIds: string[]
  contractorId: string
  contractId: string
  personalAccount: string
}

type PrimaryReferences = {
  bdr: BdrOption[]
  objects: { id: number; departmentIds?: number[] }[]
  contractors: { id: number }[]
  contracts: { id: number; contractorId?: number; personalAccount?: string }[]
}

export function completePrimarySelection(
  selection: PrimarySelection,
  references: PrimaryReferences,
  from: 'department' | 'objects' | 'contractor' | 'contract',
): PrimarySelection {
  const result = { ...selection }
  if (from === 'department') {
    const bdrObjectIds = new Set(references.bdr.map((row) => row.objectId))
    const objects = references.objects.filter((object) => (
      result.departmentId && object.departmentIds?.includes(Number(result.departmentId)) && bdrObjectIds.has(object.id)
    ))
    result.objectIds = objects.length === 1 ? [String(objects[0].id)] : []
    result.contractorId = ''
    result.contractId = ''
    result.personalAccount = ''
  }
  if (from === 'department' || from === 'objects') {
    const ids = getBdrContractorIds(references.bdr, result.departmentId, result.objectIds)
    if (!ids.has(Number(result.contractorId))) {
      result.contractorId = ''
      result.contractId = ''
      result.personalAccount = ''
    }
    if (!result.contractorId) {
      const contractors = references.contractors.filter((contractor) => ids.has(contractor.id))
      if (contractors.length === 1) result.contractorId = String(contractors[0].id)
    }
  }
  if (!result.contractorId) return result
  if (from !== 'contract' && !result.contractId) {
    const bdrContractIds = new Set(references.bdr.map((row) => row.contractId))
    const contracts = references.contracts.filter((contract) => (
      contract.contractorId === Number(result.contractorId) && bdrContractIds.has(contract.id)
    ))
    if (contracts.length === 1) result.contractId = String(contracts[0].id)
  }
  if (result.contractId && !result.personalAccount) {
    const contract = references.contracts.find((item) => String(item.id) === result.contractId)
    if (contract) {
      const accounts = personalAccountOptions(contract.personalAccount)
      if (accounts.length === 0) result.personalAccount = 'НЕТ'
      else if (accounts.length === 1) result.personalAccount = accounts[0]
    }
  }
  return result
}

