import type { PrimaryMonth } from './primaryMonths.js'

export type PrimaryImportMonth = PrimaryMonth

export type PrimaryImportFields = {
  departmentId?: number | null
  objectIds?: number[]
  contractId?: number | null
  personalAccount?: string
  amountWithVat?: number | null
  sedLaunched?: boolean
  acceptedIn1C?: boolean
  note?: string
}

export type PrimaryImportRecord = { rowNumber: number; id?: number; fields: PrimaryImportFields }
