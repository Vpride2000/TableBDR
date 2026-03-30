import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import './styles.css';

const BDR_UPDATED_EVENT_KEY = 'bdr:last-update';

interface AddBudgetRowPageProps {
  onBack: () => void;
  showFormOnLoad?: boolean;
}

interface NewBdrFormState {
  pao_budget_item: string;
  department: string;
  object_name: string;
  dogovor: string;
  contractor: string;
  budget_item: string;
  predmet_dogovora: string;
  ed_izm: string;
  kol_vo: string;
  limit: string;
  edin_limit: string;
  comments: string;
}

interface FieldDefinition {
  name: keyof NewBdrFormState;
  label: string;
  comment: string;
  placeholder: string;
  required?: boolean;
  type?: 'text' | 'number';
  selectConfig?: {
    endpoint: string;
    labelKey: string;
  };
}

type SelectOption = { value: string; label: string };
type LookupRowsByField = Partial<Record<keyof NewBdrFormState, Array<Record<string, unknown>>>>;

const FORM_FIELDS: FieldDefinition[] = [
  {
    name: 'pao_budget_item',
    label: 'Статья бюджета УС',
    comment: 'Введите точное название статьи из справочника PAO__budget_network_item.',
    placeholder: 'Например: Аренда каналов связи',
    required: true,
    selectConfig: {
      endpoint: '/api/gn/pao-budget-items',
      labelKey: 'PAO__budget_network_item',
    },
  },
  {
    name: 'department',
    label: 'Подразделение',
    comment: 'Название должно совпадать со значением из таблицы GN_department.',
    placeholder: 'Например: Отдел связи',
    required: true,
    selectConfig: {
      endpoint: '/api/gn/departments',
      labelKey: 'GN_department',
    },
  },
  {
    name: 'object_name',
    label: 'Объект',
    comment: 'Укажите объект из справочника GN_departament_object.',
    placeholder: 'Например: Главный офис',
    required: true,
    selectConfig: {
      endpoint: '/api/gn/objects',
      labelKey: 'GN_departament_object',
    },
  },
  {
    name: 'dogovor',
    label: 'Договор',
    comment: 'Введите полное наименование договора из GN_dogovor.',
    placeholder: 'Например: Договор №001/2024 — Интернет и связь',
    required: true,
    selectConfig: {
      endpoint: '/api/gn/dogovors',
      labelKey: 'GN_dogovor',
    },
  },
  {
    name: 'contractor',
    label: 'Контрагент',
    comment: 'Название должно совпадать со значением из GN_contractor.',
    placeholder: 'Например: Ростелеком',
    required: true,
    selectConfig: {
      endpoint: '/api/gn/contractors',
      labelKey: 'GN_contarctor',
    },
  },
  {
    name: 'budget_item',
    label: 'Статья бюджета',
    comment: 'Введите статью из справочника GN_budget_network_item.',
    placeholder: 'Например: Интернет-услуги',
    required: true,
    selectConfig: {
      endpoint: '/api/gn/budget-items',
      labelKey: 'GN_budget_network_item',
    },
  },
  {
    name: 'predmet_dogovora',
    label: 'Предмет договора',
    comment: 'Краткое описание услуги или предмета закупки.',
    placeholder: 'Например: Корпоративный канал передачи данных',
    required: true,
  },
  {
    name: 'ed_izm',
    label: 'Ед. изм.',
    comment: 'Единица измерения: шт., мес., пакет и т.д.',
    placeholder: 'Например: мес.',
    required: true,
  },
  {
    name: 'kol_vo',
    label: 'Кол-во',
    comment: 'Числовое значение количества по позиции.',
    placeholder: 'Например: 2',
    required: true,
    type: 'number',
  },
  {
    name: 'limit',
    label: 'Лимит',
    comment: 'Общий лимит по позиции в числовом формате.',
    placeholder: 'Например: 120000',
    required: true,
    type: 'number',
  },
  {
    name: 'edin_limit',
    label: 'Един. лимит',
    comment: 'Лимит на единицу, только число.',
    placeholder: 'Например: 5000',
    required: true,
    type: 'number',
  },
  {
    name: 'comments',
    label: 'Примечания',
    comment: 'Необязательное поле для дополнительных пояснений.',
    placeholder: 'Любой уточняющий комментарий',
  },
];

const EMPTY_NEW_ROW: NewBdrFormState = {
  pao_budget_item: '',
  department: '',
  object_name: '',
  dogovor: '',
  contractor: '',
  budget_item: '',
  predmet_dogovora: '',
  ed_izm: '',
  kol_vo: '',
  limit: '',
  edin_limit: '',
  comments: '',
};

