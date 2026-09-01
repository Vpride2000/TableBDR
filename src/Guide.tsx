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
}

const TABLE_DEFS: { title: string; endpoint: string; entity: string; idColumn: string; columns?: string[] }[] = [
  { title: 'Подразделения', endpoint: '/api/gn/departments', entity: 'departments', idColumn: 'GN_Dep_id' },
  { title: 'Статьи бюджета', endpoint: '/api/gn/budget-items', entity: 'budget-items', idColumn: 'GN_b_id' },
  { title: 'Статьи бюджета УС', endpoint: '/api/gn/pao-budget-items', entity: 'pao-budget-items', idColumn: 'PAO_b_id' },
  { title: 'Контрагенты', endpoint: '/api/gn/contractors', entity: 'contractors', idColumn: 'GN_c_id' },
  { title: 'Договоры', endpoint: '/api/gn/dogovors', entity: 'dogovors', idColumn: 'GN_dgv_id' },
  { title: 'Объекты', endpoint: '/api/gn/objects', entity: 'objects', idColumn: 'GN_do_id' },
  { title: 'ОКДП ТКО для ИС ПРИТ', endpoint: '/api/gn/invest-okdp-tko-is-prit', entity: 'invest-okdp-tko-is-prit', idColumn: 'GN_invest_okdp_tko_is_prit_id' },
  { title: 'Огрузочный реквизит', endpoint: '/api/gn/invest-ogruz-rekvizit', entity: 'invest-ogruz-rekvizit', idColumn: 'GN_invest_ogruz_rekvizit_id' },
  { title: 'Производители оборудования', endpoint: '/api/gn/equipment-manufacturers', entity: 'equipment-manufacturers', idColumn: 'GN_equipment_manufacturer_id', columns: ['GN_equipment_manufacturer'] },
  { title: 'Типы оборудования', endpoint: '/api/gn/equipment-types', entity: 'equipment-types', idColumn: 'GN_equipment_type_id', columns: ['GN_equipment_type'] },
  { title: 'Модели оборудования', endpoint: '/api/gn/equipment-models', entity: 'equipment-models', idColumn: 'GN_equipment_model_id', columns: ['GN_equipment_model', 'GN_equipment_manufacturer_FK', 'GN_equipment_type_FK'] },
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
    GN_department_FK: {
      sourceEntity: 'departments',
      valueKey: 'GN_Dep_id',
      labelKey: 'GN_department',
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
    GN_cellular_identifier: 'номер',
    GN_cellular_identifier_fio: 'ФИО',
  },
  'cellular-tariff-plans': {
    GN_cellular_tariff_plan_id: '№',
    GN_cellular_tariff_plan: 'тариф',
    GN_cellular_tariff_plan_details: 'состав тарифа',
    GN_cellular_tariff_plan_cost: 'стоимость',
  },
};

// Столбцы, которые вычисляются на сервере и не редактируются вручную.
const GUIDE_READONLY_COLUMNS: Record<string, string[]> = {
  'cellular-accounts': ['GN_cellular_account_numbers_count', 'GN_cellular_account_active_numbers_count', 'GN_cellular_account_total_cost'],
};

