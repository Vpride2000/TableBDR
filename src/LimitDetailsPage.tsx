import { useEffect, useMemo, useState } from 'react';
import './styles.css';
import { formatHttpError } from './utils/forecastUtils';

// Страница подробного расчета лимита для выбранной строки BDR.
// Загружает текущие данные по строке, отображает расчетные строки
// и позволяет пользователю сохранять изменения в лимите.
const BDR_UPDATED_EVENT_KEY = 'bdr:last-update';
const FORECAST_UPDATED_EVENT_KEY = 'forecast:last-update';

type Row = Record<string, unknown>;

type CalculationLine = {
  id: string;
  quantity: string;
  tariff: string;
  note: string;
};

type LimitCalculationResponse = {
  rowId: number;
  unitLimit: number;
  comments: string;
  lines: Array<{
    lineOrder: number;
    quantity: number;
    tariff: number;
    note: string;
  }>;
  totalByLines: number;
  calculatedLimit: number;
  storedLimit: number;
  difference: number;
};

interface LimitDetailsPageProps {
  rowId: number;
  onBack: () => void;
}

interface LimitDraft {
  lines: CalculationLine[];
  unitLimit: string;
  comments: string;
}

function parseNumericValue(value: string): number {
  const normalized = value.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
  }).format(value);
}

function distributeByMonths(total: number): number[] {
  const yearlyCents = Math.round(total * 100);
  const base = Math.trunc(yearlyCents / 12);
  const remainder = yearlyCents - base * 12;
  const sign = remainder >= 0 ? 1 : -1;
  const addCount = Math.abs(remainder);

  return Array.from({ length: 12 }, (_, index) => {
    const extra = index < addCount ? sign : 0;
    return (base + extra) / 100;
  });
}

async function loadCurrentFactValues(rowId: number): Promise<number[]> {
  const response = await fetch('/api/gn/forecast-monthly');
  if (!response.ok) {
    throw new Error(formatHttpError(response.status));
  }

  const payload = (await response.json()) as {
    rows?: Array<{
      rowId: number;
      monthlyFactValues?: number[];
    }>;
  };

  const current = (payload.rows ?? []).find((item) => Number(item.rowId) === rowId);
  if (!current || !Array.isArray(current.monthlyFactValues) || current.monthlyFactValues.length !== 12) {
    return new Array<number>(12).fill(0);
  }

  return current.monthlyFactValues.map((value) => parseNumericValue(String(value ?? 0)));
}

