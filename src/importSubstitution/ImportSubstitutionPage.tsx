import React, { useEffect, useState } from 'react'
import ImportSubstitutionSummaryTable from './ImportSubstitutionSummaryTable'
import InvestProgramTablePage from '../Purchase/InvestProgramTablePage'
import { formatHttpError, formatErrorMessage } from '../utils/httpUtils'

type Row = Record<string, unknown>;
type EquipmentTab = 'import-substitution' | 'purchases' | 'equipment-accounting';

function tabFromHash(hash: string): EquipmentTab {
  if (hash === '#equipment-purchases' || hash === '#invest-program-table') return 'purchases';
  if (hash === '#equipment-accounting') return 'equipment-accounting';
  return 'import-substitution';
}

// Страница «Импортозамещение»: на странице остается только сводная таблица,
// большая таблица открывается в отдельном popup-окне.
export default function ImportSubstitutionPage(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<EquipmentTab>(() => tabFromHash(window.location.hash));
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [data, setData] = useState<Row[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onHashChange(): void {
      setActiveTab(tabFromHash(window.location.hash));
    }

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  async function loadSummaryData(): Promise<void> {
    if (loading || hasLoaded) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/import-substitution', { cache: 'no-store' });
      if (!response.ok) throw new Error(formatHttpError(response.status));
      const rows = await response.json() as Row[];
      setData(rows);
      setHasLoaded(true);
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function toggleSummary(): void {
    const nextExpanded = !summaryExpanded;
    setSummaryExpanded(nextExpanded);
    if (nextExpanded) void loadSummaryData();
  }

  function selectTab(tab: EquipmentTab): void {
    setActiveTab(tab);
    const hash = tab === 'purchases'
      ? '#equipment-purchases'
      : tab === 'equipment-accounting'
        ? '#equipment-accounting'
        : '#import-substitution';
    window.location.hash = hash;
  }

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
          onClick={() => selectTab('import-substitution')}
        >
          Импортозамещение
        </button>
        <button
          type="button"
          className={`budget-subnav-tab${activeTab === 'purchases' ? ' budget-subnav-tab--active' : ''}`}
          onClick={() => selectTab('purchases')}
        >
          Закупки
        </button>
        <button
          type="button"
          className={`budget-subnav-tab${activeTab === 'equipment-accounting' ? ' budget-subnav-tab--active' : ''}`}
          onClick={() => selectTab('equipment-accounting')}
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
          <section className="guide-section import-substitution-summary-section">
            <h2>
              <button
                type="button"
                className="invest-program-section-toggle page-text-link"
                aria-expanded={summaryExpanded}
                aria-controls="import-substitution-summary"
                onClick={toggleSummary}
              >
                <span aria-hidden="true">{summaryExpanded ? '▾' : '▸'}</span>
                Сводная таблица по импортозамещению
              </button>
            </h2>
            <div id="import-substitution-summary" hidden={!summaryExpanded}>
              {summaryExpanded && (
                <>
                  {loading && <p className="hint">Загрузка данных...</p>}
                  {error && (
                    <>
                      <p className="hint hint--error">Ошибка: {error}</p>
                      <button type="button" className="page-text-link" onClick={() => void loadSummaryData()}>
                        Повторить загрузку
                      </button>
                    </>
                  )}
                  {!loading && !error && data.length === 0 && (
                    <p className="hint">Нет данных по импортозамещению.</p>
                  )}
                  {!loading && !error && data.length > 0 && <ImportSubstitutionSummaryTable data={data} />}
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'purchases' && <InvestProgramTablePage />}

      {activeTab === 'equipment-accounting' && (
        <div className="page-content">
          <div className="guide-table-actions import-substitution-page-actions import-substitution-page-actions--equipment">
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
