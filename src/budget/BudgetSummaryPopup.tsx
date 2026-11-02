import { useEffect, useMemo, useState } from 'react';
import { formatHttpError } from '../utils/httpUtils';

// Попап со сводом БДР по двум выбранным полям.

type Row = Record<string, unknown>;

function parseNumericValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

const SUMMARY_NUMBER_FORMATTER = new Intl.NumberFormat('ru-RU');
const BDR_SUMMARY_COLUMNS = [
  'Статья бюджета УС',
  'Подразделение',
  'Объект',
  'Договор',
  'Контрагент',
  'Статья бюджета',
  'БДР25корр',
  'БДР26',
  'БДР26корр',
  'БДР27',
] as const;
type BdrSummaryColumn = typeof BDR_SUMMARY_COLUMNS[number];
type SummarySortColumn = 'first' | 'second';
type SummarySortDirection = 'asc' | 'desc';

const BDR_SUMMARY_VALUE_COLUMNS = [
  { value: 'Лимит', label: 'Лимит' },
  { value: 'БДР25корр', label: 'БДР25корр' },
  { value: 'БДР26', label: 'БДР26' },
  { value: 'БДР26корр', label: 'БДР26корр' },
  { value: 'БДР27', label: 'БДР27' },
] as const;
type BdrSummaryValueColumn = typeof BDR_SUMMARY_VALUE_COLUMNS[number]['value'];

const BDR_SUMMARY_COLUMN_LABELS: Record<BdrSummaryColumn, string> = {
  'Статья бюджета УС': 'Статья бюджета УС',
  Подразделение: 'Подразделение',
  Объект: 'Объект',
  Договор: 'Договор',
  Контрагент: 'Контрагент',
  'Статья бюджета': 'Статья бюджета ГН',
  БДР25корр: 'БДР25корр',
  БДР26: 'БДР26',
  БДР26корр: 'БДР26корр',
  БДР27: 'БДР27',
};

function isBdrSummaryColumn(value: string): value is BdrSummaryColumn {
  return BDR_SUMMARY_COLUMNS.some((column) => column === value);
}

function isBdrSummaryValueColumn(value: string): value is BdrSummaryValueColumn {
  return BDR_SUMMARY_VALUE_COLUMNS.some((column) => column.value === value);
}

