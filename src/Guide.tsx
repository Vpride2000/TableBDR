import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { formatHttpError } from './utils/forecastUtils';
// Страница справочника GN.
// Отображает разделы справочных таблиц с возможностью разворачивать
// редактировать отдельные записи и управлять строками.
type Row = Record<string, unknown>;
type SelectOption = { value: string; label: string };

interface TableSection {
  title: string;
  endpoint: string;
  entity: string;
  idColumn: string;
  columns?: string[];
  data: Row[];
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

type GuideProps = {
  initialExpandedEntities?: string[]
  onlyEntities?: string[]
  lookupEntities?: string[]
  enableCellularAccountFilter?: boolean
  // Режим каталога: показывает только таблицу названий справочников с кнопками открытия в отдельном окне.
  directoryView?: boolean
}

const TABLE_DEFS: { title: string; endpoint: string; entity: string; idColumn: string; columns?: string[] }[] = [
  { title: 'Подразделения', endpoint: '/api/gn/departments', entity: 'departments', idColumn: 'GN_Dep_id' },
  { title: 'Статьи бюджета', endpoint: '/api/gn/budget-items', entity: 'budget-items', idColumn: 'GN_b_id' },
  { title: 'Статьи бюджета УС', endpoint: '/api/gn/pao-budget-items', entity: 'pao-budget-items', idColumn: 'PAO_b_id' },
  { title: 'Контрагенты', endpoint: '/api/gn/contractors', entity: 'contractors', idColumn: 'GN_c_id' },
  { title: 'Договоры', endpoint: '/api/gn/dogovors', entity: 'dogovors', idColumn: 'GN_dgv_id' },
  { title: 'Объекты', endpoint: '/api/gn/objects', entity: 'objects', idColumn: 'GN_do_id', columns: ['GN_departament_object', 'GN_department_FKs', 'УСЛУГИ СВЯЗИ', 'УЧЕТ ОБОРУДОВАНИЯ'] },
  { title: 'ОКДП ТКО для ИС ПРИТ', endpoint: '/api/gn/invest-okdp-tko-is-prit', entity: 'invest-okdp-tko-is-prit', idColumn: 'GN_invest_okdp_tko_is_prit_id' },
  { title: 'Огрузочный реквизит', endpoint: '/api/gn/invest-ogruz-rekvizit', entity: 'invest-ogruz-rekvizit', idColumn: 'GN_invest_ogruz_rekvizit_id', columns: ['GN_invest_ogruz_rekvizit', 'GN_department_FK', 'GN_departament_object_FK', 'Почтовый адрес'] },
  { title: 'Производители оборудования', endpoint: '/api/gn/equipment-manufacturers', entity: 'equipment-manufacturers', idColumn: 'GN_equipment_manufacturer_id', columns: ['GN_equipment_manufacturer_id', 'GN_equipment_manufacturer', 'Полное название', 'СТРАНА', 'Доп. информация'] },
  { title: 'Типы оборудования', endpoint: '/api/gn/equipment-types', entity: 'equipment-types', idColumn: 'GN_equipment_type_id', columns: ['GN_equipment_type'] },
  { title: 'Модели оборудования', endpoint: '/api/gn/equipment-models', entity: 'equipment-models', idColumn: 'GN_equipment_model_id', columns: ['GN_equipment_model', 'GN_equipment_manufacturer_FK', 'GN_equipment_type_FK', 'GN_equipment_department_FK', 'GN_equipment_budget_item_FK', 'GN_equipment_object_FK'] },
  { title: 'Номера ГТ для спутника', endpoint: '/api/gn/satellite-gt-numbers', entity: 'satellite-gt-numbers', idColumn: 'GN_satellite_gt_numbers_id', columns: ['GN_satellite_gt_number'] },
  {
    title: 'Справочник: Идентификатор',
    endpoint: '/api/gn/cellular-identifiers',
    entity: 'cellular-identifiers',
    idColumn: 'GN_cellular_identifier_id',
    columns: ['GN_cellular_identifier', 'GN_cellular_identifier_fio'],
  },
  {
    title: 'Справочник: Тарифный план',
    endpoint: '/api/gn/cellular-tariff-plans',
    entity: 'cellular-tariff-plans',
    idColumn: 'GN_cellular_tariff_plan_id',
    columns: ['GN_cellular_tariff_plan', 'GN_cellular_tariff_plan_details', 'GN_cellular_tariff_plan_cost'],
  },
  {
    title: 'Лицевые счета',
    endpoint: '/api/gn/cellular-accounts',
    entity: 'cellular-accounts',
    idColumn: 'GN_cellular_account_id',
    columns: ['GN_cellular_account', 'GN_department_FK', 'GN_cellular_account_note', 'GN_cellular_account_numbers_count', 'GN_cellular_account_active_numbers_count', 'GN_cellular_account_total_cost'],
  },
];

const GUIDE_FK_SELECT_CONFIG: Record<string, Record<string, { sourceEntity: string; valueKey: string; labelKey: string }>> = {
  dogovors: {
    GN_contarctor_FK: {
      sourceEntity: 'contractors',
      valueKey: 'GN_c_id',
      labelKey: 'GN_contarctor',
    },
  },
  objects: {
    GN_department_FKs: {
      sourceEntity: 'departments',
      valueKey: 'GN_Dep_id',
      labelKey: 'GN_department',
    },
  },
  'invest-ogruz-rekvizit': {
    GN_department_FK: {
      sourceEntity: 'departments',
      valueKey: 'GN_Dep_id',
      labelKey: 'GN_department',
    },
    GN_departament_object_FK: {
      sourceEntity: 'objects',
      valueKey: 'GN_do_id',
      labelKey: 'GN_departament_object',
    },
  },
  'equipment-models': {
    GN_equipment_manufacturer_FK: {
      sourceEntity: 'equipment-manufacturers',
      valueKey: 'GN_equipment_manufacturer_id',
      labelKey: 'GN_equipment_manufacturer',
    },
    GN_equipment_type_FK: {
      sourceEntity: 'equipment-types',
      valueKey: 'GN_equipment_type_id',
      labelKey: 'GN_equipment_type',
    },
    GN_equipment_department_FK: {
      sourceEntity: 'departments',
      valueKey: 'GN_Dep_id',
      labelKey: 'GN_department',
    },
    GN_equipment_budget_item_FK: {
      sourceEntity: 'budget-items',
      valueKey: 'GN_b_id',
      labelKey: 'GN_budget_network_item',
    },
    GN_equipment_object_FK: {
      sourceEntity: 'objects',
      valueKey: 'GN_do_id',
      labelKey: 'GN_departament_object',
    },
  },
  'cellular-accounts': {
    GN_department_FK: {
      sourceEntity: 'departments',
      valueKey: 'GN_Dep_id',
      labelKey: 'GN_department',
    },
  },
};

const GUIDE_COLUMN_LABELS: Record<string, Record<string, string>> = {
  departments: {
    GN_Dep_id: '№',
    GN_department: 'Подразделение',
  },
  'budget-items': {
    GN_b_id: '№',
    GN_budget_network_item: 'Статья бюджета',
  },
  'pao-budget-items': {
    PAO_b_id: '№',
    PAO__budget_network_item: 'Статья бюджета УС',
  },
  contractors: {
    GN_c_id: '№',
    GN_contarctor: 'Контрагент',
  },
  dogovors: {
    GN_dgv_id: '№',
    GN_dogovor: 'Договор',
    GN_contarctor_FK: 'Контрагент',
  },
  objects: {
    GN_do_id: '№',
    GN_departament_object: 'Объект',
    GN_department_FKs: 'Подразделение',
    'УСЛУГИ СВЯЗИ': 'УСЛУГИ СВЯЗИ',
    'УЧЕТ ОБОРУДОВАНИЯ': 'УЧЕТ ОБОРУДОВАНИЯ',
  },
  'invest-okdp-tko-is-prit': {
    GN_invest_okdp_tko_is_prit_id: '№',
    GN_invest_okdp_tko_is_prit: 'ОКДП ТКО',
  },
  'invest-ogruz-rekvizit': {
    GN_invest_ogruz_rekvizit_id: '№',
    GN_invest_ogruz_rekvizit: 'Огрузочный реквизит',
    GN_department_FK: 'Подразделение',
    GN_departament_object_FK: 'Объект',
    'Почтовый адрес': 'Почтовый адрес',
  },
  'equipment-manufacturers': {
    GN_equipment_manufacturer_id: '№',
    GN_equipment_manufacturer: 'Производитель',
    'Полное название': 'Полное название',
    'СТРАНА': 'СТРАНА',
    'Доп. информация': 'доп. информация',
  },
  'equipment-types': {
    GN_equipment_type_id: '№',
    GN_equipment_type: 'Тип оборудования',
  },
  'equipment-models': {
    GN_equipment_model_id: '№',
    GN_equipment_model: 'Модель оборудования',
    GN_equipment_manufacturer_FK: 'Производитель',
    GN_equipment_type_FK: 'Тип оборудования',
    GN_equipment_department_FK: 'Подразделение',
    GN_equipment_budget_item_FK: 'Статья бюджета',
    GN_equipment_object_FK: 'Объект',
  },
  'satellite-gt-numbers': {
    GN_satellite_gt_numbers_id: '№',
    GN_satellite_gt_number: 'Номер ГТ',
  },
  'cellular-accounts': {
    GN_cellular_account_id: '№',
    GN_cellular_account: 'Лицевой',
    GN_department_FK: 'Подразделение',
    GN_cellular_account_note: 'Примечание',
    GN_cellular_account_numbers_count: 'Кол-во номеров',
    GN_cellular_account_active_numbers_count: 'Активные номера',
    GN_cellular_account_total_cost: 'Итого абонплата',
  },
  'cellular-identifiers': {
    GN_cellular_identifier_id: '№',
    GN_cellular_identifier: 'Номер',
    GN_cellular_identifier_fio: 'ФИО',
  },
  'cellular-tariff-plans': {
    GN_cellular_tariff_plan_id: '№',
    GN_cellular_tariff_plan: 'Тариф',
    GN_cellular_tariff_plan_details: 'Состав тарифа',
    GN_cellular_tariff_plan_cost: 'Стоимость',
  },
};

const COMMON_COLUMN_LABELS: Record<string, string> = {
  is_deleted: 'Удалено',
  deleted_at: 'Дата удаления',
  created_at: 'Дата создания',
  updated_at: 'Дата изменения',
};

function getGuideColumnLabel(entity: string, column: string): string {
  return GUIDE_COLUMN_LABELS[entity]?.[column] ?? COMMON_COLUMN_LABELS[column] ?? column;
}

function collectObjectNames(rows: Row[], column: string): Set<string> {
  return new Set(rows.flatMap((row) => {
    const rawValue = row[column];
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    return values.map((value) => String(value ?? '').trim()).filter(Boolean);
  }));
}

// Столбцы, которые вычисляются на сервере и не редактируются вручную.
const GUIDE_READONLY_COLUMNS: Record<string, string[]> = {
  objects: ['УСЛУГИ СВЯЗИ', 'УЧЕТ ОБОРУДОВАНИЯ'],
  'cellular-accounts': ['GN_cellular_account_numbers_count', 'GN_cellular_account_active_numbers_count', 'GN_cellular_account_total_cost'],
};

const EXCEL_IMPORT_EXPORT_ENTITIES = new Set([
  'invest-okdp-tko-is-prit',
  'invest-ogruz-rekvizit',
  'equipment-manufacturers',
]);

const EXCEL_FILE_NAMES: Record<string, string> = {
  'invest-okdp-tko-is-prit': 'Справочник_ОКДП_ТКО_для_ИС_ПРИТ.xlsx',
  'invest-ogruz-rekvizit': 'Справочник_Огрузочный_реквизит.xlsx',
  'equipment-manufacturers': 'Справочник_Производители_оборудования.xlsx',
};

function DataTable({
  section,
  onSectionRowsUpdate,
  fkOptions,
  rowFilter,
  objectsUsedInCommunication,
  objectsUsedInEquipment,
}: {
  section: TableSection
  onSectionRowsUpdate: (endpoint: string, rows: Row[]) => void
  fkOptions: Record<string, SelectOption[]>
  rowFilter?: (row: Row) => boolean
  objectsUsedInCommunication: Set<string>
  objectsUsedInEquipment: Set<string>
}) {
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [creatingRow, setCreatingRow] = useState(false);
  const [newRow, setNewRow] = useState<Row>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [accountDepartmentFilter, setAccountDepartmentFilter] = useState('');
  const [accountSort, setAccountSort] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null);
  const [guideSort, setGuideSort] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null);
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});
  const [actionMenuRowId, setActionMenuRowId] = useState<number | null>(null);
  const readonlyColumns = GUIDE_READONLY_COLUMNS[section.entity] ?? [];

  const columns = section.columns ?? (section.data.length > 0
    ? Object.keys(section.data[0])
    : [section.idColumn]);
  const isCellularAccounts = section.entity === 'cellular-accounts';
  const supportsExcelImportExport = EXCEL_IMPORT_EXPORT_ENTITIES.has(section.entity);
  const accountDepartmentOptions = fkOptions.GN_department_FK ?? [];
  const isMultiSelectColumn = (column: string): boolean => section.entity === 'objects' && column === 'GN_department_FKs';
  const activeSort = isCellularAccounts ? accountSort : guideSort;
  const displayRows = useMemo(() => {
    const filteredRows = rowFilter ? section.data.filter(rowFilter) : section.data;
    const departmentFilteredRows = !isCellularAccounts || !accountDepartmentFilter
      ? filteredRows
      : filteredRows.filter((row) => String(row.GN_department_FK ?? '') === accountDepartmentFilter);
    const searchedRows = departmentFilteredRows.filter((row) => columns.every((column) => {
      const search = (columnSearch[column] ?? '').trim().toLocaleLowerCase('ru');
      if (!search) return true;
      return renderCellValue(column, row).toLocaleLowerCase('ru').includes(search);
    }));

    if (!activeSort) return searchedRows;

    const order = activeSort.direction === 'asc' ? 1 : -1;
    return [...searchedRows].sort((left, right) => {
      const leftValue = renderCellValue(activeSort.column, left);
      const rightValue = renderCellValue(activeSort.column, right);
      const leftNumber = Number(leftValue);
      const rightNumber = Number(rightValue);
      const comparison = Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
        ? leftNumber - rightNumber
        : leftValue.localeCompare(rightValue, 'ru', { sensitivity: 'base', numeric: true });

      return comparison * order;
    });
  }, [accountDepartmentFilter, activeSort, columnSearch, columns, isCellularAccounts, rowFilter, section.data, fkOptions]);

  function toggleAccountSort(column: string): void {
    setAccountSort((previous) => (
      previous?.column === column
        ? { column, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    ));
  }

  function toggleGuideSort(column: string): void {
    setGuideSort((previous) => (
      previous?.column === column
        ? { column, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    ));
  }

  if (section.loading) return <p className="hint">Загрузка...</p>;
  if (section.error)   return <p className="hint hint--error">Ошибка: {section.error}</p>;

  function startEdit(row: Row): void {
    setActionMenuRowId(null);
    setEditingRowId(Number(row[section.idColumn]));
    setDraft({ ...row });
    setSaveError(null);
  }

  function cancelEdit(): void {
    setEditingRowId(null);
    setDraft({});
    setSaveError(null);
  }

  function toggleActionMenu(rowId: number): void {
    setActionMenuRowId((previous) => previous === rowId ? null : rowId);
  }

  function updateDraft(column: string, value: string): void {
    setDraft((prev) => ({ ...prev, [column]: value }));
  }

  function startCreate(): void {
    setCreatingRow(true);
    setCreateError(null);
    setNewRow(columns.reduce((acc, column) => {
      if (column === section.idColumn || readonlyColumns.includes(column)) return acc;
      return { ...acc, [column]: isMultiSelectColumn(column) ? [] : '' };
    }, {} as Row));
  }

  function cancelCreate(): void {
    setCreatingRow(false);
    setCreateError(null);
    setNewRow({});
  }

  function updateNewRow(column: string, value: string): void {
    setNewRow((prev) => ({ ...prev, [column]: value }));
  }

  function updateMultiSelect(column: string, values: string[], target: 'draft' | 'new'): void {
    if (target === 'draft') setDraft((prev) => ({ ...prev, [column]: values }));
    else setNewRow((prev) => ({ ...prev, [column]: values }));
  }

  async function saveNewRow(): Promise<void> {
    setSaving(true);
    setCreateError(null);

    try {
      const response = await fetch(`/api/gn/${section.entity}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRow),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || formatHttpError(response.status));
      }

      const createdRow = (await response.json()) as Row;
      onSectionRowsUpdate(section.endpoint, [createdRow, ...section.data]);
      cancelCreate();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Не удалось добавить запись');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(rowId: number): Promise<void> {
    const confirmed = window.confirm('Удалить выбранную запись?');
    if (!confirmed) return;

    setActionMenuRowId(null);
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/gn/${section.entity}/${rowId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || formatHttpError(response.status));
      }

      onSectionRowsUpdate(
        section.endpoint,
        section.data.filter((row) => Number(row[section.idColumn]) !== rowId)
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось удалить запись');
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(): Promise<void> {
    if (editingRowId == null) return;
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/gn/${section.entity}/${editingRowId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(draft),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || formatHttpError(response.status));
      }

      const updatedRow = (await response.json()) as Row;
      const nextRows = section.data.map((row) =>
        Number(row[section.idColumn]) === editingRowId ? updatedRow : row
      );
      onSectionRowsUpdate(section.endpoint, nextRows);
      cancelEdit();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  }

  function resolveFkLabel(column: string, value: unknown): string {
    if (!fkOptions[column] || value == null) return String(value ?? '');
    if (Array.isArray(value)) {
      return value.map((item) => resolveFkLabel(column, item)).filter(Boolean).join(', ');
    }
    const stringValue = String(value);
    const option = fkOptions[column].find((item) => item.value === stringValue);
    return option ? option.label : stringValue;
  }

  function renderCellValue(col: string, row: Row): string {
    if (section.entity === 'objects') {
      const objectName = String(row.GN_departament_object ?? '').trim();
      if (col === 'УСЛУГИ СВЯЗИ') return objectsUsedInCommunication.has(objectName) ? 'ДА' : 'НЕТ';
      if (col === 'УЧЕТ ОБОРУДОВАНИЯ') return objectsUsedInEquipment.has(objectName) ? 'ДА' : 'НЕТ';
    }
    if (section.entity === 'cellular-accounts' && col === 'GN_cellular_account_active_numbers_count') {
      const active = Number(row.GN_cellular_account_active_numbers_count ?? 0);
      const total = Number(row.GN_cellular_account_numbers_count ?? 0);
      const percent = total > 0 ? Math.round((active / total) * 100) : 0;
      return `${active} (${percent}%)`;
    }
    return resolveFkLabel(col, row[col]);
  }

  function exportIdentifiersToExcel(): void {
    const header = ['№', 'номер', 'ФИО'];
    const rows = section.data.map((row) => [
      row[section.idColumn] ?? '',
      String(row.GN_cellular_identifier ?? ''),
      String(row.GN_cellular_identifier_fio ?? ''),
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Идентификаторы');
    XLSX.writeFile(workbook, 'Справочник_идентификаторы.xlsx');
  }

  function exportAccountsToExcel(): void {
    const labels = GUIDE_COLUMN_LABELS[section.entity] ?? {};
    const header = columns.map((col) => labels[col] ?? getGuideColumnLabel(section.entity, col));
    const rows = displayRows.map((row) => columns.map((col) => renderCellValue(col, row)));

    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Лицевые счета');
    XLSX.writeFile(workbook, 'Лицевые_счета.xlsx');
  }

  function exportReferenceToExcel(): void {
    const exportColumns = [section.idColumn, ...columns.filter((column) => column !== section.idColumn)];
    const rows = section.data.map((row) => exportColumns.map((column) => row[column] ?? ''));
    const worksheet = XLSX.utils.aoa_to_sheet([exportColumns, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, section.title.slice(0, 31));
    XLSX.writeFile(workbook, EXCEL_FILE_NAMES[section.entity]);
  }

  async function importIdentifiersFromExcel(file: File): Promise<void> {
    setImporting(true);
    setImportError(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('В файле отсутствуют листы');

      const sheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, { header: 1, defval: '' });
      if (rawRows.length < 2) {
        setImporting(false);
        return;
      }

      const existingIds = new Set(section.data.map((row) => Number(row[section.idColumn])));
      const updatedIds = new Set<number>();
      const importedIds = new Set<number>();
      for (let i = 1; i < rawRows.length; i += 1) {
        const [idCell, identifierCell, fioCell] = rawRows[i];
        const identifier = String(identifierCell ?? '').trim();
        if (!identifier) continue;

        const fio = String(fioCell ?? '').trim();
        const id = Number(idCell);
        if (Number.isInteger(id) && id > 0) importedIds.add(id);
        const body = { GN_cellular_identifier: identifier, GN_cellular_identifier_fio: fio };
        const shouldUpdate = Number.isInteger(id) && id > 0 && existingIds.has(id) && !updatedIds.has(id);

        const response = shouldUpdate
          ? await fetch(`/api/gn/${section.entity}/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
          : await fetch(`/api/gn/${section.entity}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

        if (shouldUpdate) updatedIds.add(id);
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || formatHttpError(response.status));
        }
      }

      const markMissingResponse = await fetch(`/api/gn/${section.entity}/mark-missing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...importedIds] }),
      });
      if (!markMissingResponse.ok) throw new Error(formatHttpError(markMissingResponse.status));

      const refreshed = await fetch(section.endpoint);
      if (!refreshed.ok) throw new Error(formatHttpError(refreshed.status));
      onSectionRowsUpdate(section.endpoint, (await refreshed.json()) as Row[]);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Не удалось загрузить данные из Excel');
    } finally {
      setImporting(false);
    }
  }

  async function importReferenceFromExcel(file: File): Promise<void> {
    setImporting(true);
    setImportError(null);

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('В файле отсутствуют листы');

      const rawRows = XLSX.utils.sheet_to_json<Array<unknown>>(workbook.Sheets[firstSheetName], { header: 1, defval: '' });
      if (rawRows.length < 2) return;

      const importColumns = columns.filter((column) => column !== section.idColumn && !readonlyColumns.includes(column));
      const existingIds = new Set(section.data.map((row) => Number(row[section.idColumn])));
      const updatedIds = new Set<number>();
      const importedIds = new Set<number>();
      for (let index = 1; index < rawRows.length; index += 1) {
        const row = rawRows[index];
        const values = importColumns.map((_, columnIndex) => String(row[columnIndex + 1] ?? '').trim());
        if (values.every((value) => !value)) continue;

        const id = Number(row[0]);
  if (Number.isInteger(id) && id > 0) importedIds.add(id);
        const body = Object.fromEntries(importColumns.map((column, columnIndex) => [column, values[columnIndex]]));
        const shouldUpdate = Number.isInteger(id) && id > 0 && existingIds.has(id) && !updatedIds.has(id);
        const response = shouldUpdate
          ? await fetch(`/api/gn/${section.entity}/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
          : await fetch(`/api/gn/${section.entity}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

        if (shouldUpdate) updatedIds.add(id);
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || formatHttpError(response.status));
        }
      }

      const markMissingResponse = await fetch(`/api/gn/${section.entity}/mark-missing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...importedIds] }),
      });
      if (!markMissingResponse.ok) throw new Error(formatHttpError(markMissingResponse.status));

      const refreshed = await fetch(section.endpoint);
      if (!refreshed.ok) throw new Error(formatHttpError(refreshed.status));
      onSectionRowsUpdate(section.endpoint, (await refreshed.json()) as Row[]);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Не удалось загрузить данные из Excel');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="guide-table-wrap guide-reference-table-wrap">
      <div className="guide-table-actions">
        <button type="button" className="page-action-btn page-action-btn--secondary" onClick={startCreate} disabled={creatingRow}>Добавить</button>
        {isCellularAccounts && (
          <>
            <label>
              Подразделение
              <select value={accountDepartmentFilter} onChange={(event) => setAccountDepartmentFilter(event.target.value)}>
                <option value="">Все подразделения</option>
                {accountDepartmentOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button type="button" className="page-action-btn page-action-btn--secondary" onClick={exportAccountsToExcel}>
              Выгрузить в Excel
            </button>
          </>
        )}
        {section.entity === 'cellular-identifiers' && (
          <>
            <label className="page-action-btn page-action-btn--secondary" style={{ cursor: importing ? 'default' : 'pointer' }}>
              {importing ? 'Загрузка...' : 'Загрузить из Excel'}
              <input
                type="file"
                accept=".xlsx"
                style={{ display: 'none' }}
                disabled={importing}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void importIdentifiersFromExcel(file);
                }}
              />
            </label>
          </>
        )}
        {supportsExcelImportExport && (
          <>
            <button type="button" className="page-action-btn page-action-btn--secondary" onClick={exportReferenceToExcel}>
              Выгрузить в Excel
            </button>
            <label className="page-action-btn page-action-btn--secondary" style={{ cursor: importing ? 'default' : 'pointer' }}>
              {importing ? 'Загрузка...' : 'Загрузить из Excel'}
              <input
                type="file"
                accept=".xlsx"
                style={{ display: 'none' }}
                disabled={importing}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void importReferenceFromExcel(file);
                }}
              />
            </label>
          </>
        )}
      </div>
      {importError && <p className="hint hint--error">Ошибка загрузки из Excel: {importError}</p>}
      {creatingRow && (
        <div className="guide-new-row">
          <h2>Новая запись</h2>
          <div className="guide-new-row-fields">
            {columns.filter((col) => col !== section.idColumn && !readonlyColumns.includes(col)).map((col) => (
              <label key={col}>
                <div>{getGuideColumnLabel(section.entity, col)}</div>
                {fkOptions[col] ? (
                  <select
                    multiple={isMultiSelectColumn(col)}
                    value={isMultiSelectColumn(col) ? (Array.isArray(newRow[col]) ? newRow[col].map(String) : []) : String(newRow[col] ?? '')}
                    onChange={(event) => isMultiSelectColumn(col)
                      ? updateMultiSelect(col, [...event.target.selectedOptions].map((option) => option.value), 'new')
                      : updateNewRow(col, event.target.value)}
                  >
                    <option value="">Выберите значение</option>
                    {fkOptions[col].map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={String(newRow[col] ?? '')}
                    onChange={(event) => updateNewRow(col, event.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
          <div style={{ marginTop: '10px' }}>
            <button type="button" className="page-action-btn page-action-btn--success" onClick={() => void saveNewRow()} disabled={saving}>Сохранить</button>
            <button type="button" className="page-action-btn page-action-btn--secondary" onClick={cancelCreate} disabled={saving}>Отмена</button>
          </div>
          {createError && <p className="hint hint--error">Ошибка добавления: {createError}</p>}
        </div>
      )}
      <table className="guide-table table-compact guide-reference-table">
        <thead>
          <tr>
            {columns.map((col) => {
              const sortMarker = activeSort?.column === col ? (activeSort.direction === 'asc' ? ' ▲' : ' ▼') : '';

              return (
                <th key={col}>
                  <button
                    type="button"
                    className="guide-sort-button"
                    onClick={() => isCellularAccounts ? toggleAccountSort(col) : toggleGuideSort(col)}
                  >
                    {getGuideColumnLabel(section.entity, col)}{sortMarker}
                  </button>
                </th>
              );
            })}
            <th>Действия</th>
          </tr>
          <tr className="guide-search-row">
            {columns.map((column) => (
              <th key={column}>
                {column === section.idColumn ? null : (
                  <input
                    type="search"
                    placeholder="Поиск..."
                    aria-label={`Поиск по столбцу ${getGuideColumnLabel(section.entity, column)}`}
                    value={columnSearch[column] ?? ''}
                    onChange={(event) => setColumnSearch((previous) => ({ ...previous, [column]: event.target.value }))}
                  />
                )}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, i) => {
            const rowId = Number(row[section.idColumn]);
            const isEditing = editingRowId === rowId;

            return (
              <tr
                key={i}
                className={isEditing ? 'editing' : ''}
              >
                {columns.map((col) => (
                  <td key={col}>
                    {isEditing && col !== section.idColumn && !readonlyColumns.includes(col) && fkOptions[col] ? (
                      <select
                        multiple={isMultiSelectColumn(col)}
                        value={isMultiSelectColumn(col) ? (Array.isArray(draft[col]) ? draft[col].map(String) : []) : String(draft[col] ?? '')}
                        onChange={(event) => isMultiSelectColumn(col)
                          ? updateMultiSelect(col, [...event.target.selectedOptions].map((option) => option.value), 'draft')
                          : updateDraft(col, event.target.value)}
                      >
                        <option value="">Выберите значение</option>
                        {fkOptions[col].map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : isEditing && col !== section.idColumn && !readonlyColumns.includes(col) ? (
                      <input
                        value={String(draft[col] ?? '')}
                        onChange={(event) => updateDraft(col, event.target.value)}
                      />
                    ) : (
                      renderCellValue(col, row)
                    )}
                  </td>
                ))}
                <td>
                  {!isEditing ? (
                    <div className="guide-row-actions">
                      <button
                        type="button"
                        className="page-action-btn page-action-btn--secondary"
                        onClick={() => toggleActionMenu(rowId)}
                        aria-expanded={actionMenuRowId === rowId}
                      >
                        ИЗМ
                      </button>
                      {actionMenuRowId === rowId && (
                        <div className="guide-row-actions-menu">
                          <button type="button" className="page-action-btn page-action-btn--secondary" onClick={() => startEdit(row)}>
                            ИЗМ
                          </button>
                          <button type="button" className="page-action-btn page-action-btn--danger" onClick={() => void deleteRow(rowId)} disabled={saving}>
                            УДАЛ
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <button type="button" className="page-action-btn page-action-btn--success" onClick={() => void saveEdit()} disabled={saving}>сохр</button>
                      <button type="button" className="page-action-btn page-action-btn--secondary" onClick={cancelEdit} disabled={saving}>отм</button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {saveError && <p className="hint hint--error">Ошибка редактирования: {saveError}</p>}
      {!saveError && displayRows.length === 0 && <p className="hint">Нет данных.</p>}
    </div>
  );
}

export default function Guide({
  initialExpandedEntities = [],
  onlyEntities,
  lookupEntities = [],
  enableCellularAccountFilter = false,
  directoryView = false,
}: GuideProps = {}) {
  const visibleDefs = onlyEntities && onlyEntities.length > 0
    ? TABLE_DEFS.filter((def) => onlyEntities.includes(def.entity))
    : TABLE_DEFS;
  const requiredLookupEntities = visibleDefs.flatMap((def) => Object.values(GUIDE_FK_SELECT_CONFIG[def.entity] ?? {})
    .map((config) => config.sourceEntity));
  const lookupEntityNames = new Set([...lookupEntities, ...requiredLookupEntities]);
  const defs = [
    ...visibleDefs,
    ...TABLE_DEFS.filter((def) => lookupEntityNames.has(def.entity) && !visibleDefs.some((item) => item.entity === def.entity)),
  ];

  const [sections, setSections] = useState<TableSection[]>(
    defs.map((def) => ({
      ...def,
      data: [],
      expanded: initialExpandedEntities.includes(def.entity),
      loaded: false,
      loading: false,
      error: null,
    }))
  );
  const [cellularAccounts, setCellularAccounts] = useState<string[]>([]);
  const [selectedCellularAccount, setSelectedCellularAccount] = useState('');
  const [allowedTariffPlanIds, setAllowedTariffPlanIds] = useState<Set<string> | null>(null);
  const [hideUnknownIdentifiers, setHideUnknownIdentifiers] = useState(true);
  const [objectsUsedInCommunication, setObjectsUsedInCommunication] = useState<Set<string>>(new Set());
  const [objectsUsedInEquipment, setObjectsUsedInEquipment] = useState<Set<string>>(new Set());
  const shouldLoadObjectUsage = visibleDefs.some((def) => def.entity === 'objects');

  useEffect(() => {
    if (!shouldLoadObjectUsage) return;

    void Promise.all([
      fetch('/api/gn/bdr', { cache: 'no-store' }),
      fetch('/api/import-substitution', { cache: 'no-store' }),
    ])
      .then(async ([bdrResponse, equipmentResponse]) => {
        if (!bdrResponse.ok || !equipmentResponse.ok) {
          throw new Error('Не удалось загрузить данные использования объектов');
        }
        const [bdrRows, equipmentRows] = await Promise.all([
          bdrResponse.json() as Promise<Row[]>,
          equipmentResponse.json() as Promise<Row[]>,
        ]);
        setObjectsUsedInCommunication(collectObjectNames(bdrRows, 'Объект'));
        setObjectsUsedInEquipment(collectObjectNames(equipmentRows, 'ОБЪЕКТ'));
      })
      .catch(() => {
        setObjectsUsedInCommunication(new Set());
        setObjectsUsedInEquipment(new Set());
      });
  }, [shouldLoadObjectUsage]);

  // Загружаем секции, которые должны быть раскрыты сразу при инициализации.
  useEffect(() => {
    const entitiesToLoad = new Set([
      ...initialExpandedEntities,
      ...requiredLookupEntities,
    ]);
    defs.forEach((def) => {
      if (entitiesToLoad.has(def.entity)) loadSectionData(def.endpoint);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!enableCellularAccountFilter) return;

    void fetch('/api/gn/cellular')
      .then((res) => {
        if (!res.ok) throw new Error(formatHttpError(res.status));
        return res.json() as Promise<Array<{ GN_cellular_account: string | null; GN_cellular_tariff_plan_FK: number | null }>>;
      })
      .then((rows) => {
        const accountSet = new Set<string>();
        rows.forEach((row) => {
          const account = String(row.GN_cellular_account ?? '').trim();
          if (account) accountSet.add(account);
        });
        setCellularAccounts([...accountSet].sort((a, b) => a.localeCompare(b, 'ru')));

        if (!selectedCellularAccount) {
          setAllowedTariffPlanIds(null);
          return;
        }

        const ids = new Set<string>();
        rows.forEach((row) => {
          const account = String(row.GN_cellular_account ?? '').trim();
          const tariffId = row.GN_cellular_tariff_plan_FK;
          if (account === selectedCellularAccount && tariffId != null) {
            ids.add(String(tariffId));
          }
        });
        setAllowedTariffPlanIds(ids);
      })
      .catch(() => {
        setCellularAccounts([]);
        setAllowedTariffPlanIds(null);
      });
  }, [enableCellularAccountFilter, selectedCellularAccount]);

  function onSectionRowsUpdate(endpoint: string, rows: Row[]): void {
    setSections((prev) => prev.map((section) => (section.endpoint === endpoint ? { ...section, data: rows } : section)));
  }

  function loadSectionData(endpoint: string): void {
    setSections((prev) =>
      prev.map((section) =>
        section.endpoint === endpoint ? { ...section, loading: true, error: null } : section
      )
    );

    void fetch(endpoint)
      .then((res) => {
        if (!res.ok) throw new Error(formatHttpError(res.status));
        return res.json() as Promise<Row[]>;
      })
      .then((data) => {
        setSections((prev) =>
          prev.map((section) =>
            section.endpoint === endpoint
              ? { ...section, data, loaded: true, loading: false, error: null }
              : section
          )
        );
      })
      .catch((err: Error) => {
        setSections((prev) =>
          prev.map((section) =>
            section.endpoint === endpoint
              ? { ...section, loading: false, error: err.message, loaded: false }
              : section
          )
        );
      });
  }

  function toggleSection(endpoint: string): void {
    const section = sections.find((item) => item.endpoint === endpoint);
    if (!section) return;

    const nextExpanded = !section.expanded;

    setSections((prev) =>
      prev.map((item) =>
        item.endpoint === endpoint ? { ...item, expanded: nextExpanded } : item
      )
    );

    if (nextExpanded && !section.loaded && !section.loading) {
      loadSectionData(endpoint);
    }
  }

  function buildFkOptions(section: TableSection): Record<string, SelectOption[]> {
    const configByColumn = GUIDE_FK_SELECT_CONFIG[section.entity];
    if (!configByColumn) return {};

    const result: Record<string, SelectOption[]> = {};

    Object.entries(configByColumn).forEach(([column, config]) => {
      const sourceSection = sections.find((item) => item.entity === config.sourceEntity);
      // If source section exists but not loaded yet, trigger its loading so labels become available.
      if (sourceSection && sourceSection.data.length === 0 && !sourceSection.loading && !sourceSection.loaded) {
        // kick off async load; options will populate on next render
        loadSectionData(sourceSection.endpoint);
      }

      if (!sourceSection || sourceSection.data.length === 0) {
        result[column] = [];
        return;
      }

      result[column] = sourceSection.data.map((row) => ({
        value: String(row[config.valueKey] ?? ''),
        label: String(row[config.labelKey] ?? ''),
      }));
    });

    return result;
  }

  // Каталог справочников: таблица названий, содержимое открывается в отдельном окне.
  if (directoryView) {
    return (
      <section className="guide guide-directory">
        <div className="guide-table-wrap" style={{ maxWidth: '640px' }}>
          <table className="guide-table table-compact">
            <thead>
              <tr>
                <th>№</th>
                <th>Справочник</th>
                <th>ОПИСАНИЕ</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section, index) => (
                <tr key={section.endpoint}>
                  <td>{index + 1}</td>
                  <td>
                    <a
                      href={`#guide-window-${section.entity}`}
                      target={`guide-window-${section.entity}`}
                      rel="noreferrer"
                      className="guide-directory-action-link"
                    >
                      {section.title}
                    </a>
                  </td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="guide guide-directory">    
      {enableCellularAccountFilter && (
        <div className="form-fields-compact" style={{ marginBottom: '10px' }}>
          <label className="form-field-compact">
            <span className="form-field-label">Л/С</span>
            <select value={selectedCellularAccount} onChange={(event) => setSelectedCellularAccount(event.target.value)}>
              <option value="">Все</option>
              {cellularAccounts.map((account) => (
                <option key={account} value={account}>{account}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="guide-grid">
        {sections.filter((section) => visibleDefs.some((def) => def.entity === section.entity)).map((section) => (
          <div key={section.endpoint} className="guide-section">
            <h2>
              <span>{section.title}</span>
              {visibleDefs.length > 1 && (
                <button
                  type="button"
                  className="guide-section-toggle"
                  onClick={() => toggleSection(section.endpoint)}
                  aria-expanded={section.expanded}
                >
                  {section.expanded ? 'Свернуть' : 'Развернуть'}
                </button>
              )}
            </h2>
            {section.expanded && (
              <>
                {section.entity === 'cellular-identifiers' && (
                  <label className="satellites-hide-unused-label">
                    <input
                      type="checkbox"
                      checked={hideUnknownIdentifiers}
                      onChange={(event) => setHideUnknownIdentifiers(event.target.checked)}
                    />
                    скрыть неизвестные номера
                  </label>
                )}
                <DataTable
                  section={section}
                  onSectionRowsUpdate={onSectionRowsUpdate}
                  fkOptions={buildFkOptions(section)}
                  objectsUsedInCommunication={objectsUsedInCommunication}
                  objectsUsedInEquipment={objectsUsedInEquipment}
                  rowFilter={
                    enableCellularAccountFilter && section.entity === 'cellular-tariff-plans' && allowedTariffPlanIds
                      ? (row: Row) => allowedTariffPlanIds.has(String(row.GN_cellular_tariff_plan_id ?? ''))
                      : section.entity === 'cellular-identifiers' && hideUnknownIdentifiers
                        ? (row: Row) => String(row.GN_cellular_identifier_fio ?? '').trim() !== ''
                        : undefined
                  }
                />
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

