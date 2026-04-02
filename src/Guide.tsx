import { useState } from 'react';
import './styles.css';

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

  if (section.loading) return <p className="hint">Загрузка...</p>;
  if (section.error)   return <p className="hint hint--error">Ошибка: {section.error}</p>;
  if (section.data.length === 0) return <p className="hint">Нет данных.</p>;

  const columns = Object.keys(section.data[0]);

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
        throw new Error(payload.error || `HTTP ${response.status}`);
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

  return (
    <div className="guide-table-wrap">
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

