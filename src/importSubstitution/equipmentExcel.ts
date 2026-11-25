import * as XLSX from 'xlsx'
import { EQUIPMENT_EXCEL_COLUMNS } from './equipmentHistory'

export function createEquipmentWorkbook(data: Record<string, unknown>[]): XLSX.WorkBook {
  const header = ['№', ...EQUIPMENT_EXCEL_COLUMNS]
  const rows = data.map((row) => [
    row['GN_import_substitution_id'] ?? '',
    ...EQUIPMENT_EXCEL_COLUMNS.map((column) => {
      const value = row[column]
      return Array.isArray(value) ? JSON.stringify(value) : value ?? ''
    }),
  ])
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows])
  worksheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }),
  }
  worksheet['!cols'] = header.map((title, index) => ({
    wch: Math.min(44, Math.max(12, ...[title, ...rows.map((row) => String(row[index] ?? ''))].map((value) => value.length + 2))),
  }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Учет оборудования')
  return workbook
}
