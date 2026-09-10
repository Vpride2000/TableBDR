// Общая логика сводной таблицы импортозамещения:
// суммирование количества ТКО по классификациям и расчет доли «РФ в реестре».

export const TKO_CLASSIFICATIONS = ['РФ НЕ в реестре', 'Импорт', 'РФ в реестре'] as const;
export type TkoClassification = (typeof TKO_CLASSIFICATIONS)[number];
export type TkoSummarySortDirection = 'asc' | 'desc';
export type TkoSummarySortKey = 'code' | 'departments' | 'vendors' | 'total' | 'withdrawnImportedTko' | 'registryPercentage' | TkoClassification;

type Row = Record<string, unknown>;

export interface TkoSummaryRow {
  code: string;
  departments: string[];
  vendors: string[];
  quantities: Record<TkoClassification, number>;
  total: number;
  withdrawnImportedTko: number;
  registryPercentage: number;
}

function parseNumericValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function buildSummaryByField(
  rows: Row[],
  groupField: string,
  emptyLabel?: string,
  cumulativeYear?: boolean
): TkoSummaryRow[] {
  const quantitiesByCode = new Map<string, Record<TkoClassification, number>>();
  const withdrawnImportedTkoByCode = new Map<string, number>();
  const departmentsByCode = new Map<string, Set<string>>();
  const vendorsByCode = new Map<string, Set<string>>();

  rows.forEach((row) => {
    const rawValue = String(row[groupField] ?? '').trim();
    const code = rawValue || (emptyLabel ?? '');
    if (!code) return;
    const department = String(row['Подразделение'] ?? '').trim();
    if (department) {
      const departments = departmentsByCode.get(code) ?? new Set<string>();
      departments.add(department);
      departmentsByCode.set(code, departments);
    }
    const vendor = String(row['Вендор ТКО'] ?? '').trim();
    if (vendor) {
      const vendors = vendorsByCode.get(code) ?? new Set<string>();
      vendors.add(vendor);
      vendorsByCode.set(code, vendors);
    }
    withdrawnImportedTkoByCode.set(
      code,
      (withdrawnImportedTkoByCode.get(code) ?? 0) + parseNumericValue(row['Кол-во выводенного импортного ТКО'])
    );
    const classification = String(row['Классификация ТКО'] ?? '').trim();
    if (!TKO_CLASSIFICATIONS.includes(classification as TkoClassification)) return;

    const quantities = quantitiesByCode.get(code) ?? {
      'РФ НЕ в реестре': 0,
      'Импорт': 0,
      'РФ в реестре': 0,
    };
    quantities[classification as TkoClassification] += parseNumericValue(row['Количество']);
    quantitiesByCode.set(code, quantities);
  });

  const summaryRows = [...quantitiesByCode.entries()]
    .map(([code, quantities]) => ({
      code,
      departments: [...(departmentsByCode.get(code) ?? [])].sort((a, b) => a.localeCompare(b, 'ru')),
      vendors: [...(vendorsByCode.get(code) ?? [])].sort((a, b) => a.localeCompare(b, 'ru')),
      quantities,
      total: TKO_CLASSIFICATIONS.reduce((sum, classification) => sum + quantities[classification], 0),
      withdrawnImportedTko: withdrawnImportedTkoByCode.get(code) ?? 0,
      registryPercentage: 0,
    }))
    .sort((left, right) => left.code.localeCompare(right.code, 'ru', { numeric: true }));

  const finalRows = cumulativeYear && groupField === 'Год'
    ? applyYearCumulative(summaryRows, emptyLabel ?? '')
    : summaryRows;

  return finalRows.map((summaryRow) => ({
    ...summaryRow,
    registryPercentage: summaryRow.total - summaryRow.withdrawnImportedTko === 0
      ? 0
      : (summaryRow.quantities['РФ в реестре'] / (summaryRow.total - summaryRow.withdrawnImportedTko)) * 100,
  }));
}

// Для уровня «Год» количество нарастает: в итог года попадают данные этого и всех предыдущих лет,
// а также данные без указания года (они добавляются к каждому году, но не накапливаются сами по себе).
function applyYearCumulative(rows: TkoSummaryRow[], emptyLabel: string): TkoSummaryRow[] {
  const emptyRow = rows.find((row) => row.code === emptyLabel);
  const yearRows = rows.filter((row) => row.code !== emptyLabel && /\d/.test(row.code));
  const otherRows = rows.filter((row) => row.code !== emptyLabel && !/\d/.test(row.code));

  const emptyQuantities = emptyRow?.quantities ?? {
    'РФ НЕ в реестре': 0,
    'Импорт': 0,
    'РФ в реестре': 0,
  };
  const emptyDepartments = new Set(emptyRow?.departments ?? []);
  const emptyVendors = new Set(emptyRow?.vendors ?? []);

  const sortedYearRows = [...yearRows].sort((left, right) => Number(left.code) - Number(right.code));

  const runningQuantities: Record<TkoClassification, number> = { ...emptyQuantities };
  let runningWithdrawnImportedTko = emptyRow?.withdrawnImportedTko ?? 0;
  const runningDepartments = new Set(emptyDepartments);
  const runningVendors = new Set(emptyVendors);

  const cumulativeYearRows = sortedYearRows.map((row) => {
    TKO_CLASSIFICATIONS.forEach((classification) => {
      runningQuantities[classification] += row.quantities[classification];
    });
    runningWithdrawnImportedTko += row.withdrawnImportedTko;
    row.departments.forEach((department) => runningDepartments.add(department));
    row.vendors.forEach((vendor) => runningVendors.add(vendor));

    return {
      code: row.code,
      departments: [...runningDepartments].sort((a, b) => a.localeCompare(b, 'ru')),
      vendors: [...runningVendors].sort((a, b) => a.localeCompare(b, 'ru')),
      quantities: { ...runningQuantities },
      total: TKO_CLASSIFICATIONS.reduce((sum, classification) => sum + runningQuantities[classification], 0),
      withdrawnImportedTko: runningWithdrawnImportedTko,
      registryPercentage: 0,
    };
  });

  const result = [...cumulativeYearRows, ...otherRows];
  if (emptyRow) result.push(emptyRow);
  return result;
}

export function sortSummaryRows(
  rows: TkoSummaryRow[],
  sortKey: TkoSummarySortKey,
  direction: TkoSummarySortDirection = 'asc'
): TkoSummaryRow[] {
  return [...rows].sort((left, right) => {
    const leftValue = (() => {
      switch (sortKey) {
        case 'code':
          return left.code;
        case 'departments':
          return left.departments.join(', ');
        case 'vendors':
          return left.vendors.join(', ');
        case 'total':
          return left.total;
        case 'withdrawnImportedTko':
          return left.withdrawnImportedTko;
        case 'registryPercentage':
          return left.registryPercentage;
        default:
          return left.quantities[sortKey] ?? 0;
      }
    })();

    const rightValue = (() => {
      switch (sortKey) {
        case 'code':
          return right.code;
        case 'departments':
          return right.departments.join(', ');
        case 'vendors':
          return right.vendors.join(', ');
        case 'total':
          return right.total;
        case 'withdrawnImportedTko':
          return right.withdrawnImportedTko;
        case 'registryPercentage':
          return right.registryPercentage;
        default:
          return right.quantities[sortKey] ?? 0;
      }
    })();

    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), 'ru', { numeric: true, sensitivity: 'base' });

    return direction === 'asc' ? comparison : -comparison;
  });
}

export function buildTkoQuantitySummary(rows: Row[]): TkoSummaryRow[] {
  return buildSummaryByField(rows, 'Код ТКО');
}
