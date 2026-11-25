type BdrObjectRow = Record<string, unknown>;

export function getBdrObjectNames(row: BdrObjectRow): string[] {
  const values = Array.isArray(row['Объекты']) ? row['Объекты'] : [row['Объект']];
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

export function formatBdrObjectNames(row: BdrObjectRow): string {
  return getBdrObjectNames(row).join(', ');
}
