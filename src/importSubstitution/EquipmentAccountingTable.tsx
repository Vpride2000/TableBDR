import React, { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { formatErrorMessage, formatHttpError } from '../utils/forecastUtils'
import ExcelActionToolbar from '../components/ExcelActionToolbar'

type Row = Record<string, unknown>;
type SortDirection = 'asc' | 'desc';
type SelectOption = { value: string; label: string };

type EquipmentColumn =
  | 'Подразделение'
  | 'Тип'
  | 'Наименование ТКО'
  | 'Вендор ТКО'
  | 'СЧЕТ УЧЕТА'
  | 'Количество'
  | 'Год'
  | 'ГРУППА'
  | 'Классификация ТКО'
  | 'ЭКСПЛ'
  | 'ПЛАН'
  | 'ОБЪЕКТ'
  | 'Выведен из эксплуатации'
  | 'Инвентарный'
  | 'Примечание';

interface EquipmentSummaryRow {
  key: string;
  sourceRowId: number;
  values: Record<Exclude<EquipmentColumn, 'Количество'>, string>;
  quantityTotal: number;
  quantityValues: string[];
  decommissionedTotal: number;
  quantityByYear: Map<string, number>;
  quantityByDepartment: Map<string, number>;
}

const EQUIPMENT_SELECT_CONFIG: Record<string, { endpoint: string; labelKey: string }> = {
  'Подразделение': { endpoint: '/api/gn/departments', labelKey: 'GN_department' },
  'Тип': { endpoint: '/api/gn/equipment-types', labelKey: 'GN_equipment_type' },
  'Вендор ТКО': { endpoint: '/api/gn/equipment-manufacturers', labelKey: 'GN_equipment_manufacturer' },
  'ОБЪЕКТ': { endpoint: '/api/gn/objects', labelKey: 'GN_departament_object' },
};

const SELECT_VALUE_OPTIONS: Record<string, string[]> = {
  'Классификация ТКО': ['Импорт', 'РФ в реестре', 'РФ НЕ в реестре'],
  'ЭКСПЛ': ['ДА', 'НЕТ'],
  'ПЛАН': ['ЭКСПЛ', 'РЕЗЕРВ', 'СПИСАНИЕ'],
  'ГРУППА': ['офис', 'поле'],
};

const COLUMNS: EquipmentColumn[] = [
  'Подразделение',
  'ОБЪЕКТ',
  'Тип',
  'Наименование ТКО',
  'Вендор ТКО',
  'СЧЕТ УЧЕТА',
  'Количество',
  'ГРУППА',
  'Классификация ТКО',
  'ЭКСПЛ',
  'ПЛАН',
  'Выведен из эксплуатации',
  'Инвентарный',
  'Примечание',
];

const EQUIPMENT_EXCEL_COLUMNS = [
  'Подразделение',
  'Код ТКО',
  'Наименование ТКО',
  'Тип',
  'Вендор ТКО',
  'Классификация ТКО',
  'ЕРРП',
  'ЕРМТР',
  'Регистрационный номер ТКО',
  'Количество',
  'Выведен из эксплуатации',
  'Инвентарный',
  'Замещенное импортное ТКО',
  'Кол-во выводенного импортного ТКО',
  'Статья затрат ТКО',
  'СЧЕТ УЧЕТА',
  'Статус закупки',
  'Платеж ТР без НДС',
  'Год',
  'Примечание',
  'ЭКСПЛ',
  'ПЛАН',
  'ГРУППА',
  'ОБЪЕКТ',
  'Поставщик',
  'Огрузочный реквизит',
  'оплата',
];

function compareValues(left: unknown, right: unknown): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (String(left ?? '').trim() !== '' && String(right ?? '').trim() !== ''
    && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left ?? '').localeCompare(String(right ?? ''), 'ru', { numeric: true, sensitivity: 'base' });
}

