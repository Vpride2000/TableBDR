export const DASHBOARD_BDR_FIELDS = [
  { value: 'Лимит', label: 'БДР25' },
  { value: 'БДР25корр', label: 'БДР25корр' },
  { value: 'БДР26', label: 'БДР26' },
  { value: 'БДР26корр', label: 'БДР26корр' },
  { value: 'БДР27', label: 'БДР27' },
] as const

export type DashboardBdrField = typeof DASHBOARD_BDR_FIELDS[number]['value']

export const DEFAULT_DASHBOARD_BDR_FIELD: DashboardBdrField = 'БДР26корр'

export function isDashboardBdrField(value: unknown): value is DashboardBdrField {
  return DASHBOARD_BDR_FIELDS.some((field) => field.value === value)
}