export default function BudgetSummaryPopup() {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryFirstColumn, setSummaryFirstColumn] = useState<BdrSummaryColumn>('Подразделение');
  const [summarySecondColumn, setSummarySecondColumn] = useState<BdrSummaryColumn>('Статья бюджета УС');
  const [swapSummaryColumns, setSwapSummaryColumns] = useState(false);
  const [isThreeDimensional, setIsThreeDimensional] = useState(false);
  const [summaryValueColumn, setSummaryValueColumn] = useState<BdrSummaryValueColumn>('БДР26корр');
  const [summarySort, setSummarySort] = useState<{ column: SummarySortColumn; direction: SummarySortDirection }>({
    column: 'first',
    direction: 'asc',
  });

  useEffect(() => {
    fetch('/api/gn/bdr')
      .then((res) => {
        if (!res.ok) throw new Error(formatHttpError(res.status));
        return res.json() as Promise<Row[]>;
      })
      .then((rows) => setData(rows))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const summaryBySelectedColumns = useMemo(() => {
    const combinations = new Map<string, { firstValue: string; secondValue: string }>();
    data.forEach((row) => {
      const firstValue = String(row[summaryFirstColumn] ?? '').trim() || '—';
      const secondValue = String(row[summarySecondColumn] ?? '').trim() || '—';
      const key = JSON.stringify([firstValue, secondValue]);
      combinations.set(key, { firstValue, secondValue });
    });
    const primaryColumn = summarySort.column === 'first'
      ? (swapSummaryColumns ? 'secondValue' : 'firstValue')
      : (swapSummaryColumns ? 'firstValue' : 'secondValue');
    const secondaryColumn = primaryColumn === 'firstValue' ? 'secondValue' : 'firstValue';
    const directionMultiplier = summarySort.direction === 'asc' ? 1 : -1;
    return [...combinations.values()].sort((a, b) => (
      directionMultiplier * a[primaryColumn].localeCompare(b[primaryColumn], 'ru', { numeric: true, sensitivity: 'base' })
      || a[secondaryColumn].localeCompare(b[secondaryColumn], 'ru', { numeric: true, sensitivity: 'base' })
    ));
  }, [data, summaryFirstColumn, summarySecondColumn, summarySort, swapSummaryColumns]);

  const summaryPivot = useMemo(() => {
    const rowField = swapSummaryColumns ? summarySecondColumn : summaryFirstColumn;
    const headerField = swapSummaryColumns ? summaryFirstColumn : summarySecondColumn;
    const valuesByRow = new Map<string, Map<string, number>>();
    const rowValues = new Set<string>();
    const headerValues = new Set<string>();

    data.forEach((row) => {
      const rowValue = String(row[rowField] ?? '').trim() || '—';
      const headerValue = String(row[headerField] ?? '').trim() || '—';
      const numericValue = parseNumericValue(row[summaryValueColumn]);
      rowValues.add(rowValue);
      headerValues.add(headerValue);
      const currentRow = valuesByRow.get(rowValue) ?? new Map<string, number>();
      currentRow.set(headerValue, (currentRow.get(headerValue) ?? 0) + numericValue);
      valuesByRow.set(rowValue, currentRow);
    });

    const rows = [...rowValues].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' }));
    const headers = [...headerValues].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' }));
    const totalsByHeader = new Map(headers.map((header) => [header, 0]));
    const rowTotals = new Map<string, number>();
    rows.forEach((rowValue) => {
      let rowTotal = 0;
      headers.forEach((header) => {
        const value = valuesByRow.get(rowValue)?.get(header) ?? 0;
        rowTotal += value;
        totalsByHeader.set(header, (totalsByHeader.get(header) ?? 0) + value);
      });
      rowTotals.set(rowValue, rowTotal);
    });
    const total = [...rowTotals.values()].reduce((sum, value) => sum + value, 0);

    return { rowField, headerField, rows, headers, valuesByRow, rowTotals, totalsByHeader, total };
  }, [data, summaryFirstColumn, summarySecondColumn, summaryValueColumn, swapSummaryColumns]);

  function toggleSummarySort(column: SummarySortColumn): void {
    setSummarySort((current) => ({
      column,
      direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  return (
    <section className="budget">
      <h2 style={{ padding: '12px 16px', marginBottom: '8px' }}>Своды по лимитам</h2>
      {loading && <p className="hint">Загрузка данных...</p>}
      {error && <p className="hint hint--error">Ошибка: {error}</p>}

      {!loading && !error && (
        <div className="guide-table-wrap budget-summary-wrap">
          <div style={{ display: 'grid', gap: '8px', justifyItems: 'start', padding: '0 16px 12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="checkbox"
                checked={isThreeDimensional}
                onChange={(event) => setIsThreeDimensional(event.target.checked)}
              />
              2D/3D
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              {isThreeDimensional ? 'Столбец слева' : 'Первый столбец'}
              <select
                value={summaryFirstColumn}
                onChange={(event) => {
                  if (isBdrSummaryColumn(event.target.value)) setSummaryFirstColumn(event.target.value);
                }}
              >
                {BDR_SUMMARY_COLUMNS.map((column) => (
                  <option key={column} value={column}>{BDR_SUMMARY_COLUMN_LABELS[column]}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              {isThreeDimensional ? 'Строка заголовок' : 'Второй столбец'}
              <select
                value={summarySecondColumn}
                onChange={(event) => {
                  if (isBdrSummaryColumn(event.target.value)) setSummarySecondColumn(event.target.value);
                }}
              >
                {BDR_SUMMARY_COLUMNS.map((column) => (
                  <option key={column} value={column}>{BDR_SUMMARY_COLUMN_LABELS[column]}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="checkbox"
                checked={swapSummaryColumns}
                onChange={(event) => setSwapSummaryColumns(event.target.checked)}
              />
              Поменять местами столбцы
            </label>
            {isThreeDimensional && (
              <label style={{ display: 'grid', gap: '4px' }}>
                Значение (числовое поле)
                <select
                  value={summaryValueColumn}
                  onChange={(event) => {
                    if (isBdrSummaryValueColumn(event.target.value)) setSummaryValueColumn(event.target.value);
                  }}
                >
                  {BDR_SUMMARY_VALUE_COLUMNS.map((column) => (
                    <option key={column.value} value={column.value}>{column.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {!isThreeDimensional ? (
            <table className="guide-table table-compact budget-summary-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="dashboard-object-summary__sort-button" onClick={() => toggleSummarySort('first')}>
                    {BDR_SUMMARY_COLUMN_LABELS[swapSummaryColumns ? summarySecondColumn : summaryFirstColumn]}
                    {summarySort.column === 'first' ? (summarySort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
                <th>
                  <button type="button" className="dashboard-object-summary__sort-button" onClick={() => toggleSummarySort('second')}>
                    {BDR_SUMMARY_COLUMN_LABELS[swapSummaryColumns ? summaryFirstColumn : summarySecondColumn]}
                    {summarySort.column === 'second' ? (summarySort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {summaryBySelectedColumns.map((item) => (
                <tr key={JSON.stringify([item.firstValue, item.secondValue])} className="budget-summary-department-row">
                  <td>{swapSummaryColumns ? item.secondValue : item.firstValue}</td>
                  <td>{swapSummaryColumns ? item.firstValue : item.secondValue}</td>
                </tr>
              ))}
            </tbody>
            </table>
          ) : (
            <div className="guide-table-wrap">
              <table className="guide-table table-compact budget-summary-pivot-table">
                <thead>
                  <tr>
                    <th>{BDR_SUMMARY_COLUMN_LABELS[summaryPivot.rowField]}</th>
                    {summaryPivot.headers.map((header) => <th key={header}>{header}</th>)}
                    <th>Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryPivot.rows.map((rowValue) => (
                    <tr key={rowValue}>
                      <td>{rowValue}</td>
                      {summaryPivot.headers.map((header) => (
                        <td key={`${rowValue}-${header}`} className="number-cell">
                          {SUMMARY_NUMBER_FORMATTER.format(summaryPivot.valuesByRow.get(rowValue)?.get(header) ?? 0)}
                        </td>
                      ))}
                      <td className="number-cell">{SUMMARY_NUMBER_FORMATTER.format(summaryPivot.rowTotals.get(rowValue) ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="budget-summary-total-row">
                    <td>Итого</td>
                    {summaryPivot.headers.map((header) => (
                      <td key={header} className="number-cell">
                        {SUMMARY_NUMBER_FORMATTER.format(summaryPivot.totalsByHeader.get(header) ?? 0)}
                      </td>
                    ))}
                    <td className="number-cell">{SUMMARY_NUMBER_FORMATTER.format(summaryPivot.total)}</td>
                  </tr>
                </tfoot>
              </table>
              <p className="hint">Значение в ячейках — сумма поля «{summaryValueColumn}».</p>
            </div>
          )}
        </div>
      )}

    </section>
  );
}
