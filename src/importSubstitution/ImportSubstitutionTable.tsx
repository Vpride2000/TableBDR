import React, { useEffect, useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { formatHttpError, formatErrorMessage } from '../utils/forecastUtils'

type Row = Record<string, unknown>;
type SortDirection = 'asc' | 'desc';
type SelectOption = { value: string; label: string };

interface SortState {
  key: string;
  direction: SortDirection;
}

const IMPORT_SUBSTITUTION_SELECT_CONFIG: Record<string, { endpoint: string; labelKey: string }> = {
  'Подразделение': { endpoint: '/api/gn/departments', labelKey: 'GN_department' },
  'Код ТКО': { endpoint: '/api/gn/invest-okdp-tko-is-prit', labelKey: 'GN_invest_okdp_tko_is_prit' },
  'Вендор ТКО': { endpoint: '/api/gn/equipment-manufacturers', labelKey: 'GN_equipment_manufacturer' },
};

const IMPORT_SUBSTITUTION_COLUMNS = [
  'Подразделение', 'Код ТКО', 'Наименование ТКО', 'Вендор ТКО',
  'Классификация ТКО', 'ЕРРП', 'ЕРМТР', 'Регистрационный номер ТКО', 'Количество',
  'Замещенное импортное ТКО', 'Кол-во выводенного импортного ТКО', 'Статья затрат ТКО',
  'Платеж ТР без НДС', 'Год', 'Примечание',
] as const;
const SELECT_VALUE_OPTIONS: Record<string, string[]> = {
  'Классификация ТКО': ['Импорт', 'РФ в реестре', 'РФ НЕ в реестре'],
  'ЕРРП': ['ДА', 'НЕТ'],
  'ЕРМТР': ['ДА', 'НЕТ'],
  'Статья затрат ТКО': ['ОНМ', 'ПЭН'],
};
const NUMERIC_COLUMNS = new Set(['Количество', 'Кол-во выводенного импортного ТКО', 'Платеж ТР без НДС', 'Год']);
const DEFAULT_NEW_ROW: Row = { 'ЕРРП': 'НЕТ', 'ЕРМТР': 'НЕТ', 'Статья затрат ТКО': 'ПЭН' };

function parseComparable(value: unknown): number | string {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (!Number.isNaN(asNumber) && value.trim() !== '') return asNumber;
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

export default function ImportSubstitutionTable(): React.ReactElement {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState | null>({
    key: 'Подразделение',
    direction: 'asc',
  });
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lookupRows, setLookupRows] = useState<Record<string, Row[]>>({});
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newRowData, setNewRowData] = useState<Row>({});
  const [addError, setAddError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  function setFilter(column: string, value: string): void {
    setFilters((prev) => ({ ...prev, [column]: value }));
  }

  function loadData(): Promise<void> {
    setLoading(true);
    setError(null);

    return fetch('/api/import-substitution', { cache: 'no-store' })
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
    async function loadSelectOptions(): Promise<void> {
      const entries = Object.entries(IMPORT_SUBSTITUTION_SELECT_CONFIG);
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

  const columns = useMemo(() => [...IMPORT_SUBSTITUTION_COLUMNS], []);

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
      columns.every((col) => {
        const filterValue = (filters[col] ?? '').trim().toLowerCase();
        if (!filterValue) return true;
        return String(row[col] ?? '').toLowerCase().includes(filterValue);
      })
    );
  }, [sortedData, filters, columns]);

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
    setEditingRowId(Number(row['GN_import_substitution_id']));
    setDraft({ ...row });
    setSaveError(null);
  }

  function cancelEdit(): void {
    setEditingRowId(null);
    setDraft({});
    setSaveError(null);
  }

  function updateDraft(column: string, value: string): void {
    setDraft((prev) => ({
      ...prev,
      [column]: value,
    }));
  }

  function startNewRow(): void {
    setNewRowData(DEFAULT_NEW_ROW);
    setAddError(null);
    setIsAddingNew(true);
  }

  function getSelectOptionsForColumn(column: string): SelectOption[] {
    const config = IMPORT_SUBSTITUTION_SELECT_CONFIG[column];
    if (!config) return [];

    const rows = lookupRows[column] ?? [];
    return rows.map((row) => {
      const label = String(row[config.labelKey] ?? '');
      return { value: label, label };
    });
  }

  function exportToXlsx(): void {
    const header = ['№', ...columns];
    const rows = filteredData.map((row) => [row.GN_import_substitution_id ?? '', ...columns.map((column) => row[column] ?? '')]);
    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    worksheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };
    worksheet['!cols'] = header.map((title, index) => ({
      wch: Math.min(44, Math.max(12, ...[title, ...rows.map((row) => String(row[index] ?? ''))].map((value) => value.length + 2))),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Импортозамещение');
    XLSX.writeFile(workbook, 'Импортозамещение.xlsx');
  }

  async function importFromXlsx(file: File): Promise<void> {
    setImporting(true);
    setImportError(null);
    setImportMessage(null);

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('В файле отсутствуют листы');

      const rows = XLSX.utils.sheet_to_json<Row>(workbook.Sheets[sheetName], { defval: '' });
      let savedRows = 0;
      for (const row of rows) {
        const rowId = Number(row['№']);
        const payload = Object.fromEntries(columns.map((column) => [column, row[column] ?? '']));
        if (!String(payload['Подразделение']).trim()) continue;

        const response = await fetch(Number.isInteger(rowId) && rowId > 0 ? `/api/import-substitution/${rowId}` : '/api/import-substitution', {
          method: Number.isInteger(rowId) && rowId > 0 ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(`Строка ${savedRows + 2}: ${errorPayload.error || formatHttpError(response.status)}`);
        }
        savedRows += 1;
      }
      if (savedRows === 0) throw new Error('В файле нет строк для загрузки');

      await loadData();
      setImportMessage(`Загружено строк: ${savedRows}.`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Не удалось загрузить файл Excel');
    } finally {
      setImporting(false);
    }
  }

  async function saveEdit(): Promise<void> {
    if (editingRowId == null) return;
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/import-substitution/${editingRowId}`, {
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
      setData((previous) => previous.map((row) => (
        Number(row['GN_import_substitution_id']) === editingRowId
          ? { ...row, ...draft, ...updatedRow }
          : row
      )));
      cancelEdit();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="hint">Загрузка данных...</p>;
  }

  if (error) {
    return <p className="hint hint--error">Ошибка: {error}</p>;
  }

  async function createNewRow(): Promise<void> {
    setAddError(null);
    
    if (!newRowData['Подразделение']) {
      setAddError('Заполните все обязательные поля');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/import-substitution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newRowData),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      await response.json();
      await loadData();
      setNewRowData({});
      setIsAddingNew(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Не удалось создать запись');
    } finally {
      setSaving(false);
    }
  }

  if (data.length === 0 && !isAddingNew) {
    return (
      <div className="empty-state">
        <p className="hint">Нет данных по импортозамещению.</p>
        <button type="button" className="page-action-btn" onClick={startNewRow}>
          Добавить первую запись
        </button>
      </div>
    );
  }

  return (
    <div className="import-substitution-table-wrap">
      {!isAddingNew && (
        <div className="guide-table-actions">
          <button
            type="button"
            className="page-action-btn page-action-btn--secondary"
            onClick={startNewRow}
          >
            Добавить строку
          </button>
          <button type="button" className="page-action-btn page-action-btn--secondary" onClick={exportToXlsx}>
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
                if (file) void importFromXlsx(file);
              }}
            />
          </label>
        </div>
      )}
      {importMessage && <p className="hint">{importMessage}</p>}
      {importError && <p className="hint hint--error">Ошибка загрузки из Excel: {importError}</p>}

      {isAddingNew && (
        <div className="new-row-form">
          <div className="new-row-form-fields">
            {columns.map((column) => (
              <div className="form-field" key={column}>
                <label>{column}:</label>
                {IMPORT_SUBSTITUTION_SELECT_CONFIG[column] || SELECT_VALUE_OPTIONS[column] ? (
                  <select
                    value={String(newRowData[column] ?? '')}
                    onChange={(event) => setNewRowData((previous) => ({ ...previous, [column]: event.target.value }))}
                    className="form-input"
                  >
                    <option value="">Выберите значение</option>
                    {(IMPORT_SUBSTITUTION_SELECT_CONFIG[column]
                      ? getSelectOptionsForColumn(column).map((option) => option.value)
                      : SELECT_VALUE_OPTIONS[column]
                    ).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input
                    type={NUMERIC_COLUMNS.has(column) ? 'number' : 'text'}
                    step={column === 'Год' ? '1' : NUMERIC_COLUMNS.has(column) ? '0.01' : undefined}
                    value={String(newRowData[column] ?? '')}
                    onChange={(event) => setNewRowData((previous) => ({ ...previous, [column]: event.target.value }))}
                    className="form-input"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="new-row-form-actions">
            <button
              type="button"
              className="action-btn action-btn--save"
              onClick={() => void createNewRow()}
              disabled={saving}
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              type="button"
              className="action-btn action-btn--cancel"
              onClick={() => {
                setIsAddingNew(false);
                setNewRowData({});
                setAddError(null);
              }}
              disabled={saving}
            >
              Отмена
            </button>
            {addError && <p className="error-message">{addError}</p>}
          </div>
        </div>
      )}

      <div className="guide-table-wrap invest-program-table-wrap--narrow">
        <table className="guide-table table-compact import-substitution-table">
          <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>
                <div className="table-header-content">
                  <button
                    type="button"
                    className="invest-program-row-action-button invest-program-row-action-button--secondary import-substitution-sort-button"
                    onClick={() => toggleSort(column)}
                  >
                    {column}
                    {sort?.key === column && (
                      <span className="sort-indicator">
                        {sort.direction === 'asc' ? ' ▲' : ' ▼'}
                      </span>
                    )}
                  </button>
                </div>
                <input
                  type="text"
                  className="contract-filter-input"
                  placeholder="Фильтр..."
                  value={filters[column] ?? ''}
                  onChange={(e) => setFilter(column, e.target.value)}
                />
              </th>
            ))}
            <th>Действия</th>
          </tr>
          </thead>
          <tbody>
          {filteredData.map((row) => {
            const rowId = Number(row['GN_import_substitution_id']);
            const isEditing = editingRowId === rowId;

            return (
              <tr key={rowId} className={isEditing ? 'editing' : ''}>
                {columns.map((column) => (
                  <td key={column}>
                    {isEditing ? (
                      IMPORT_SUBSTITUTION_SELECT_CONFIG[column] || SELECT_VALUE_OPTIONS[column] ? (
                        <select
                          value={String(draft[column] ?? '')}
                          onChange={(e) => updateDraft(column, e.target.value)}
                          className="invest-program-inline-input"
                        >
                          <option value="">Выберите подразделение</option>
                          {(IMPORT_SUBSTITUTION_SELECT_CONFIG[column]
                            ? getSelectOptionsForColumn(column).map((option) => option.value)
                            : SELECT_VALUE_OPTIONS[column]
                          ).map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input
                          type={NUMERIC_COLUMNS.has(column) ? 'number' : 'text'}
                          step={column === 'Год' ? '1' : NUMERIC_COLUMNS.has(column) ? '0.01' : undefined}
                          value={String(draft[column] ?? '')}
                          onChange={(e) => updateDraft(column, e.target.value)}
                          className="invest-program-inline-input"
                        />
                      )
                    ) : (
                      <span>{String(row[column] ?? '')}</span>
                    )}
                  </td>
                ))}
                <td className="invest-program-actions-cell">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        className="invest-program-row-action-button"
                        onClick={() => void saveEdit()}
                        disabled={saving}
                      >
                        {saving ? 'Сохранение...' : 'Сохранить'}
                      </button>
                      <button
                        type="button"
                        className="invest-program-row-action-button invest-program-row-action-button--secondary"
                        onClick={cancelEdit}
                        disabled={saving}
                      >
                        Отмена
                      </button>
                      {saveError && <p className="error-message">{saveError}</p>}
                    </>
                  ) : (
                    <button
                      type="button"
                      className="invest-program-row-action-button"
                      onClick={() => startEdit(row)}
                    >
                      Редактировать
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