function parseQuantity(value: unknown): number {
  const normalized = String(value ?? '').replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

function formatIntegerQuantity(value: number): string {
  return Math.round(value).toLocaleString('ru-RU');
}

function formatYear(year: string): string {
  return year || 'без года';
}

const EQUIPMENT_ACCOUNTING_STORAGE_KEY = 'equipment-accounting-view-state';

type EquipmentAccountingViewState = {
  filters?: Record<string, string>;
  multiFilters?: Record<string, string[]>;
  hideDepartment?: boolean;
  disableQuantitySumming?: boolean;
  departmentFilter?: string;
  departmentFilters?: string[];
  planAvailabilityFilter?: string;
  columnWidths?: Record<string, number>;
  sort?: { column: EquipmentColumn; direction: SortDirection };
};

function readEquipmentAccountingViewState(): EquipmentAccountingViewState {
  try {
    const savedState = window.localStorage.getItem(EQUIPMENT_ACCOUNTING_STORAGE_KEY);
    return savedState ? JSON.parse(savedState) as EquipmentAccountingViewState : {};
  } catch {
    return {};
  }
}

export default function EquipmentAccountingTable({ requiredType }: { requiredType?: string } = {}): React.ReactElement {
  const savedViewState = readEquipmentAccountingViewState();
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>(savedViewState.filters ?? {});
  const [multiFilters, setMultiFilters] = useState<Record<string, string[]>>(savedViewState.multiFilters ?? {});
  const [hideDepartment, setHideDepartment] = useState(requiredType ? false : savedViewState.hideDepartment ?? false);
  const [disableQuantitySumming, setDisableQuantitySumming] = useState(requiredType ? true : savedViewState.disableQuantitySumming ?? false);
  const [departmentFilters, setDepartmentFilters] = useState<string[]>(
    savedViewState.departmentFilters ?? (savedViewState.departmentFilter ? [savedViewState.departmentFilter] : []),
  );
  const [planAvailabilityFilter, setPlanAvailabilityFilter] = useState(savedViewState.planAvailabilityFilter ?? '');
  const [columnOrder] = useState<EquipmentColumn[]>(COLUMNS);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(savedViewState.columnWidths ?? {});
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const [creatingRow, setCreatingRow] = useState(false);
  const [newRow, setNewRow] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [excelImporting, setExcelImporting] = useState(false);
  const [excelImportError, setExcelImportError] = useState<string | null>(null);
  const [excelImportMessage, setExcelImportMessage] = useState<string | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyQuantity, setCopyQuantity] = useState('');
  const [copyAvailableQuantity, setCopyAvailableQuantity] = useState(0);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [lookupRows, setLookupRows] = useState<Record<string, Row[]>>({});
  const [sort, setSort] = useState<{ column: EquipmentColumn; direction: SortDirection }>(savedViewState.sort ?? {
    column: 'Подразделение',
    direction: 'asc',
  });
  const scopedData = useMemo(
    () => requiredType
      ? data.filter((row) => String(row['Тип'] ?? '').trim() === requiredType)
      : data,
    [data, requiredType],
  );

  useEffect(() => {
    if (requiredType) return;

    const viewState: EquipmentAccountingViewState = {
      filters,
      multiFilters,
      hideDepartment,
      disableQuantitySumming,
      departmentFilters,
      planAvailabilityFilter,
      columnWidths,
      sort,
    };
    window.localStorage.setItem(EQUIPMENT_ACCOUNTING_STORAGE_KEY, JSON.stringify(viewState));
  }, [columnWidths, departmentFilters, disableQuantitySumming, filters, hideDepartment, multiFilters, planAvailabilityFilter, requiredType, sort]);

  useEffect(() => {
    fetch('/api/import-substitution', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(formatHttpError(response.status));
        return response.json() as Promise<Row[]>;
      })
      .then((rows) => setData(rows))
      .catch((requestError: Error) => setError(formatErrorMessage(requestError)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    async function loadSelectOptions(): Promise<void> {
      const entries = Object.entries(EQUIPMENT_SELECT_CONFIG);
      const loaded = await Promise.all(
        entries.map(async ([column, config]) => {
          const response = await fetch(config.endpoint);
          if (!response.ok) return [column, [] as Row[]] as const;
          const rows = (await response.json()) as Row[];
          return [column, rows] as const;
        }),
      );
      setLookupRows(Object.fromEntries(loaded));
    }

    void loadSelectOptions();
  }, []);

  const summaryRows = useMemo<EquipmentSummaryRow[]>(() => {
    const grouped = new Map<string, EquipmentSummaryRow>();

    const rowsForSummary = scopedData.filter((row) => {
      if (departmentFilters.length > 0
        && !departmentFilters.includes(String(row['Подразделение'] ?? '').trim())) return false;
      if (!planAvailabilityFilter) return true;
      const rawYear = String(row['Год'] ?? '').trim();
      if (rawYear === '') return planAvailabilityFilter === 'fact';
      const year = Number(rawYear);
      if (!Number.isFinite(year)) return false;
      return planAvailabilityFilter === 'fact' ? year <= 2026 : year >= 2027;
    });

    rowsForSummary.forEach((row) => {
      const department = String(row['Подразделение'] ?? '').trim();
      const name = String(row['Наименование ТКО'] ?? '').trim();
      const year = String(row['Год'] ?? '').trim();
      const key = disableQuantitySumming
        ? String(row['GN_import_substitution_id'])
        : hideDepartment ? name : `${department}\u0000${name}`;
      const existing = grouped.get(key) ?? {
        key,
        sourceRowId: Number(row['GN_import_substitution_id']),
        values: {
          'Подразделение': hideDepartment ? '' : department,
          'Тип': '',
          'Наименование ТКО': name,
          'Вендор ТКО': '',
          'СЧЕТ УЧЕТА': '',
          'Год': year,
          'ГРУППА': '',
          'Классификация ТКО': '',
          'ЭКСПЛ': '',
          'ПЛАН': '',
          'ОБЪЕКТ': '',
          'Выведен из эксплуатации': '0',
          'Инвентарный': '',
          'Примечание': '',
        },
        quantityTotal: 0,
        quantityValues: [],
        decommissionedTotal: 0,
        quantityByYear: new Map<string, number>(),
        quantityByDepartment: new Map<string, number>(),
      };

      for (const column of ['Тип', 'Вендор ТКО', 'СЧЕТ УЧЕТА', 'Классификация ТКО', 'ЭКСПЛ', 'ПЛАН', 'ОБЪЕКТ', 'ГРУППА', 'Выведен из эксплуатации', 'Инвентарный', 'Примечание'] as const) {
        const rawValue = Array.isArray(row[column])
          ? row[column].map(String).join(', ').trim()
          : String(row[column] ?? '').trim();
        const value = column === 'СЧЕТ УЧЕТА' && !rawValue && row['Статья затрат ТКО'] === 'ПЭН'
          ? 'МЦ400201'
          : rawValue;
        if (value && !existing.values[column].split(', ').includes(value)) {
          existing.values[column] = existing.values[column] ? `${existing.values[column]}, ${value}` : value;
        }
      }

      const quantity = parseQuantity(row['Количество']);
      existing.quantityValues.push(String(row['Количество'] ?? '').trim() || '0');
      const decommissioned = Math.round(parseQuantity(row['Выведен из эксплуатации']));
      existing.decommissionedTotal += decommissioned;
      existing.values['Выведен из эксплуатации'] = formatQuantity(existing.decommissionedTotal);
      if (disableQuantitySumming) {
        existing.values['Год'] = year || 'без года';
      }
      existing.quantityTotal += quantity;
      existing.quantityByYear.set(year, (existing.quantityByYear.get(year) ?? 0) + quantity);
      existing.quantityByDepartment.set(department, (existing.quantityByDepartment.get(department) ?? 0) + quantity);
      grouped.set(key, existing);
    });

    return [...grouped.values()];
  }, [departmentFilters, disableQuantitySumming, hideDepartment, planAvailabilityFilter, scopedData]);

  const filteredAndSortedData = useMemo(() => {
    const filtered = summaryRows.filter((row) => COLUMNS.every((column) => {
      if (departmentFilters.length > 0 && !departmentFilters.some((department) => (
        row.values['Подразделение'] === department
          || (hideDepartment && row.quantityByDepartment.has(department))
      ))) return false;
      const selectedValues = multiFilters[column] ?? [];
      if (column !== 'Количество' && selectedValues.length > 0) {
        const rowValues = row.values[column].split(',').map((value) => value.trim());
        if (!selectedValues.some((value) => rowValues.includes(value))) return false;
      }
      const filter = (filters[column] ?? '').trim().toLowerCase();
      if (!filter) return true;
      if (column === 'Количество') {
        return (disableQuantitySumming
          ? row.quantityValues.join('; ')
          : formatIntegerQuantity(row.quantityTotal)).toLowerCase().includes(filter)
          || [...row.quantityByYear.entries()].some(([year, quantity]) => (
            `${formatYear(year)}: ${formatIntegerQuantity(quantity)}`.toLowerCase().includes(filter)
          ))
          || [...row.quantityByDepartment.entries()].some(([department, quantity]) => (
            `${department || 'без подразделения'}: ${formatIntegerQuantity(quantity)}`.toLowerCase().includes(filter)
          ));
      }
      return row.values[column].toLowerCase().includes(filter);
    }));

    const sorted = filtered.sort((left, right) => {
      const comparison = sort.column === 'Количество'
        ? left.quantityTotal - right.quantityTotal
        : compareValues(left.values[sort.column], right.values[sort.column]);
      return sort.direction === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [departmentFilters, disableQuantitySumming, filters, hideDepartment, multiFilters, sort, summaryRows]);

  const displayedQuantityTotal = useMemo(
    () => filteredAndSortedData.reduce((total, row) => total + row.quantityTotal, 0),
    [filteredAndSortedData],
  );

  function getSelectOptionsForColumn(column: EquipmentColumn, sourceRow: Row = draft, search = ''): SelectOption[] {
    const config = EQUIPMENT_SELECT_CONFIG[column];
    if (config) {
      let rows = lookupRows[column] ?? [];
      if (column === 'ОБЪЕКТ') {
        const departmentName = String(sourceRow['Подразделение'] ?? '').trim();
        const departmentRow = (lookupRows['Подразделение'] ?? []).find(
          (row) => String(row.GN_department ?? '').trim() === departmentName,
        );
        const departmentId = Number(departmentRow?.GN_Dep_id);
        rows = Number.isInteger(departmentId)
          ? rows.filter((row) => {
            const departmentIds = Array.isArray(row.GN_department_FKs)
              ? row.GN_department_FKs.map(Number)
              : [Number(row.GN_department_FK)];
            return departmentIds.includes(departmentId);
          })
          : [];
      }
      const options = rows
        .map((row) => {
          const label = String(row[config.labelKey] ?? '').trim();
          return { value: label, label };
        })
        .filter((option) => option.value !== ''
          && (column !== 'Вендор ТКО' || !option.label.toLocaleLowerCase('ru').includes('любой'))
          && (!search || option.label.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))));
      return ['ОБЪЕКТ', 'Тип', 'Вендор ТКО'].includes(column)
        ? options.sort((left, right) => left.label.localeCompare(right.label, 'ru', { numeric: true, sensitivity: 'base' }))
        : options;
    }

    const options = SELECT_VALUE_OPTIONS[column] ?? [];
    return options.map((value) => ({ value, label: value }));
  }

  function isSelectColumn(column: EquipmentColumn): boolean {
    return Boolean(EQUIPMENT_SELECT_CONFIG[column] || SELECT_VALUE_OPTIONS[column]);
  }

  function getTableFilterOptions(column: EquipmentColumn): string[] {
    if (column === 'ЭКСПЛ' || column === 'ПЛАН' || column === 'ГРУППА') {
      return SELECT_VALUE_OPTIONS[column];
    }
    return [];
  }

  function isSearchableCreateColumn(column: EquipmentColumn): boolean {
    return column === 'ОБЪЕКТ' || column === 'Вендор ТКО';
  }

  function renderGroupPicker(value: unknown, onChange: (nextValue: string) => void): React.ReactElement {
    return (
      <div className="equipment-group-picker" role="group" aria-label="Группа">
        {SELECT_VALUE_OPTIONS['ГРУППА'].map((option) => (
          <button
            key={option}
            type="button"
            className={String(value ?? '') === option ? 'equipment-group-picker__option equipment-group-picker__option--active' : 'equipment-group-picker__option'}
            aria-pressed={String(value ?? '') === option}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    );
  }

  function renderCompactPicker(column: 'ЭКСПЛ' | 'ПЛАН', value: unknown, onChange: (nextValue: string) => void): React.ReactElement {
    return (
      <div className="equipment-group-picker equipment-group-picker--wide" role="group" aria-label={column}>
        {SELECT_VALUE_OPTIONS[column].map((option) => (
          <button
            key={option}
            type="button"
            className={String(value ?? '') === option ? 'equipment-group-picker__option equipment-group-picker__option--active' : 'equipment-group-picker__option'}
            aria-pressed={String(value ?? '') === option}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    );
  }

  function formatQuantityDetails(row: EquipmentSummaryRow): string {
    if (disableQuantitySumming) return formatIntegerQuantity(parseQuantity(row.quantityValues[0] ?? 0));

    const yearlyValues = [...row.quantityByYear.entries()]
      .sort(([left], [right]) => {
        if (!left) return 1;
        if (!right) return -1;
        return Number(left) - Number(right);
      })
      .map(([year, quantity]) => `${formatYear(year)}: ${formatIntegerQuantity(quantity)}`);
    const departmentValues = [...row.quantityByDepartment.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'ru'))
      .map(([department, quantity]) => `${department || 'без подразделения'}: ${formatIntegerQuantity(quantity)}`);
    const details = [`по годам: ${yearlyValues.join('; ')}`];
    if (hideDepartment) details.push(`по подразделениям: ${departmentValues.join('; ')}`);
    return `Итого: ${formatIntegerQuantity(row.quantityTotal)} (${details.join(' | ')})`;
  }

  function toggleSort(column: EquipmentColumn): void {
    setSort((previous) => previous.column === column
      ? { column, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
      : { column, direction: 'asc' });
  }

  function startColumnResize(event: React.PointerEvent<HTMLSpanElement>, column: EquipmentColumn): void {
    event.preventDefault();
    event.stopPropagation();
    const header = event.currentTarget.closest('th');
    if (!header) return;
    const startX = event.clientX;
    const startWidth = header.getBoundingClientRect().width;
    const resizeColumn = (moveEvent: PointerEvent): void => {
      setColumnWidths((previous) => ({ ...previous, [column]: Math.max(48, startWidth + moveEvent.clientX - startX) }));
    };
    const stopResizing = (): void => {
      window.removeEventListener('pointermove', resizeColumn);
      window.removeEventListener('pointerup', stopResizing);
    };
    window.addEventListener('pointermove', resizeColumn);
    window.addEventListener('pointerup', stopResizing);
  }

  function startEdit(row: EquipmentSummaryRow): void {
    const sourceRow = data.find((item) => Number(item['GN_import_substitution_id']) === row.sourceRowId);
    if (!sourceRow) return;
    setEditingRowId(row.sourceRowId);
    setDraft({
      ...sourceRow,
      'ОБЪЕКТ': Array.isArray(sourceRow['ОБЪЕКТ'])
        ? sourceRow['ОБЪЕКТ'].map(String)
        : sourceRow['ОБЪЕКТ'] ? [String(sourceRow['ОБЪЕКТ'])] : [],
      'СЧЕТ УЧЕТА': String(sourceRow['СЧЕТ УЧЕТА'] ?? '').trim()
        || (sourceRow['Статья затрат ТКО'] === 'ПЭН' ? 'МЦ400201' : ''),
    });
    setSaveError(null);
  }

  function cancelEdit(): void {
    setEditingRowId(null);
    setDraft({});
    setSaveError(null);
  }

  function startCreate(): void {
    setCreatingRow(true);
    setSaveError(null);
    setNewRow({
      ...(requiredType ? { 'Тип': requiredType } : {}),
      'ЭКСПЛ': 'НЕТ',
      'ПЛАН': 'РЕЗЕРВ',
      'ГРУППА': 'офис',
      'Выведен из эксплуатации': 0,
      'СЧЕТ УЧЕТА': 'МЦ400201',
    });
  }

  function cancelCreate(): void {
    setCreatingRow(false);
    setNewRow({});
    setSaveError(null);
  }

  async function saveEdit(): Promise<void> {
    if (editingRowId == null) return;
    const editingSummaryRow = summaryRows.find((row) => row.sourceRowId === editingRowId);
    const decommissionedQuantity = Math.round(parseQuantity(draft['Выведен из эксплуатации']));
    if (editingSummaryRow && decommissionedQuantity > editingSummaryRow.quantityTotal) {
      setSaveError(`Выведено из эксплуатации не может быть больше итого: ${formatQuantity(editingSummaryRow.quantityTotal)}`);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/import-substitution/${editingRowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const refreshed = await fetch('/api/import-substitution', { cache: 'no-store' });
      if (!refreshed.ok) throw new Error(formatHttpError(refreshed.status));
      setData((await refreshed.json()) as Row[]);
      cancelEdit();
    } catch (requestError) {
      setSaveError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  }

  function openCopyDialog(): void {
    const sourceRow = data.find((row) => Number(row['GN_import_substitution_id']) === editingRowId);
    const sourceQuantity = parseQuantity(sourceRow?.['Количество']);
    const decommissionedQuantity = Math.round(parseQuantity(draft['Выведен из эксплуатации']));
    const availableQuantity = Math.max(0, sourceQuantity - decommissionedQuantity);
    setCopyAvailableQuantity(availableQuantity);
    setCopyQuantity('');
    setCopyError(parseQuantity(draft['Количество']) === sourceQuantity
      ? null
      : 'Сначала сохраните изменение количества отдельно, затем создайте копию.');
    setCopyDialogOpen(true);
  }

  async function saveCopy(): Promise<void> {
    if (editingRowId == null) return;
    const sourceRow = data.find((row) => Number(row['GN_import_substitution_id']) === editingRowId);
    const sourceQuantity = parseQuantity(sourceRow?.['Количество']);
    if (parseQuantity(draft['Количество']) !== sourceQuantity) {
      setCopyError('Сначала сохраните изменение количества отдельно, затем создайте копию.');
      return;
    }
    const quantityToCopy = Number(copyQuantity);
    if (!Number.isInteger(quantityToCopy) || quantityToCopy < 0 || quantityToCopy > copyAvailableQuantity) {
      setCopyError(`Укажите целое количество от 0 до ${formatQuantity(copyAvailableQuantity)}`);
      return;
    }

    setSaving(true);
    setCopyError(null);
    try {
      const editResponse = await fetch(`/api/import-substitution/${editingRowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!editResponse.ok) {
        const payload = (await editResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `HTTP ${editResponse.status}`);
      }

      const response = await fetch(`/api/import-substitution/${editingRowId}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: quantityToCopy }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      const refreshed = await fetch('/api/import-substitution', { cache: 'no-store' });
      if (!refreshed.ok) throw new Error(formatHttpError(refreshed.status));
      setData((await refreshed.json()) as Row[]);
      setCopyDialogOpen(false);
      cancelEdit();
    } catch (requestError) {
      setCopyError(requestError instanceof Error ? requestError.message : 'Не удалось скопировать строку');
    } finally {
      setSaving(false);
    }
  }

  async function saveNewRow(): Promise<void> {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch('/api/import-substitution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRow),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const refreshed = await fetch('/api/import-substitution', { cache: 'no-store' });
      if (!refreshed.ok) throw new Error(formatHttpError(refreshed.status));
      setData((await refreshed.json()) as Row[]);
      cancelCreate();
    } catch (requestError) {
      setSaveError(requestError instanceof Error ? requestError.message : 'Не удалось добавить строку');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(rowId: number): Promise<void> {
    if (!window.confirm('Удалить строку?')) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/import-substitution/${rowId}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setData((previous) => previous.filter((row) => Number(row['GN_import_substitution_id']) !== rowId));
      cancelEdit();
    } catch (requestError) {
      setSaveError(requestError instanceof Error ? requestError.message : 'Не удалось удалить строку');
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(column: string, value: string | string[]): void {
    setDraft((previous) => ({ ...previous, [column]: value }));
  }

  function resetAllFilters(): void {
    setFilters({});
    setMultiFilters({});
    setDepartmentFilters([]);
    setPlanAvailabilityFilter('');
  }

  function exportToExcel(): void {
    const header = ['№', ...EQUIPMENT_EXCEL_COLUMNS];
    const rows = scopedData.map((row) => [
      row['GN_import_substitution_id'] ?? '',
      ...EQUIPMENT_EXCEL_COLUMNS.map((column) => {
        const value = row[column];
        return Array.isArray(value) ? JSON.stringify(value) : value ?? '';
      }),
    ]);
    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    worksheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }),
    };
    worksheet['!cols'] = header.map((title, index) => ({
      wch: Math.min(44, Math.max(12, ...[title, ...rows.map((row) => String(row[index] ?? ''))].map((value) => value.length + 2))),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Учет оборудования');
    XLSX.writeFile(workbook, 'Учет_оборудования.xlsx');
  }

  async function importFromExcel(file: File): Promise<void> {
    setExcelImporting(true);
    setExcelImportError(null);
    setExcelImportMessage(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('В файле отсутствуют листы');

      const rows = XLSX.utils.sheet_to_json<Row>(workbook.Sheets[sheetName], { defval: '' });
      if (rows.length === 0) throw new Error('В файле нет строк для загрузки');

      const existingIds = new Set(data.map((row) => Number(row['GN_import_substitution_id'])));
      const updatedIds = new Set<number>();
      let savedRows = 0;
      for (const [index, row] of rows.entries()) {
        const rawId = row['№'] ?? row['GN_import_substitution_id'];
        const rowId = Number(rawId);
        const shouldUpdate = Number.isInteger(rowId) && rowId > 0
          && existingIds.has(rowId) && !updatedIds.has(rowId);
        const payload: Row = Object.fromEntries(EQUIPMENT_EXCEL_COLUMNS.map((column) => [column, row[column] ?? '']));
        const rawObjects = payload['ОБЪЕКТ'];
        if (typeof rawObjects === 'string') {
          const normalizedObjects = rawObjects.trim();
          if (!normalizedObjects) {
            payload['ОБЪЕКТ'] = [];
          } else if (normalizedObjects.startsWith('[')) {
            const parsedObjects: unknown = JSON.parse(normalizedObjects);
            if (!Array.isArray(parsedObjects)) throw new Error(`Строка ${index + 2}: некорректный список объектов`);
            payload['ОБЪЕКТ'] = parsedObjects.map(String);
          } else {
            payload['ОБЪЕКТ'] = [normalizedObjects];
          }
        }
        if (!String(payload['Подразделение'] ?? '').trim()) {
          throw new Error(`Строка ${index + 2}: не заполнено подразделение`);
        }

        const response = await fetch(shouldUpdate ? `/api/import-substitution/${rowId}` : '/api/import-substitution', {
          method: shouldUpdate ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (shouldUpdate) updatedIds.add(rowId);
        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(`Строка ${index + 2}: ${errorPayload.error || formatHttpError(response.status)}`);
        }
        savedRows += 1;
      }

      const refreshed = await fetch('/api/import-substitution', { cache: 'no-store' });
      if (!refreshed.ok) throw new Error(formatHttpError(refreshed.status));
      setData((await refreshed.json()) as Row[]);
      setExcelImportMessage(`Загружено строк: ${savedRows}.`);
    } catch (requestError) {
      setExcelImportError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить Excel-файл');
    } finally {
      setExcelImporting(false);
    }
  }

  if (loading) return <main><p className="hint">Загрузка данных...</p></main>;
  if (error) return <main><p className="hint hint--error">Ошибка: {error}</p></main>;

  const visibleColumns = columnOrder.filter((column) => (
    column !== 'Классификация ТКО'
      && (!requiredType || (column !== 'Тип' && column !== 'Вендор ТКО'))
      && (!hideDepartment || (column !== 'Подразделение' && column !== 'ОБЪЕКТ'))
  ));

  return (
    <main>
      <section className="page-section">
        <div className="page-header">
          <h2>Учет оборудования</h2>
        </div>
        <ExcelActionToolbar
          onReset={resetAllFilters}
          onExport={exportToExcel}
          onUpload={(file) => void importFromExcel(file)}
          uploading={excelImporting}
        />
        {excelImportMessage && <p className="hint">{excelImportMessage}</p>}
        {excelImportError && <p className="hint hint--error">Ошибка загрузки из Excel: {excelImportError}</p>}
        {!requiredType && (
          <>
            <label className="form-checkbox" style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <input
                type="checkbox"
                checked={hideDepartment}
                onChange={(event) => setHideDepartment(event.target.checked)}
              />
              Скрыть подразделение
            </label>
            <label className="form-checkbox" style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <input
                type="checkbox"
                checked={disableQuantitySumming}
                onChange={(event) => setDisableQuantitySumming(event.target.checked)}
              />
              Убрать суммирование по полю Количество для редактирования строк
            </label>
          </>
        )}
        {!requiredType && (
          <>
            <label className="equipment-group-filter equipment-department-filter">
              Подразделение
              <div className="equipment-department-filter__resizable">
                <select
                  multiple
                  size={4}
                  aria-label="Фильтр по подразделениям"
                  value={departmentFilters.length > 0 ? departmentFilters : ['']}
                  onChange={(event) => setDepartmentFilters(
                    [...event.target.selectedOptions].map((option) => option.value).filter(Boolean),
                  )}
                >
                  <option value="">Все подразделения</option>
                  {(lookupRows['Подразделение'] ?? [])
                    .map((row) => String(row.GN_department ?? '').trim())
                    .filter(Boolean)
                    .map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
              </div>
            </label>
            <label className="equipment-group-filter">
              ПЛАН/НАЛИЧИЕ
              <select value={planAvailabilityFilter} onChange={(event) => setPlanAvailabilityFilter(event.target.value)}>
                <option value="">Все</option>
                <option value="fact">Факт</option>
                <option value="plan">План</option>
              </select>
            </label>
          </>
        )}
        {creatingRow && (
          <div className="guide-new-row equipment-new-row">
            {COLUMNS.filter((column) => column !== 'Количество'
              && column !== 'Выведен из эксплуатации'
              && column !== 'Классификация ТКО').map((column) => (
              <label key={column}>
                <span>{column}</span>
                {column === 'ГРУППА' ? renderGroupPicker(newRow[column], (value) => setNewRow((previous) => ({ ...previous, [column]: value }))) : (column === 'ЭКСПЛ' || column === 'ПЛАН') ? renderCompactPicker(column, newRow[column], (value) => setNewRow((previous) => ({ ...previous, [column]: value }))) : isSelectColumn(column) ? (
                  <>
                    {isSearchableCreateColumn(column) ? (
                      <input
                        list={`equipment-${column}-options`}
                        placeholder="Начните вводить для поиска..."
                        value={String(newRow[column] ?? '')}
                        onChange={(event) => setNewRow((previous) => ({
                          ...previous,
                          [column]: event.target.value,
                        }))}
                      />
                    ) : (
                      <select
                        value={String(newRow[column] ?? '')}
                        onChange={(event) => setNewRow((previous) => ({
                          ...previous,
                          [column]: event.target.value,
                          ...(column === 'Подразделение' ? { ОБЪЕКТ: '' } : {}),
                        }))}
                      >
                        <option value="">Выберите значение</option>
                        {getSelectOptionsForColumn(column, newRow).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    )}
                    {isSearchableCreateColumn(column) && (
                      <datalist id={`equipment-${column}-options`}>
                        {getSelectOptionsForColumn(column, newRow).map((option) => (
                          <option key={option.value} value={option.value} />
                        ))}
                      </datalist>
                    )}
                  </>
                ) : (
                  <input value={String(newRow[column] ?? '')} onChange={(event) => setNewRow((previous) => ({ ...previous, [column]: event.target.value }))} />
                )}
              </label>
            ))}
            <label><span>Количество</span><input type="number" step="0.01" value={String(newRow['Количество'] ?? '')} onChange={(event) => setNewRow((previous) => ({ ...previous, 'Количество': event.target.value }))} /></label>
            <div className="equipment-new-row-actions">
              <button type="button" className="page-action-btn page-action-btn--success" onClick={() => void saveNewRow()} disabled={saving}>Сохранить</button>
              <button type="button" className="page-action-btn page-action-btn--secondary" onClick={cancelCreate} disabled={saving}>Отмена</button>
            </div>
          </div>
        )}
        <div className="guide-table-wrap invest-program-table-wrap--narrow import-substitution-table-wrap equipment-accounting-table-wrap">
          <table className="guide-table table-compact import-substitution-table equipment-accounting-table">
            <colgroup>
              {visibleColumns.map((column) => (
                <col key={column} style={{ width: `${columnWidths[column] ?? 90}px` }} />
              ))}
              <col style={{ width: '140px' }} />
            </colgroup>
            <thead>
              <tr>
                {visibleColumns.map((column) => (
                  <th
                    key={column}
                    className="import-substitution-resizable-header"
                    style={{ width: `${columnWidths[column] ?? 90}px` }}
                    onClick={() => toggleSort(column)}
                  >
                    <div className="equipment-accounting-header-content">
                      <span className="equipment-accounting-column-title">
                        {column}
                        {sort.column === column && (sort.direction === 'asc' ? ' ↑' : ' ↓')}
                      </span>
                      {getTableFilterOptions(column).length > 0 ? (
                        <select
                          multiple
                          className="equipment-column-multi-filter"
                          value={(multiFilters[column] ?? []).length > 0 ? multiFilters[column] : ['']}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setMultiFilters((previous) => ({
                            ...previous,
                            [column]: [...event.target.selectedOptions]
                              .map((option) => option.value)
                              .filter(Boolean),
                          }))}
                        >
                          <option value="">ВСЕ</option>
                          {getTableFilterOptions(column).map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          className="contract-filter-input"
                          placeholder="Фильтр..."
                          value={filters[column] ?? ''}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setFilters((previous) => ({ ...previous, [column]: event.target.value }))}
                        />
                      )}
                      {column === 'Количество' && !requiredType && (
                        <span className="equipment-accounting-column-total">
                          {formatIntegerQuantity(displayedQuantityTotal)}
                        </span>
                      )}
                    </div>
                    <span
                      className="import-substitution-column-resizer"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Изменить ширину столбца ${column}`}
                      onPointerDown={(event) => startColumnResize(event, column)}
                    />
                  </th>
                ))}
                <th className="equipment-accounting-actions-header">
                  <span>Действие</span>
                  <button
                    type="button"
                    className="page-text-link"
                    onClick={startCreate}
                    disabled={creatingRow}
                  >
                    Добавить строку
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedData.map((row) => {
                const isEditing = editingRowId === row.sourceRowId;
                return (
                  <tr
                    key={row.key}
                    className={row.decommissionedTotal > 0
                      ? row.decommissionedTotal === row.quantityTotal
                        ? 'equipment-accounting-row--complete'
                        : 'equipment-accounting-row--partial'
                      : undefined}
                  >
                    {visibleColumns.map((column) => (
                      <td
                        key={column}
                        style={column === 'Наименование ТКО' ? {
                          fontWeight: row.values['Классификация ТКО'].trim() === 'Импорт' ? 700 : undefined,
                          fontStyle: row.values['Классификация ТКО'].trim() === 'РФ НЕ в реестре' ? 'italic' : undefined,
                        } : undefined}
                      >
                        {isEditing ? (
                          column === 'ОБЪЕКТ' ? (
                            <select
                              multiple
                              size={4}
                              className="invest-program-inline-input"
                              value={Array.isArray(draft[column]) ? draft[column].map(String) : []}
                              onChange={(event) => updateDraft(
                                column,
                                [...event.target.selectedOptions].map((option) => option.value),
                              )}
                            >
                              {getSelectOptionsForColumn(column).map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          ) : isSelectColumn(column) ? (
                            <select
                              className="invest-program-inline-input"
                              value={String(draft[column] ?? '')}
                              onChange={(event) => updateDraft(column, event.target.value)}
                            >
                              <option value="">Выберите значение</option>
                              {getSelectOptionsForColumn(column).map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="invest-program-inline-input"
                              type={column === 'Количество' || column === 'Выведен из эксплуатации' ? 'number' : 'text'}
                              disabled={column === 'Количество' && !disableQuantitySumming}
                              min={column === 'Выведен из эксплуатации' ? '0' : undefined}
                              max={column === 'Выведен из эксплуатации' ? row.quantityTotal : undefined}
                              step={column === 'Выведен из эксплуатации' ? '1' : column === 'Количество' ? '0.01' : undefined}
                              value={String(draft[column] ?? '')}
                              onChange={(event) => updateDraft(column, event.target.value)}
                            />
                          )
                        ) : column === 'Количество' ? formatQuantityDetails(row) : row.values[column]}
                      </td>
                    ))}
                    <td className="invest-program-actions-cell">
                      {isEditing ? (
                        <>
                          <button type="button" className="invest-program-row-action-button" onClick={() => void saveEdit()} disabled={saving}>
                            {saving ? 'Сохранение...' : 'Сохранить'}
                          </button>
                          <button type="button" className="invest-program-row-action-button" onClick={openCopyDialog} disabled={saving}>
                            COPY
                          </button>
                          <button type="button" className="invest-program-row-action-button" onClick={() => void deleteRow(editingRowId)} disabled={saving}>
                            Удалить
                          </button>
                          <button type="button" className="invest-program-row-action-button invest-program-row-action-button--secondary" onClick={cancelEdit} disabled={saving}>
                            Отмена
                          </button>
                          {saveError && <p className="error-message">{saveError}</p>}
                        </>
                      ) : (
                        disableQuantitySumming && (
                          <button type="button" className="invest-program-row-action-button" onClick={() => startEdit(row)}>
                            ИЗМ
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredAndSortedData.length === 0 && <p className="hint">Нет данных по заданным фильтрам.</p>}
        {copyDialogOpen && (
          <div className="equipment-copy-dialog-backdrop" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setCopyDialogOpen(false);
          }}>
            <form
              className="equipment-copy-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="equipment-copy-dialog-title"
              onSubmit={(event) => {
                event.preventDefault();
                void saveCopy();
              }}
            >
              <h3 id="equipment-copy-dialog-title">Сколько штук скопировать?</h3>
              <div className="equipment-copy-dialog__quantity-row">
                <label className="equipment-copy-dialog__quantity">
                  Количество
                  <input
                    type="number"
                    min="0"
                    max={copyAvailableQuantity}
                    step="1"
                    autoFocus
                    value={copyQuantity}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (nextValue === '' || (Number.isInteger(Number(nextValue)) && Number(nextValue) <= copyAvailableQuantity)) {
                        setCopyQuantity(nextValue);
                      }
                    }}
                  />
                </label>
                <p className="equipment-copy-dialog__available">
                  Доступно: <strong>{formatQuantity(copyAvailableQuantity)}</strong>
                </p>
              </div>
              {copyError && <p className="hint hint--error">{copyError}</p>}
              <div className="equipment-copy-dialog__actions">
                <button type="submit" className="page-action-btn page-action-btn--success" disabled={saving}>
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
                <button type="button" className="page-action-btn page-action-btn--secondary" onClick={() => setCopyDialogOpen(false)} disabled={saving}>
                  Отмена
                </button>
              </div>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
