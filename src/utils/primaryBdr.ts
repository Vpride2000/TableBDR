import { personalAccountOptions } from '../../shared/personalAccounts'

export type BdrOption = {
  departmentId: number | null
  objectId: number | null
  contractorId: number | null
  contractId: number | null
}

export type BdrExpenseOption = BdrOption & { expenseDepartment: string | null; bdr26Corr: number | null }

export function buildBdrExpenseDepartmentIndex(rows: BdrExpenseOption[]): Map<string, string[]> {
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

export function buildBdr26CorrIndex(rows: BdrExpenseOption[]): Map<string, number> {
  const index = new Map<string, number>()
  for (const row of rows) {
    if (row.departmentId === null || row.objectId === null || row.contractId === null || row.bdr26Corr === null) continue
    index.set(`${row.departmentId}:${row.objectId}:${row.contractId}`, row.bdr26Corr)
  }
  return index
}

export function getBdr26Corr(
  index: Map<string, number>,
  departmentId: string,
  objectIds: string[],
  contractId: string,
): number | null {
  if (!departmentId || !contractId) return null
  const amounts = [...new Set(objectIds)].flatMap((id) => {
    const amount = index.get(`${departmentId}:${id}:${contractId}`)
    return amount === undefined ? [] : [amount]
  })
  return amounts.length ? amounts.reduce((sum, amount) => sum + amount, 0) : null
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