function DataTable({
  section,
  onSectionRowsUpdate,
  fkOptions,
  rowFilter,
}: {
  section: TableSection
  onSectionRowsUpdate: (endpoint: string, rows: Row[]) => void
  fkOptions: Record<string, SelectOption[]>
  rowFilter?: (row: Row) => boolean
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
  const readonlyColumns = GUIDE_READONLY_COLUMNS[section.entity] ?? [];

  const columns = section.data.length > 0
    ? Object.keys(section.data[0])
    : section.columns ?? [section.idColumn];
  const isCellularAccounts = section.entity === 'cellular-accounts';
  const accountDepartmentOptions = fkOptions.GN_department_FK ?? [];
  const displayRows = useMemo(() => {
    const filteredRows = rowFilter ? section.data.filter(rowFilter) : section.data;
    const departmentFilteredRows = !isCellularAccounts || !accountDepartmentFilter
      ? filteredRows
      : filteredRows.filter((row) => String(row.GN_department_FK ?? '') === accountDepartmentFilter);

    if (!isCellularAccounts || !accountSort) return departmentFilteredRows;

    const order = accountSort.direction === 'asc' ? 1 : -1;
    return [...departmentFilteredRows].sort((left, right) => {
      const leftValue = renderCellValue(accountSort.column, left);
      const rightValue = renderCellValue(accountSort.column, right);
      const leftNumber = Number(leftValue);
      const rightNumber = Number(rightValue);
      const comparison = Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
        ? leftNumber - rightNumber
        : leftValue.localeCompare(rightValue, 'ru', { sensitivity: 'base', numeric: true });

      return comparison * order;
    });
  }, [accountDepartmentFilter, accountSort, isCellularAccounts, rowFilter, section.data, fkOptions]);

  function toggleAccountSort(column: string): void {
    setAccountSort((previous) => (
      previous?.column === column
        ? { column, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    ));
  }

  if (section.loading) return <p className="hint">Загрузка...</p>;
  if (section.error)   return <p className="hint hint--error">Ошибка: {section.error}</p>;

  function startEdit(row: Row): void {
    setEditingRowId(Number(row[section.idColumn]));
    setDraft({ ...row });
    setSaveError(null);
  }

  function cancelEdit(): void {
    setEditingRowId(null);
    setDraft({});
    setSaveError(null);
  }

  function updateDraft(column: string, value: string): void {
    setDraft((prev) => ({ ...prev, [column]: value }));
  }

  function startCreate(): void {
    setCreatingRow(true);
    setCreateError(null);
    setNewRow(columns.reduce((acc, column) => {
      if (column === section.idColumn || readonlyColumns.includes(column)) return acc;
      return { ...acc, [column]: '' };
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
    const stringValue = String(value);
    const option = fkOptions[column].find((item) => item.value === stringValue);
    return option ? option.label : stringValue;
  }

  function renderCellValue(col: string, row: Row): string {
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
    const header = columns.map((col) => labels[col] ?? col);
    const rows = displayRows.map((row) => columns.map((col) => renderCellValue(col, row)));

    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Лицевые счета');
    XLSX.writeFile(workbook, 'Лицевые_счета.xlsx');
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

      for (let i = 1; i < rawRows.length; i += 1) {
        const [idCell, identifierCell, fioCell] = rawRows[i];
        const identifier = String(identifierCell ?? '').trim();
        if (!identifier) continue;

        const fio = String(fioCell ?? '').trim();
        const id = Number(idCell);
        const body = { GN_cellular_identifier: identifier, GN_cellular_identifier_fio: fio };

        const response = Number.isFinite(id) && id > 0
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

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || formatHttpError(response.status));
        }
      }

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
    <div className="guide-table-wrap">
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
            <button type="button" className="page-action-btn page-action-btn--secondary" onClick={exportIdentifiersToExcel}>Экспорт в Excel</button>
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
      </div>
      {importError && <p className="hint hint--error">Ошибка загрузки из Excel: {importError}</p>}
      {creatingRow && (
        <div className="guide-new-row">
          <h2>Новая запись</h2>
          <div className="guide-new-row-fields">
            {columns.filter((col) => col !== section.idColumn && !readonlyColumns.includes(col)).map((col) => (
              <label key={col}>
                <div>{col}</div>
                {fkOptions[col] ? (
                  <select
                    value={String(newRow[col] ?? '')}
                    onChange={(event) => updateNewRow(col, event.target.value)}
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
      <table className="guide-table table-compact">
        <thead>
          <tr>
            {columns.map((col, index) => {
              const isSortable = isCellularAccounts && index > 0 && index < columns.length - 1;
              const sortMarker = accountSort?.column === col ? (accountSort.direction === 'asc' ? ' ▲' : ' ▼') : '';

              return (
                <th key={col}>
                  {isSortable ? (
                    <button type="button" className="guide-sort-button" onClick={() => toggleAccountSort(col)}>
                      {GUIDE_COLUMN_LABELS[section.entity]?.[col] ?? col}{sortMarker}
                    </button>
                  ) : (
                    GUIDE_COLUMN_LABELS[section.entity]?.[col] ?? col
                  )}
                </th>
              );
            })}
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, i) => {
            const rowId = Number(row[section.idColumn]);
            const isEditing = editingRowId === rowId;

            return (
              <tr key={i} className={isEditing ? 'editing' : ''}>
                {columns.map((col) => (
                  <td key={col}>
                    {isEditing && col !== section.idColumn && !readonlyColumns.includes(col) && fkOptions[col] ? (
                      <select
                        value={String(draft[col] ?? '')}
                        onChange={(event) => updateDraft(col, event.target.value)}
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
                    <>
                      <button type="button" className="page-action-btn page-action-btn--secondary" onClick={() => startEdit(row)}>испр</button>
                      <button type="button" className="page-action-btn page-action-btn--danger" onClick={() => void deleteRow(rowId)} disabled={saving}>удал</button>
                    </>
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
}: GuideProps = {}) {
  const visibleDefs = onlyEntities && onlyEntities.length > 0
    ? TABLE_DEFS.filter((def) => onlyEntities.includes(def.entity))
    : TABLE_DEFS;
  const defs = [...visibleDefs, ...TABLE_DEFS.filter((def) => lookupEntities.includes(def.entity) && !visibleDefs.some((item) => item.entity === def.entity))];

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

  // Загружаем секции, которые должны быть раскрыты сразу при инициализации.
  useEffect(() => {
    defs.forEach((def) => {
      if (initialExpandedEntities.includes(def.entity)) {
        loadSectionData(def.endpoint);
      }
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

