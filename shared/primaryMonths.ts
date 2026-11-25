export const PRIMARY_QUARTERS = [
  [
    { key: 'january', label: 'Январь' },
    { key: 'february', label: 'Февраль' },
    { key: 'march', label: 'Март' },
  ],
  [
    { key: 'april', label: 'Апрель' },
    { key: 'may', label: 'Май' },
    { key: 'june', label: 'Июнь' },
  ],
  [
    { key: 'july', label: 'Июль' },
    { key: 'august', label: 'Август' },
    { key: 'september', label: 'Сентябрь' },
  ],
  [
    { key: 'october', label: 'Октябрь' },
    { key: 'november', label: 'Ноябрь' },
    { key: 'december', label: 'Декабрь' },
  ],
] as const

export type PrimaryMonth = (typeof PRIMARY_QUARTERS)[number][number]['key']
export const PRIMARY_MONTHS = PRIMARY_QUARTERS.flat()

export function isPrimaryMonth(value: unknown): value is PrimaryMonth {
  return PRIMARY_MONTHS.some((month) => month.key === value)
}

export function primaryMonthStatusClass(status?: { sedLaunched: boolean; acceptedIn1C: boolean }): string {
  if (!status?.sedLaunched) return status?.acceptedIn1C ? '' : 'status-cell--inactive'
  return status.acceptedIn1C ? 'status-cell--active' : 'status-cell--pending'
}
