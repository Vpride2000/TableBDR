import React, { useEffect, useState } from 'react'
import ImportSubstitutionSummaryTable from './ImportSubstitutionSummaryTable'
import { formatHttpError, formatErrorMessage } from '../utils/forecastUtils'

type Row = Record<string, unknown>;

// Страница «Импортозамещение»: на странице остается только сводная таблица,
// большая таблица открывается в отдельном popup-окне.
export default function ImportSubstitutionPage(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<'import-substitution' | 'equipment-accounting'>('import-substitution');
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'import-substitution') return;

    setLoading(true);
    setError(null);

    fetch('/api/import-substitution', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(formatHttpError(res.status));
        return res.json() as Promise<Row[]>;
      })
      .then((rows) => setData(rows))
      .catch((err: Error) => setError(formatErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [activeTab]);

  function openTableWindow(): void {
    const popup = window.open(
      `${window.location.pathname}#import-substitution-table-window`,
      'import-substitution-table-window',
      'popup=yes,width=1500,height=900,resizable=yes,scrollbars=yes'
    );
    if (popup) popup.focus();
  }

  function openEquipmentAccountingWindow(): void {
    const popup = window.open(
      `${window.location.pathname}#equipment-accounting-window`,
      'equipment-accounting-window',
      'popup=yes,width=1500,height=900,resizable=yes,scrollbars=yes'
    );
    if (popup) popup.focus();
  }

  function openMseAccountingWindow(): void {
    const popup = window.open(
      `${window.location.pathname}#mse-accounting-window`,
      'mse-accounting-window',
      'popup=yes,width=1500,height=900,resizable=yes,scrollbars=yes'
    );
    if (popup) popup.focus();
  }

  return (
    <section className="page-section">
      <div className="page-header">
        <h3>Оборудование</h3>
      </div>

      <div className="budget-subnav">
        <button
          type="button"
          className={`budget-subnav-tab${activeTab === 'import-substitution' ? ' budget-subnav-tab--active' : ''}`}
          onClick={() => setActiveTab('import-substitution')}
        >
          Импортозамещение
        </button>
        <button
          type="button"
          className={`budget-subnav-tab${activeTab === 'equipment-accounting' ? ' budget-subnav-tab--active' : ''}`}
          onClick={() => setActiveTab('equipment-accounting')}
        >
          Учет оборудования
        </button>
      </div>

      {activeTab === 'import-substitution' && (
        <div className="page-content">
          <div className="guide-table-actions import-substitution-page-actions">
            <button
              type="button"
              className="page-text-link"
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
      )}

      {activeTab === 'equipment-accounting' && (
        <div className="page-content">
          <div className="guide-table-actions import-substitution-page-actions">
            <button
              type="button"
              className="page-text-link"
              onClick={openEquipmentAccountingWindow}
            >
              Открыть учет оборудования
            </button>
            <button
              type="button"
              className="page-text-link"
              onClick={openMseAccountingWindow}
            >
              МСЭ
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
