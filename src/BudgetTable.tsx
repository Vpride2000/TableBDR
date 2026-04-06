import { Suspense, useEffect, useMemo, useState, lazy } from 'react';
import './styles.css';

const DepartmentSummaryTable = lazy(() => import('./BudgetSummaryByDepartment'));
const PaoItemSummaryTable = lazy(() => import('./BudgetSummaryByPaoItem'));
const BudgetItemDepartmentSummaryTable = lazy(() => import('./BudgetSummaryByBudgetItemDepartment'));

type Row = Record<string, unknown>;
type SortDirection = 'asc' | 'desc';
const BDR_UPDATED_EVENT_KEY = 'bdr:last-update';
type SelectOption = { value: string; label: string };
const FINANCIAL_NUMBER_FORMATTER = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BDR_SELECT_CONFIG: Record<string, { endpoint: string; labelKey: string }> = {
  'Статья бюджета УС': { endpoint: '/api/gn/pao-budget-items', labelKey: 'PAO__budget_network_item' },
  Подразделение: { endpoint: '/api/gn/departments', labelKey: 'GN_department' },
  Объект: { endpoint: '/api/gn/objects', labelKey: 'GN_departament_object' },
  Договор: { endpoint: '/api/gn/dogovors', labelKey: 'GN_dogovor' },
  Контрагент: { endpoint: '/api/gn/contractors', labelKey: 'GN_contarctor' },
  'Статья бюджета': { endpoint: '/api/gn/budget-items', labelKey: 'GN_budget_network_item' },
};

const LOCKED_EDIT_COLUMNS = new Set(['Ед. изм.', 'Кол-во', 'Лимит', 'Един. лимит']);
const MAIN_HIDDEN_COLUMNS = new Set(['Ед. изм.', 'Кол-во', 'Един. лимит', 'Предмет договора']);
const COLUMN_TITLES: Record<string, string> = {
  GN_bdr_ID: '№',
};

interface SortState {
  key: string;
  direction: SortDirection;
}

function parseComparable(value: unknown): number | string {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (!Number.isNaN(asNumber) && value.trim() !== '') return asNumber;

    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate)) return asDate;

    return value.toLowerCase();
  }
  if (value == null) return '';
  return String(value).toLowerCase();
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

function formatFinancialValue(value: unknown): string {
  return FINANCIAL_NUMBER_FORMATTER.format(parseNumericValue(value));
}

interface BudgetTableProps {
  onAddRow: () => void;
  onOpenLimit: (rowId: number) => void;
  onOpenContract: (contractName: string) => void;
}

