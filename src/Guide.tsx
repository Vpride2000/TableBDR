import { useState } from 'react';
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
  data: Row[];
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

const TABLE_DEFS: { title: string; endpoint: string; entity: string; idColumn: string }[] = [
  { title: 'Подразделения', endpoint: '/api/gn/departments', entity: 'departments', idColumn: 'GN_Dep_id' },
  { title: 'Статьи бюджета', endpoint: '/api/gn/budget-items', entity: 'budget-items', idColumn: 'GN_b_id' },
  { title: 'Статьи бюджета УС', endpoint: '/api/gn/pao-budget-items', entity: 'pao-budget-items', idColumn: 'PAO_b_id' },
  { title: 'Контрагенты', endpoint: '/api/gn/contractors', entity: 'contractors', idColumn: 'GN_c_id' },
  { title: 'Договоры', endpoint: '/api/gn/dogovors', entity: 'dogovors', idColumn: 'GN_dgv_id' },
  { title: 'Объекты', endpoint: '/api/gn/objects', entity: 'objects', idColumn: 'GN_do_id' },
  { title: 'ОКДП ТКО для ИС ПРИТ', endpoint: '/api/gn/invest-okdp-tko-is-prit', entity: 'invest-okdp-tko-is-prit', idColumn: 'GN_invest_okdp_tko_is_prit_id' },
  { title: 'Огрузочный реквизит', endpoint: '/api/gn/invest-ogruz-rekvizit', entity: 'invest-ogruz-rekvizit', idColumn: 'GN_invest_ogruz_rekvizit_id' },
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
};

function DataTable({ section, onSectionRowsUpdate, fkOptions }: { section: TableSection; onSectionRowsUpdate: (endpoint: string, rows: Row[]) => void; fkOptions: Record<string, SelectOption[]> }) {
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [creatingRow, setCreatingRow] = useState(false);
  const [newRow, setNewRow] = useState<Row>({});
  const [createError, setCreateError] = useState<string | null>(null);

  if (section.loading) return <p className="hint">Загрузка...</p>;
  if (section.error)   return <p className="hint hint--error">Ошибка: {section.error}</p>;

  const columns = section.data.length > 0 ? Object.keys(section.data[0]) : [section.idColumn];

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
      if (column === section.idColumn) return acc;
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

  return (
    <div className="guide-table-wrap">
      <div className="guide-table-actions">
        <button type="button" className="page-action-btn page-action-btn--secondary" onClick={startCreate} disabled={creatingRow}>Добавить</button>
      </div>
      {creatingRow && (
        <div className="guide-new-row">
          <h2>Новая запись</h2>
          <div className="guide-new-row-fields">
            {columns.filter((col) => col !== section.idColumn).map((col) => (
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
            {columns.map((col) => <th key={col}>{col}</th>)}
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {section.data.map((row, i) => {
            const rowId = Number(row[section.idColumn]);
            const isEditing = editingRowId === rowId;

            return (
              <tr key={i} className={isEditing ? 'editing' : ''}>
                {columns.map((col) => (
                  <td key={col}>
                    {isEditing && col !== section.idColumn && fkOptions[col] ? (
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
                    ) : isEditing && col !== section.idColumn ? (
                      <input
                        value={String(draft[col] ?? '')}
                        onChange={(event) => updateDraft(col, event.target.value)}
                      />
                    ) : (
                      resolveFkLabel(col, row[col])
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
      {!saveError && section.data.length === 0 && <p className="hint">Нет данных.</p>}
    </div>
  );
}

export default function Guide() {
  const [sections, setSections] = useState<TableSection[]>(
    TABLE_DEFS.map((def) => ({
      ...def,
      data: [],
      expanded: false,
      loaded: false,
      loading: false,
      error: null,
    }))
  );

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
      <div className="guide-grid">
        {sections.map((section) => (
          <div key={section.endpoint} className="guide-section">
            <h2>
              <span>{section.title}</span>
              <button
                type="button"
                className="guide-section-toggle"
                onClick={() => toggleSection(section.endpoint)}
                aria-expanded={section.expanded}
              >
                {section.expanded ? 'Свернуть' : 'Развернуть'}
              </button>
            </h2>
            {section.expanded && (
              <DataTable
                section={section}
                onSectionRowsUpdate={onSectionRowsUpdate}
                fkOptions={buildFkOptions(section)}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