export default function AddBudgetRowPage({ onBack, showFormOnLoad = false }: AddBudgetRowPageProps) {
  const [showForm, setShowForm] = useState(showFormOnLoad);
  const [newRow, setNewRow] = useState<NewBdrFormState>(EMPTY_NEW_ROW);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [lookupRows, setLookupRows] = useState<LookupRowsByField>({});

  useEffect(() => {
    async function loadSelectOptions(): Promise<void> {
      const selectFields = FORM_FIELDS.filter((field) => field.selectConfig);
      const loaded = await Promise.all(
        selectFields.map(async (field) => {
          const config = field.selectConfig;
          if (!config) return [field.name, [] as Array<Record<string, unknown>>] as const;

          const response = await fetch(config.endpoint);
          if (!response.ok) return [field.name, [] as Array<Record<string, unknown>>] as const;

          const rows = (await response.json()) as Array<Record<string, unknown>>;
          return [field.name, rows] as const;
        })
      );

      setLookupRows(Object.fromEntries(loaded));
    }

    void loadSelectOptions();
  }, []);

  function onNewRowChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    const { name, value } = event.target;
    setNewRow((prev) => {
      if (name === 'department') {
        return { ...prev, department: value, object_name: '' };
      }

      if (name === 'contractor') {
        return { ...prev, contractor: value, dogovor: '' };
      }

      return { ...prev, [name]: value };
    });
  }

  function getSelectOptions(field: FieldDefinition): SelectOption[] {
    const config = field.selectConfig;
    if (!config) return [];

    const rows = lookupRows[field.name] ?? [];

    if (field.name === 'object_name') {
      if (!newRow.department) return [];

      const departments = lookupRows.department ?? [];
      const selectedDepartment = departments.find(
        (row) => String(row.GN_department ?? '') === newRow.department
      );
      const departmentId = Number(selectedDepartment?.GN_Dep_id);
      if (Number.isNaN(departmentId)) return [];

      return rows
        .filter((row) => Number(row.GN_department_FK) === departmentId)
        .map((row) => {
          const label = String(row[config.labelKey] ?? '');
          return { value: label, label };
        });
    }

    if (field.name === 'dogovor') {
      if (!newRow.contractor) return [];

      const contractors = lookupRows.contractor ?? [];
      const selectedContractor = contractors.find(
        (row) => String(row.GN_contarctor ?? '') === newRow.contractor
      );
      const contractorId = Number(selectedContractor?.GN_c_id);
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

  async function onCreateRow(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const response = await fetch('/api/gn/bdr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newRow),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      setNewRow(EMPTY_NEW_ROW);
      setCreateSuccess('Строка успешно добавлена');
      localStorage.setItem(BDR_UPDATED_EVENT_KEY, String(Date.now()));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось добавить строку';
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="budget add-row-page">
      <h1>Добавление строки</h1>

      {!showForm && (
        <div className="budget-actions">
          <button
            type="button"
            className="page-action-btn"
            onClick={() => setShowForm(true)}
          >
            Добавить строку
          </button>
        </div>
      )}

      {showForm && (
        <form className="guide-new-row add-row-form-vertical" onSubmit={(event) => void onCreateRow(event)}>
          <h2>Новая строка Бюджета</h2>
          <div className="form-fields-vertical">
            {FORM_FIELDS.map((field) => (
              <div className="form-field" key={field.name}>
                <label htmlFor={field.name} className="form-field-label">
                  {field.label}
                </label>
                <p className="form-field-comment">{field.comment}</p>
                {field.selectConfig ? (
                  (() => {
                    const options = getSelectOptions(field);
                    const needsDepartment = field.name === 'object_name';
                    const needsContractor = field.name === 'dogovor';
                    const disabled =
                      (needsDepartment && !newRow.department) ||
                      (needsContractor && !newRow.contractor);

                    return (
                  <select
                    id={field.name}
                    name={field.name}
                    value={newRow[field.name]}
                    onChange={onNewRowChange}
                    required={Boolean(field.required)}
                    disabled={disabled}
                  >
                    <option value="">
                      {needsDepartment && !newRow.department
                        ? 'Сначала выберите Подразделение'
                        : needsContractor && !newRow.contractor
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
                ) : (
                  <input
                    id={field.name}
                    name={field.name}
                    type={field.type ?? 'text'}
                    step={field.type === 'number' ? 'any' : undefined}
                    value={newRow[field.name]}
                    onChange={onNewRowChange}
                    placeholder={field.placeholder}
                    required={Boolean(field.required)}
                  />
                )}
              </div>
            ))}

            <button type="submit" className="form-submit-btn" disabled={creating}>
              {creating ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>

          {createError && <p className="hint hint--error">Ошибка добавления: {createError}</p>}
          {createSuccess && <p className="hint">{createSuccess}</p>}
        </form>
      )}

      <div className="budget-actions">
        <button type="button" className="page-action-btn page-action-btn--secondary" onClick={onBack}>
          Назад к таблице
        </button>
      </div>
    </section>
  );
}
