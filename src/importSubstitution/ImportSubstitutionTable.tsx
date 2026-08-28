import React, { useEffect, useState, useMemo } from 'react'
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
};

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

  function setFilter(column: string, value: string): void {
    setFilters((prev) => ({ ...prev, [column]: value }));
  }

  function loadData(): Promise<void> {
    setLoading(true);
    setError(null);

    return fetch('/api/gn/import-substitution')
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

  const columns = useMemo(() => ['Подразделение', 'Процент исполнения'], []);

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

  function getSelectOptionsForColumn(column: string): SelectOption[] {
    const config = IMPORT_SUBSTITUTION_SELECT_CONFIG[column];
    if (!config) return [];

    const rows = lookupRows[column] ?? [];
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
      const response = await fetch(`/api/gn/import-substitution/${editingRowId}`, {
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
        prev.map((row) => (Number(row['GN_import_substitution_id']) === editingRowId ? updatedRow : row))
      );
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
    
    if (!newRowData['Подразделение'] || newRowData['Процент исполнения'] === undefined) {
      setAddError('Заполните все обязательные поля');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/gn/import-substitution', {
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

      const createdRow = (await response.json()) as Row;
      setData((prev) => [...prev, createdRow]);
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
        <button
          type="button"
          className="page-action-btn"
          onClick={() => setIsAddingNew(true)}
        >
          Добавить первую запись
        </button>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      {!isAddingNew && (
        <div className="table-actions">
          <button
            type="button"
            className="page-action-btn"
            onClick={() => setIsAddingNew(true)}
          >
            Добавить строку
          </button>
        </div>
      )}

      {isAddingNew && (
        <div className="new-row-form">
          <div className="new-row-form-fields">
            <div className="form-field">
              <label>Подразделение:</label>
              <select
                value={String(newRowData['Подразделение'] ?? '')}
                onChange={(e) => setNewRowData((prev) => ({ ...prev, 'Подразделение': e.target.value }))}
                className="form-input"
              >
                <option value="">Выберите подразделение</option>
                {getSelectOptionsForColumn('Подразделение').map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Процент исполнения:</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={String(newRowData['Процент исполнения'] ?? '')}
                onChange={(e) => setNewRowData((prev) => ({ ...prev, 'Процент исполнения': e.target.value }))}
                className="form-input"
              />
            </div>
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

      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>
                <div className="table-header-content">
                  <button
                    type="button"
                    className="table-sort-button"
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
                  className="table-filter-input"
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
              <tr key={rowId} className={isEditing ? 'editing-row' : ''}>
                {columns.map((column) => (
                  <td key={column}>
                    {isEditing ? (
                      column === 'Подразделение' ? (
                        <select
                          value={String(draft[column] ?? '')}
                          onChange={(e) => updateDraft(column, e.target.value)}
                          className="cell-input cell-select"
                        >
                          <option value="">Выберите подразделение</option>
                          {getSelectOptionsForColumn(column).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={String(draft[column] ?? '')}
                          onChange={(e) => updateDraft(column, e.target.value)}
                          className="cell-input"
                        />
                      )
                    ) : (
                      <span>{String(row[column] ?? '')}</span>
                    )}
                  </td>
                ))}
                <td className="actions-cell">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        className="action-btn action-btn--save"
                        onClick={() => void saveEdit()}
                        disabled={saving}
                      >
                        {saving ? 'Сохранение...' : 'Сохранить'}
                      </button>
                      <button
                        type="button"
                        className="action-btn action-btn--cancel"
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
                      className="action-btn action-btn--edit"
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
  );
}