export default function LimitDetailsPage({ rowId, onBack }: LimitDetailsPageProps) {
  const [row, setRow] = useState<Row | null>(null);
  const [draft, setDraft] = useState<LimitDraft>({
    lines: [],
    unitLimit: '',
    comments: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [fillForecastEvenly, setFillForecastEvenly] = useState(false);

  useEffect(() => {
    function applyLoadedRow(loadedRow: Row, calculation: LimitCalculationResponse): void {
      setRow(loadedRow);
      setDraft({
        lines: calculation.lines.map((line, index) => ({
          id: `${Date.now()}-${index}`,
          quantity: String(line.quantity ?? ''),
          tariff: String(line.tariff ?? ''),
          note: String(line.note ?? ''),
        })),
        unitLimit: String(calculation.unitLimit ?? 0),
        comments: String(calculation.comments ?? loadedRow['Примечания'] ?? ''),
      });
    }

    async function loadRow(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const [rowResponse, calculationResponse] = await Promise.all([
          fetch(`/api/gn/bdr/${rowId}`),
          fetch(`/api/gn/bdr/${rowId}/limit-calculation`),
        ]);

        if (!rowResponse.ok) {
          const payload = (await rowResponse.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || formatHttpError(rowResponse.status));
        }

        if (!calculationResponse.ok) {
          const payload = (await calculationResponse.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || formatHttpError(calculationResponse.status));
        }

        const loadedRow = (await rowResponse.json()) as Row;
        const calculation = (await calculationResponse.json()) as LimitCalculationResponse;
        applyLoadedRow(loadedRow, calculation);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить расчет лимита');
      } finally {
        setLoading(false);
      }
    }

    void loadRow();
  }, [rowId]);

  const totalByLines = useMemo(
    () => draft.lines.reduce((acc, line) => acc + parseNumericValue(line.quantity) * parseNumericValue(line.tariff), 0),
    [draft.lines]
  );

  const unitLimitValue = useMemo(() => parseNumericValue(draft.unitLimit), [draft.unitLimit]);
  const calculatedLimit = totalByLines + unitLimitValue;
  const storedLimit = useMemo(() => parseNumericValue(String(row?.['Лимит'] ?? 0)), [row]);
  const difference = storedLimit - calculatedLimit;

  function updateDraft(field: Exclude<keyof LimitDraft, 'lines'>, value: string): void {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setSaveError(null);
    setSaveSuccess(null);
  }

  function updateLine(lineId: string, field: keyof CalculationLine, value: string): void {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.id === lineId ? { ...line, [field]: value } : line)),
    }));
    setSaveError(null);
    setSaveSuccess(null);
  }

  function addLine(): void {
    setDraft((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          id: `${Date.now()}-${Math.random()}`,
          quantity: '',
          tariff: '',
          note: '',
        },
      ],
    }));
  }

  function removeLine(lineId: string): void {
    setDraft((prev) => {
      const nextLines = prev.lines.filter((line) => line.id !== lineId);
      return {
        ...prev,
        lines: nextLines.length > 0 ? nextLines : prev.lines,
      };
    });
  }

  async function saveChanges(): Promise<void> {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      if (draft.lines.length === 0) {
        throw new Error('Добавьте хотя бы одну строку расчета');
      }

      const calcResponse = await fetch(`/api/gn/bdr/${rowId}/limit-calculation`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          unitLimit: unitLimitValue,
          comments: draft.comments,
          lines: draft.lines.map((line) => ({
            quantity: parseNumericValue(line.quantity),
            tariff: parseNumericValue(line.tariff),
            note: line.note,
          })),
        }),
      });

      if (!calcResponse.ok) {
        const payload = (await calcResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || formatHttpError(calcResponse.status));
      }

      const updatedRowResponse = await fetch(`/api/gn/bdr/${rowId}`);
      if (!updatedRowResponse.ok) {
        const payload = (await updatedRowResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || formatHttpError(updatedRowResponse.status));
      }

      const updatedRow = (await updatedRowResponse.json()) as Row;
      const calculation = (await calcResponse.json()) as LimitCalculationResponse;
      setRow(updatedRow);
      setDraft({
        lines: calculation.lines.map((line, index) => ({
          id: `${Date.now()}-${index}`,
          quantity: String(line.quantity ?? ''),
          tariff: String(line.tariff ?? ''),
          note: String(line.note ?? ''),
        })),
        unitLimit: String(calculation.unitLimit ?? 0),
        comments: String(calculation.comments ?? updatedRow['Примечания'] ?? ''),
      });

      if (fillForecastEvenly) {
        const monthlyValues = distributeByMonths(calculation.calculatedLimit);
        const monthlyFactValues = await loadCurrentFactValues(rowId);

        const forecastResponse = await fetch('/api/gn/forecast-monthly', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            rows: [
              {
                rowId,
                monthlyValues,
                monthlyFactValues,
              },
            ],
          }),
        });

        if (!forecastResponse.ok) {
          const payload = (await forecastResponse.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || formatHttpError(forecastResponse.status));
        }

        localStorage.setItem(FORECAST_UPDATED_EVENT_KEY, String(Date.now()));
      }

      setSaveSuccess('Расчет лимита сохранен');
      localStorage.setItem(BDR_UPDATED_EVENT_KEY, String(Date.now()));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить расчет лимита');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="budget add-row-page limit-details-page">
      <div className="limit-details-header">
        <h1>Расчет лимита</h1>
        <button type="button" className="page-action-btn page-action-btn--secondary" onClick={onBack}>
          Закрыть
        </button>
      </div>

      {loading && <p className="hint">Загрузка данных...</p>}
      {error && <p className="hint hint--error">Ошибка: {error}</p>}

      {!loading && !error && row && (
        <div className="guide-new-row add-row-form-vertical limit-details-card">
          <h2>Позиция #{rowId}</h2>

          <div className="limit-details-meta">
            <div><strong>Подразделение:</strong> {String(row['Подразделение'] ?? '')}</div>
            <div><strong>Объект:</strong> {String(row['Объект'] ?? '')}</div>
            <div><strong>Контрагент:</strong> {String(row['Контрагент'] ?? '')}</div>
            <div><strong>Договор:</strong> {String(row['Договор'] ?? '')}</div>
            <div><strong>Статья бюджета УС:</strong> {String(row['Статья бюджета УС'] ?? '')}</div>
            <div><strong>Предмет договора:</strong> {String(row['Предмет договора'] ?? '')}</div>
          </div>

          <div className="limit-lines-wrap">
            <table className="guide-table table-compact limit-lines-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Кол-во</th>
                  <th>Тариф</th>
                  <th>Сумма строки</th>
                  <th>Комментарий</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((line, index) => {
                  const lineTotal = parseNumericValue(line.quantity) * parseNumericValue(line.tariff);
                  return (
                    <tr key={line.id}>
                      <td>{index + 1}</td>
                      <td>
                        <input
                          type="number"
                          value={line.quantity}
                          onChange={(event) => updateLine(line.id, 'quantity', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={line.tariff}
                          onChange={(event) => updateLine(line.id, 'tariff', event.target.value)}
                        />
                      </td>
                      <td>{formatNumber(lineTotal)}</td>
                      <td>
                        <input
                          type="text"
                          value={line.note}
                          onChange={(event) => updateLine(line.id, 'note', event.target.value)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="page-action-btn page-action-btn--secondary"
                          onClick={() => removeLine(line.id)}
                          disabled={draft.lines.length <= 1}
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button type="button" className="page-action-btn page-action-btn--secondary" onClick={addLine}>
              Добавить строку расчета
            </button>
          </div>

          <div className="form-field">
            <label htmlFor="limit-unit" className="form-field-label">Един. лимит (добавляется в конце)</label>
            <input
              id="limit-unit"
              type="number"
              value={draft.unitLimit}
              onChange={(event) => updateDraft('unitLimit', event.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="limit-comments" className="form-field-label">Примечания</label>
            <input
              id="limit-comments"
              type="text"
              value={draft.comments}
              onChange={(event) => updateDraft('comments', event.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="fill-forecast-evenly" className="form-field-label">
              <input
                id="fill-forecast-evenly"
                type="checkbox"
                checked={fillForecastEvenly}
                onChange={(event) => setFillForecastEvenly(event.target.checked)}
              />{' '}
              заполнить прогноз равномерно
            </label>
          </div>

          <div className="limit-calculation-box">
            <p><strong>Сумма по строкам:</strong> {formatNumber(totalByLines)}</p>
            <p><strong>Един. лимит:</strong> {formatNumber(unitLimitValue)}</p>
            <p><strong>Итоговый расчет:</strong> {formatNumber(calculatedLimit)}</p>
            <p><strong>Текущее значение в таблице:</strong> {formatNumber(storedLimit)}</p>
            <p className={difference === 0 ? 'limit-difference-ok' : 'limit-difference-warning'}>
              <strong>Расхождение до сохранения:</strong> {formatNumber(difference)}
            </p>
          </div>

          <div className="budget-actions limit-details-actions">
            <button type="button" className="form-submit-btn" onClick={() => void saveChanges()} disabled={saving}>
              Сохранить
            </button>
            <button type="button" className="page-action-btn page-action-btn--secondary" onClick={onBack} disabled={saving}>
              Закрыть
            </button>
          </div>

          {saveSuccess && <p className="hint">{saveSuccess}</p>}
          {saveError && <p className="hint hint--error">Ошибка сохранения: {saveError}</p>}
        </div>
      )}
    </section>
  );
}