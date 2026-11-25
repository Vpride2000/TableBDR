export type LookupOption = { value: string; label: string }

export function mapLookupOptions(
  rows: Array<Record<string, unknown>>,
  valueKey: string,
  labelKey: string,
): LookupOption[] {
  return rows.map((row) => ({
    value: String(row[valueKey] ?? ''),
    label: String(row[labelKey] ?? ''),
  }))
}

export function displayLookupLabel(options: LookupOption[], value: unknown): string {
  const normalizedValue = String(value ?? '')
  return options.find((option) => option.value === normalizedValue)?.label ?? normalizedValue
}
