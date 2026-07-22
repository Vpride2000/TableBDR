import { useEffect, useMemo, useState } from 'react';
import { formatHttpError } from '../utils/forecastUtils';
import BudgetSummaryByDepartment from './BudgetSummaryByDepartment';
import BudgetSummaryByPaoItem from './BudgetSummaryByPaoItem';
import BudgetSummaryByBudgetItemDepartment from './BudgetSummaryByBudgetItemDepartment';

// Попап-страница для отображения одной из сводных таблиц бюджета.
// Загружает данные самостоятельно и рендерит нужный вид без ленивой загрузки.

type Row = Record<string, unknown>;

export type BudgetSummaryView = 'dept' | 'pao' | 'matrix';

interface Props {
  view: BudgetSummaryView;
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

const VIEW_TITLES: Record<BudgetSummaryView, string> = {
  dept: 'Свод по лимитам по подразделениям',
  pao: 'Свод по лимитам по статьям бюджета УС',
  matrix: 'Свод лимитов: подразделения × статьи бюджета',
};

export default function BudgetSummaryPopup({ view }: Props) {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const summaryByDepartment = useMemo(() => {
    const totals = new Map<string, { total: number; byPaoItem: Map<string, number> }>();
    data.forEach((row) => {
      const department = String(row['Подразделение'] ?? '').trim() || 'Без подразделения';
      const paoItem = String(row['Статья бюджета УС'] ?? '').trim() || 'Без статьи бюджета УС';
      const limit = parseNumericValue(row['Лимит']);
      const current = totals.get(department) ?? { total: 0, byPaoItem: new Map<string, number>() };
      current.total += limit;
      current.byPaoItem.set(paoItem, (current.byPaoItem.get(paoItem) ?? 0) + limit);
      totals.set(department, current);
    });
    return [...totals.entries()]
      .map(([department, value]) => ({
        department,
        totalLimit: value.total,
        paoItems: [...value.byPaoItem.entries()]
          .map(([paoItem, totalLimit]) => ({ paoItem, totalLimit }))
          .sort((a, b) => a.paoItem.localeCompare(b.paoItem, 'ru')),
      }))
      .sort((a, b) => a.department.localeCompare(b.department, 'ru'));
  }, [data]);

  const summaryByPaoItem = useMemo(() => {
    const totals = new Map<string, number>();
    data.forEach((row) => {
      const paoItem = String(row['Статья бюджета УС'] ?? '').trim() || 'Без статьи бюджета УС';
      const limit = parseNumericValue(row['Лимит']);
      totals.set(paoItem, (totals.get(paoItem) ?? 0) + limit);
    });
    return [...totals.entries()]
      .map(([paoItem, totalLimit]) => ({ paoItem, totalLimit }))
      .sort((a, b) => a.paoItem.localeCompare(b.paoItem, 'ru'));
  }, [data]);

  const summaryByBudgetItemDepartment = useMemo(() => {
    const departmentsSet = new Set<string>();
    const byBudgetItem = new Map<string, Map<string, number>>();
    data.forEach((row) => {
      const budgetItem = String(row['Статья бюджета'] ?? '').trim() || 'Без статьи бюджета';
      const department = String(row['Подразделение'] ?? '').trim() || 'Без подразделения';
      const limit = parseNumericValue(row['Лимит']);
      departmentsSet.add(department);
      const budgetItemRow = byBudgetItem.get(budgetItem) ?? new Map<string, number>();
      budgetItemRow.set(department, (budgetItemRow.get(department) ?? 0) + limit);
      byBudgetItem.set(budgetItem, budgetItemRow);
    });
    const departments = [...departmentsSet].sort((a, b) => a.localeCompare(b, 'ru'));
    const budgetItems = [...byBudgetItem.keys()].sort((a, b) => a.localeCompare(b, 'ru'));
    const rows = budgetItems.map((budgetItem) => {
      const source = byBudgetItem.get(budgetItem) ?? new Map<string, number>();
      const byDepartment: Record<string, number> = {};
      departments.forEach((dep) => { byDepartment[dep] = source.get(dep) ?? 0; });
      const total = departments.reduce((sum, dep) => sum + byDepartment[dep], 0);
      return { budgetItem, byDepartment, total };
    });
    const totalsByDepartment: Record<string, number> = {};
    departments.forEach((dep) => {
      totalsByDepartment[dep] = rows.reduce((sum, row) => sum + (row.byDepartment[dep] ?? 0), 0);
    });
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    return { departments, rows, totalsByDepartment, total };
  }, [data]);

  return (
    <section className="budget">
      <h2 style={{ padding: '12px 16px', marginBottom: '8px' }}>{VIEW_TITLES[view]}</h2>
      {loading && <p className="hint">Загрузка данных...</p>}
      {error && <p className="hint hint--error">Ошибка: {error}</p>}

      {!loading && !error && view === 'dept' && (
        <div className="guide-table-wrap budget-summary-wrap budget-summary-wrap--matrix">
          <BudgetSummaryByDepartment
            summaryByDepartment={summaryByDepartment}
            summaryTotalLimit={summaryByDepartment.reduce((s, i) => s + i.totalLimit, 0)}
          />
        </div>
      )}

      {!loading && !error && view === 'pao' && (
        <div className="guide-table-wrap budget-summary-wrap">
          <BudgetSummaryByPaoItem
            summaryByPaoItem={summaryByPaoItem}
            summaryPaoTotalLimit={summaryByPaoItem.reduce((s, i) => s + i.totalLimit, 0)}
          />
        </div>
      )}

      {!loading && !error && view === 'matrix' && (
        <div className="guide-table-wrap budget-summary-wrap">
          <BudgetSummaryByBudgetItemDepartment
            departments={summaryByBudgetItemDepartment.departments}
            rows={summaryByBudgetItemDepartment.rows}
            totalsByDepartment={summaryByBudgetItemDepartment.totalsByDepartment}
            total={summaryByBudgetItemDepartment.total}
          />
        </div>
      )}
    </section>
  );
}