export default function BudgetTable({ onAddRow, onOpenLimit, onOpenContract }: BudgetTableProps) {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState | null>({
    key: 'Статья бюджета УС',
    direction: 'asc',
  });
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lookupRows, setLookupRows] = useState<Record<string, Row[]>>({});
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [isDepartmentSummaryExpanded, setIsDepartmentSummaryExpanded] = useState(false);
  const [isPaoSummaryExpanded, setIsPaoSummaryExpanded] = useState(false);
  const [isBudgetItemDepartmentSummaryExpanded, setIsBudgetItemDepartmentSummaryExpanded] = useState(false);

  function setFilter(column: string, value: string): void {
    setFilters((prev) => ({ ...prev, [column]: value }));
  }

  function loadData(): Promise<void> {
    setLoading(true);
    setError(null);

    return fetch('/api/gn/bdr')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Row[]>;
      })
      .then((rows) => setData(rows))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    function onStorage(event: StorageEvent): void {
      if (event.key !== BDR_UPDATED_EVENT_KEY) return;
      void loadData();
    }

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    async function loadSelectOptions(): Promise<void> {
      const entries = Object.entries(BDR_SELECT_CONFIG);
      const loaded = await Promise.all(
        entries.map(async ([column, config]) => {
          const res = await fetch(config.endpoint);
          if (!res.ok) return [column, [] as Row[]] as const;
          const rows = (await res.json()) as Row[];
          return [column, rows] as const;
        })
      );

      setLookupRows(Object.fromEntries(loaded));
    }

    void loadSelectOptions();
  }, []);

  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  const orderedColumns = useMemo(() => {
    const next = [...columns];
    const contractorIndex = next.indexOf('Контрагент');
    const dogovorIndex = next.indexOf('Договор');

    if (contractorIndex === -1 || dogovorIndex === -1) {
      return next;
    }

    if (contractorIndex > dogovorIndex) {
      next[contractorIndex] = 'Договор';
      next[dogovorIndex] = 'Контрагент';
    }

    return next;
  }, [columns]);

  const visibleMainColumns = useMemo(
    () => orderedColumns.filter((col) => !MAIN_HIDDEN_COLUMNS.has(col)),
    [orderedColumns]
  );

  const sortedData = useMemo(() => {
    if (!sort) return data;

    const { key, direction } = sort;
    const order = direction === 'asc' ? 1 : -1;

    return [...data].sort((a, b) => {
      const aValue = parseComparable(a[key]);
      const bValue = parseComparable(b[key]);

      if (aValue < bValue) return -1 * order;
      if (aValue > bValue) return 1 * order;
      return 0;
    });
  }, [data, sort]);

  const filteredData = useMemo(() => {
    return sortedData.filter((row) =>
      orderedColumns.every((col) => {
        const filterValue = (filters[col] ?? '').trim().toLowerCase();
        if (!filterValue) return true;
        return String(row[col] ?? '').toLowerCase().includes(filterValue);
      })
    );
  }, [sortedData, filters, orderedColumns]);

  const filteredLimitTotal = useMemo(
    () => filteredData.reduce((sum, row) => sum + parseNumericValue(row['Лимит']), 0),
    [filteredData]
  );

  const summaryByDepartment = useMemo(() => {
    const totals = new Map<string, { total: number; byPaoItem: Map<string, number> }>();

    data.forEach((row) => {
      const department = String(row['Подразделение'] ?? '').trim() || 'Без подразделения';
      const paoItem = String(row['Статья бюджета УС'] ?? '').trim() || 'Без статьи бюджета УС';
      const limit = parseNumericValue(row['Лимит']);

      const current = totals.get(department) ?? {
        total: 0,
        byPaoItem: new Map<string, number>(),
      };

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

  const summaryTotalLimit = useMemo(
    () => summaryByDepartment.reduce((acc, item) => acc + item.totalLimit, 0),
    [summaryByDepartment]
  );

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

  const summaryPaoTotalLimit = useMemo(
    () => summaryByPaoItem.reduce((acc, item) => acc + item.totalLimit, 0),
    [summaryByPaoItem]
  );

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

      departments.forEach((department) => {
        byDepartment[department] = source.get(department) ?? 0;
      });

      const total = departments.reduce((sum, department) => sum + byDepartment[department], 0);

      return {
        budgetItem,
        byDepartment,
        total,
      };
    });

    const totalsByDepartment: Record<string, number> = {};
    departments.forEach((department) => {
      totalsByDepartment[department] = rows.reduce((sum, row) => sum + (row.byDepartment[department] ?? 0), 0);
    });

    const total = rows.reduce((sum, row) => sum + row.total, 0);

    return {
      departments,
      rows,
      totalsByDepartment,
      total,
    };
  }, [data]);

  function toggleSort(column: string): void {
    setSort((prev) => {
      if (!prev || prev.key !== column) {
        return { key: column, direction: 'asc' };
      }

      return {
        key: column,
        direction: prev.direction === 'asc' ? 'desc' : 'asc',
      };
    });
  }

  function getSortMarker(column: string): string {
    if (!sort || sort.key !== column) return '';
    return sort.direction === 'asc' ? ' ▲' : ' ▼';
  }

  function startEdit(row: Row): void {
    setEditingRowId(Number(row['GN_bdr_ID']));
    setDraft({ ...row });
    setSaveError(null);
  }

  function cancelEdit(): void {
    setEditingRowId(null);
    setDraft({});
    setSaveError(null);
  }

  function updateDraft(column: string, value: string): void {
    if (LOCKED_EDIT_COLUMNS.has(column)) {
      return;
    }

    setDraft((prev) => {
      if (column === 'Подразделение') {
        return { ...prev, Подразделение: value, Объект: '' };
      }

      if (column === 'Контрагент') {
        return { ...prev, Контрагент: value, Договор: '' };
      }

      return { ...prev, [column]: value };
    });
  }

  function getSelectOptionsForColumn(column: string): SelectOption[] {
    const config = BDR_SELECT_CONFIG[column];
    if (!config) return [];

    const rows = lookupRows[column] ?? [];

    if (column === 'Объект') {
      const selectedDepartment = String(draft['Подразделение'] ?? '');
      if (!selectedDepartment) return [];

      const departments = lookupRows['Подразделение'] ?? [];
      const departmentRow = departments.find(
        (row) => String(row.GN_department ?? '') === selectedDepartment
      );
      const departmentId = Number(departmentRow?.GN_Dep_id);
      if (Number.isNaN(departmentId)) return [];

      return rows
        .filter((row) => Number(row.GN_department_FK) === departmentId)
        .map((row) => {
          const label = String(row[config.labelKey] ?? '');
          return { value: label, label };
        });
    }

    if (column === 'Договор') {
      const selectedContractor = String(draft['Контрагент'] ?? '');
      if (!selectedContractor) return [];

      const contractors = lookupRows['Контрагент'] ?? [];
      const contractorRow = contractors.find(
        (row) => String(row.GN_contarctor ?? '') === selectedContractor
      );
      const contractorId = Number(contractorRow?.GN_c_id);
      if (Number.isNaN(contractorId)) return [];

      return rows
        .filter((row) => Number(row.GN_contarctor_FK) === contractorId)
        .map((row) => {
          const label = String(row[config.labelKey] ?? '');
          return { value: label, label };
        });
    }

    return rows.map((row) => {
      const label = String(row[config.labelKey] ?? '');
      return { value: label, label };
    });
  }

  async function saveEdit(): Promise<void> {
    if (editingRowId == null) return;
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/gn/bdr/${editingRowId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(draft),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      const updatedRow = (await response.json()) as Row;
      setData((prev) =>
        prev.map((row) => (Number(row['GN_bdr_ID']) === editingRowId ? updatedRow : row))
      );
      localStorage.setItem(BDR_UPDATED_EVENT_KEY, String(Date.now()));
      cancelEdit();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="budget">
      {loading && <p className="hint">Загрузка данных...</p>}
      {error && <p className="hint hint--error">Ошибка: {error}</p>}
      {!loading && !error && data.length === 0 && <p className="hint">Нет данных.</p>}

      {!loading && !error && summaryByDepartment.length > 0 && (
        <div className="budget-summary-row">
          <div className="guide-table-wrap budget-summary-wrap budget-summary-wrap--matrix">
            <button
              type="button"
              className="budget-summary-toggle"
              onClick={() => setIsDepartmentSummaryExpanded((prev) => !prev)}
              aria-expanded={isDepartmentSummaryExpanded}
            >
              Свод по лимитам по подразделениям {isDepartmentSummaryExpanded ? '▼' : '▶'}
            </button>
            {isDepartmentSummaryExpanded && (
              <Suspense fallback={<p className="hint">Загрузка свода...</p>}>
                <DepartmentSummaryTable
                  summaryByDepartment={summaryByDepartment}
                  summaryTotalLimit={summaryTotalLimit}
                />
              </Suspense>
            )}
          </div>

          <div className="guide-table-wrap budget-summary-wrap">
            <button
              type="button"
              className="budget-summary-toggle"
              onClick={() => setIsPaoSummaryExpanded((prev) => !prev)}
              aria-expanded={isPaoSummaryExpanded}
            >
              Свод по лимитам по статьям бюджета УС {isPaoSummaryExpanded ? '▼' : '▶'}
            </button>
            {isPaoSummaryExpanded && (
              <Suspense fallback={<p className="hint">Загрузка свода...</p>}>
                <PaoItemSummaryTable
                  summaryByPaoItem={summaryByPaoItem}
                  summaryPaoTotalLimit={summaryPaoTotalLimit}
                />
              </Suspense>
            )}
          </div>

          <div className="guide-table-wrap budget-summary-wrap">
            <button
              type="button"
              className="budget-summary-toggle"
              onClick={() => setIsBudgetItemDepartmentSummaryExpanded((prev) => !prev)}
              aria-expanded={isBudgetItemDepartmentSummaryExpanded}
            >
              Свод лимитов: подразделения × статьи бюджета {isBudgetItemDepartmentSummaryExpanded ? '▼' : '▶'}
            </button>
            {isBudgetItemDepartmentSummaryExpanded && (
              <Suspense fallback={<p className="hint">Загрузка свода...</p>}>
                <BudgetItemDepartmentSummaryTable
                  departments={summaryByBudgetItemDepartment.departments}
                  rows={summaryByBudgetItemDepartment.rows}
                  totalsByDepartment={summaryByBudgetItemDepartment.totalsByDepartment}
                  total={summaryByBudgetItemDepartment.total}
                />
              </Suspense>
            )}
          </div>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <>
          <div className="guide-table-wrap">
            <table className="guide-table table-compact">
              <thead>
                <tr>
                  {visibleMainColumns.map((col) => {
                    const isLimitColumn = col === 'Лимит';

                    return (
                      <th key={col}>
                        <button
                          type="button"
                          className="table-sort-button"
                          onClick={() => toggleSort(col)}
                        >
                          <span className={isLimitColumn ? 'budget-limit-header' : undefined}>
                            {COLUMN_TITLES[col] ?? col}
                            {isLimitColumn && (
                              <span className="budget-limit-header-total">
                                {FINANCIAL_NUMBER_FORMATTER.format(filteredLimitTotal)}
                              </span>
                            )}
                          </span>
                          {getSortMarker(col)}
                        </button>
                      </th>
                    );
                  })}
                  <th>Действия</th>
                </tr>
                <tr className="filter-row">
                  {visibleMainColumns.map((col) => (
                    <th key={col}>
                      {col === 'GN_bdr_ID' ? null : (
                        <input
                          className="column-filter-input"
                          type="text"
                          value={filters[col] ?? ''}
                          onChange={(e) => setFilter(col, e.target.value)}
                          placeholder="Фильтр..."
                        />
                      )}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, i) => {
                  const rowId = Number(row['GN_bdr_ID']);
                  const isEditing = editingRowId === rowId;

                  return (
                    <tr key={i} className={isEditing ? 'editing' : ''}>
                      {visibleMainColumns.map((col) => (
                        <td key={col}>
                          {isEditing && col !== 'GN_bdr_ID' && LOCKED_EDIT_COLUMNS.has(col) ? (
                            String(draft[col] ?? '')
                          ) : isEditing && col !== 'GN_bdr_ID' && BDR_SELECT_CONFIG[col] ? (
                            (() => {
                              const options = getSelectOptionsForColumn(col);
                              const needsDepartment = col === 'Объект';
                              const needsContractor = col === 'Договор';
                              const disabled =
                                (needsDepartment && !draft['Подразделение']) ||
                                (needsContractor && !draft['Контрагент']);

                              return (
                            <select
                              value={String(draft[col] ?? '')}
                              onChange={(event) => updateDraft(col, event.target.value)}
                              disabled={disabled}
                            >
                              <option value="">
                                {needsDepartment && !draft['Подразделение']
                                  ? 'Сначала выберите Подразделение'
                                  : needsContractor && !draft['Контрагент']
                                    ? 'Сначала выберите Контрагента'
                                    : 'Выберите значение'}
                              </option>
                              {options.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                              );
                            })()
                          ) : isEditing && col !== 'GN_bdr_ID' ? (
                            <input
                              value={String(draft[col] ?? '')}
                              onChange={(event) => updateDraft(col, event.target.value)}
                            />
                          ) : !isEditing && col === 'Лимит' ? (
                            <button
                              type="button"
                              className="limit-cell-button"
                              onClick={() => onOpenLimit(rowId)}
                            >
                              {formatFinancialValue(row[col])}
                            </button>
                          ) : !isEditing && col === 'Договор' && String(row[col] ?? '').trim() !== '' ? (
                            <button
                              type="button"
                              className="contract-cell-button"
                              onClick={() => onOpenContract(String(row[col] ?? ''))}
                            >
                              {String(row[col] ?? '')}
                            </button>
                          ) : (
                            String((isEditing ? draft[col] : row[col]) ?? '')
                          )}
                        </td>
                      ))}
                      <td>
                        {!isEditing ? (
                          <button type="button" onClick={() => startEdit(row)}>испр</button>
                        ) : (
                          <>
                            <button type="button" onClick={() => void saveEdit()} disabled={saving}>сохр</button>
                            <button type="button" onClick={cancelEdit} disabled={saving}>отм</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {saveError && <p className="hint hint--error">Ошибка редактирования: {saveError}</p>}
          </div>

          <div className="budget-actions">
            <button type="button" className="page-action-btn" onClick={onAddRow}>
              Добавить строку
            </button>
          </div>
        </>
      )}
    </section>
  );
}
