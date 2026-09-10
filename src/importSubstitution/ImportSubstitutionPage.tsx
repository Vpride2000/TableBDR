import React, { useEffect, useState } from 'react'
import ImportSubstitutionSummaryTable from './ImportSubstitutionSummaryTable'
import { formatHttpError, formatErrorMessage } from '../utils/forecastUtils'

type Row = Record<string, unknown>;

// Страница «Импортозамещение»: на странице остается только сводная таблица,
// большая таблица открывается в отдельном popup-окне.
export default function ImportSubstitutionPage(): React.ReactElement {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/import-substitution', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(formatHttpError(res.status));
        return res.json() as Promise<Row[]>;
      })
      .then((rows) => setData(rows))
      .catch((err: Error) => setError(formatErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  function openTableWindow(): void {
    const popup = window.open(
      `${window.location.pathname}#import-substitution-table-window`,
      'import-substitution-table-window',
      'popup=yes,width=1500,height=900,resizable=yes,scrollbars=yes'
    );
    if (popup) popup.focus();
  }

  return (
    <section className="page-section">
      <div className="page-header">
        <h1>Импортозамещение</h1>
        <p className="hint">Управление показателями процента исполнения по подразделениям</p>
      </div>
      <div className="page-content">
        <div className="guide-table-actions">
          <button
            type="button"
            className="page-action-btn page-action-btn--secondary"
            onClick={openTableWindow}
          >
            Открыть полную таблицу ИС ПРИТ
          </button>
        </div>
        {loading && <p className="hint">Загрузка данных...</p>}
        {error && <p className="hint hint--error">Ошибка: {error}</p>}
        {!loading && !error && data.length === 0 && (
          <p className="hint">Нет данных по импортозамещению.</p>
        )}
        {!loading && !error && <ImportSubstitutionSummaryTable data={data} />}
      </div>
    </section>
  )
}
