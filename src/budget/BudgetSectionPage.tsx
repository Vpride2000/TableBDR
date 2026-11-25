import { useState } from 'react'
import GazpromTelecomTable from '../cellular/GazpromTelecomTable'

// Компонент подраздела страницы «Услуги_связи».
// Содержит вкладки бюджета, детализаций и Газпром телеком.
export default function BudgetSectionPage({
  onOpenBudgetDept,
  onOpenBudgetMain,
  onOpenSatellitesDetails,
}: {
  onOpenBudgetDept: () => void
  onOpenBudgetMain: () => void
  onOpenSatellitesDetails: () => void
}) {
  const [activeTab, setActiveTab] = useState<'budget' | 'details' | 'gazprom-telecom'>('budget')

  return (
    <div>
      <div className="budget-subnav">
        <button
          type="button"
          className={`budget-subnav-tab${activeTab === 'budget' ? ' budget-subnav-tab--active' : ''}`}
          onClick={() => setActiveTab('budget')}
        >
          Бюджет
        </button>
        <button
          type="button"
          className={`budget-subnav-tab${activeTab === 'details' ? ' budget-subnav-tab--active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Детализации
        </button>
        <button
          type="button"
          className={`budget-subnav-tab${activeTab === 'gazprom-telecom' ? ' budget-subnav-tab--active' : ''}`}
          onClick={() => setActiveTab('gazprom-telecom')}
        >
          Газпром телеком
        </button>
      </div>

      {activeTab === 'gazprom-telecom' && <GazpromTelecomTable />}

      {activeTab === 'budget' && (
        <div className="budget-popup-links">
          <button type="button" className="budget-popup-link-btn" onClick={onOpenBudgetDept}>
            Своды по лимитам
          </button>
          <button type="button" className="budget-popup-link-btn" onClick={onOpenBudgetMain}>
            БДР Услуги связи
          </button>
        </div>
      )}

      {activeTab === 'details' && (
        <div className="budget-popup-links">
          <button type="button" className="budget-popup-link-btn" onClick={onOpenSatellitesDetails}>
            Спутники: Сделать детализацию из XML первички
          </button>
        </div>
      )}
    </div>
  )
}

