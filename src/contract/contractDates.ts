export function normalizeDateValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  const normalizedValue = String(value ?? '')
  if (normalizedValue === '') return ''
  return normalizedValue.length >= 10 ? normalizedValue.slice(0, 10) : normalizedValue
}

export function formatDateDisplay(value: string): string {
  if (!value) return value
  const dateOnly = value.slice(0, 10)
  if (dateOnly.length < 10) return value
  const [year, month, day] = dateOnly.split('-')
  const shortYear = year.slice(-2)
  return `${day}.${month}.${shortYear}`
}
