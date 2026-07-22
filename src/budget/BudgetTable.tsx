import { useEffect, useMemo, useState } from 'react';
import { formatHttpError, formatErrorMessage } from '../utils/forecastUtils';
import MainBudgetTableContent from './MainBudgetTableContent';

// Компонент таблицы лимитов по услугам связи.
// Загружает список BDR-строк, поддерживает сортировку, фильтрацию и редактирование строк.

type Row = Record<string, unknown>;
interface BudgetTableProps {
  onAddRow: () => void;
  onOpenLimit: (rowId: number) => void;
  onOpenContract: (contractId: number) => void;
  onOpenObject: (rowId: number) => void;
  onOpenDepartment: (rowId: number) => void;
  onOpenContractor: (rowId: number) => void;
  showMainTable?: boolean;
}
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
const EXTRA_NUMERIC_COLUMNS = new Set(['БДР25корр', 'БДР26', 'БДР26корр']);
const MAIN_HIDDEN_COLUMNS = new Set(['Ед. изм.', 'Кол-во', 'Един. лимит', 'Предмет договора', 'Примечания']);
const COLUMN_TITLES: Record<string, string> = {
  GN_bdr_ID: '№',
  Лимит: 'БДР25',
  БДР25корр: 'БДР25корр',
  БДР26: 'БДР26',
  БДР26корр: 'БДР26корр',
};

interface SortState {
  key: string;
  direction: SortDirection;
}

// Приводит значение в формат, удобный для сортировки.
// Числа и даты сортируются как числа, остальные строки — как нижний регистр.
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

// Преобразует значение из строки или числа в нормальное количество.
// Пустые строки и нечисловые значения считаются нулем.
function parseNumericValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// Форматирует числовое значение в денежный вид для таблицы бюджета.
function formatFinancialValue(value: unknown): string {
  return FINANCIAL_NUMBER_FORMATTER.format(parseNumericValue(value));
}

interface BudgetTableProps {
  onAddRow: () => void;
  onOpenLimit: (rowId: number) => void;
  onOpenContract: (contractId: number) => void;
  onOpenObject: (rowId: number) => void;
  onOpenDepartment: (rowId: number) => void;
  onOpenContractor: (rowId: number) => void;
  showMainTable?: boolean;
  isMainTableCollapsibleByDefault?: boolean;
}

export default function BudgetTable({ onAddRow: onAddRowProp, onOpenLimit, onOpenContract, onOpenObject, onOpenDepartment, onOpenContractor, showMainTable = true, isMainTableCollapsibleByDefault = false }: BudgetTableProps) {
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
  const [contractsLookup, setContractsLookup] = useState<Record<string, number>>({});

  function setFilter(column: string, value: string): void {
    setFilters((prev) => ({ ...prev, [column]: value }));
  }

  function loadData(): Promise<void> {
    setLoading(true);
    setError(null);

    return fetch('/api/gn/bdr')
      .then((res) => {
        if (!res.ok) throw new Error(formatHttpError(res.status));
        return res.json() as Promise<Row[]>;
      })
      .then((rows) => setData(rows))
      .catch((err: Error) => setError(formatErrorMessage(err)))
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
      
      // Load contracts mapping
      try {
        const contractsRes = await fetch('/api/gn/contracts');
        if (contractsRes.ok) {
          const contracts = (await contractsRes.json()) as Row[];
          const lookup: Record<string, number> = {};
          contracts.forEach((contract) => {
            const contractName = String(contract.GN_contract_name ?? '');
            const contractId = Number(contract.GN_contract_id ?? 0);
            if (contractName && contractId > 0) {
              lookup[contractName] = contractId;
            }
          });
          setContractsLookup(lookup);
        }
      } catch (err) {
        console.error('Failed to load contracts:', err);
      }
    }

    void loadSelectOptions();
  }, []);

  const columns = useMemo(() => data.length > 0 ? Object.keys(data[0]) : [], [data]);

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

  const visibleMainColumns = useMemo(() => {
    const withExtraColumns = [...orderedColumns];
    const limitIndex = withExtraColumns.indexOf('Лимит');

    EXTRA_NUMERIC_COLUMNS.forEach((column) => {
      if (withExtraColumns.includes(column)) return;

      const insertAt = limitIndex === -1 ? withExtraColumns.length : limitIndex + 1;
      withExtraColumns.splice(insertAt, 0, column);
    });

    return withExtraColumns.filter((col) => !MAIN_HIDDEN_COLUMNS.has(col));
  }, [orderedColumns]);

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

  function formatCellValue(column: string, value: unknown): string {
    if (column === 'Лимит' || EXTRA_NUMERIC_COLUMNS.has(column)) {
      const trimmed = String(value ?? '').trim();
      if (trimmed === '') return '';
      return formatFinancialValue(value);
    }

    return String(value ?? '');
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

      {!loading && !error && data.length > 0 && showMainTable && (
        <>
          <div className="budget-actions budget-actions--top-right">
            <button type="button" className="page-action-btn" onClick={onAddRowProp}>
              Добавить строку
            </button>
          </div>
          <MainBudgetTableContent
            visibleMainColumns={visibleMainColumns}
            filteredData={filteredData}
            filteredLimitTotal={filteredLimitTotal}
            sort={sort}
            editingRowId={editingRowId}
            draft={draft}
            saving={saving}
            saveError={saveError}
            filters={filters}
            lookupRows={lookupRows}
            contractsLookup={contractsLookup}
            COLUMN_TITLES={COLUMN_TITLES}
            LOCKED_EDIT_COLUMNS={LOCKED_EDIT_COLUMNS}
            BDR_SELECT_CONFIG={BDR_SELECT_CONFIG}
            EXTRA_NUMERIC_COLUMNS={EXTRA_NUMERIC_COLUMNS}
            FINANCIAL_NUMBER_FORMATTER={FINANCIAL_NUMBER_FORMATTER}
            onToggleSort={toggleSort}
            onSetFilter={setFilter}
            onStartEdit={startEdit}
            onSaveEdit={saveEdit}
            onCancelEdit={cancelEdit}
            onUpdateDraft={updateDraft}
            onGetSelectOptions={getSelectOptionsForColumn}
            onFormatCellValue={formatCellValue}
            onOpenLimit={onOpenLimit}
            onOpenObject={onOpenObject}
            onOpenDepartment={onOpenDepartment}
            onOpenContractor={onOpenContractor}
            onOpenContract={onOpenContract}
          />
        </>
      )}
    </section>
  );
}
