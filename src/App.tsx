import { useRef, useState, useMemo, useEffect } from 'react'
import BudgetTable from './budget/BudgetTable'
import Guide from './Guide'
import AddBudgetRowPage from './budget/AddBudgetRowPage'
import LimitDetailsPage from './budget/LimitDetailsPage'
import ObjectDetailsPage from './budget/ObjectDetailsPage'
import DepartmentDetailsPage from './budget/DepartmentDetailsPage'
import ContractorDetailsPage from './budget/ContractorDetailsPage'
import ContractDetailsPage from './contract/ContractDetailsPage'
import ContractsPage from './contract/ContractsPage'
import InvestProgramTablePage from './Purchase/InvestProgramTablePage'
import { Page } from './types/forecast'
import { pageFromHash } from './utils/forecastUtils'

/*
  Основная точка входа клиентской части приложения.
  Отвечает за маршрутизацию между страницами по хэшу,
  отображение попапов и навигацию между разделами.
*/

interface DashboardSummary {
  serviceLines: number
  serviceTypes: number
  totalServiceBudget: number
  contractCount: number
  contractStatusCounts: Record<string, number>
  agreementCount: number
  agreementStatusCounts: Record<string, number>
  purchaseItems: number
  purchaseQuantity: number
  purchaseStatusCounts: Record<string, number>
  purchaseInBudget: number
  topServices: Array<{ name: string; budget: number }>
}

function StartDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadSummary(): Promise<void> {
      try {
        const [bdrResponse, contractsResponse, agreementsResponse, investResponse] = await Promise.all([
          fetch('/api/gn/bdr'),
          fetch('/api/gn/contracts'),
          fetch('/api/gn/contract-additional-agreements'),
          fetch('/api/gn/invest-program'),
        ])

        if (!bdrResponse.ok) throw new Error(`BDR HTTP ${bdrResponse.status}`)
        if (!contractsResponse.ok) throw new Error(`Contracts HTTP ${contractsResponse.status}`)
        if (!agreementsResponse.ok) throw new Error(`Agreements HTTP ${agreementsResponse.status}`)
        if (!investResponse.ok) throw new Error(`Invest HTTP ${investResponse.status}`)

        const bdrRows = (await bdrResponse.json()) as Array<Record<string, unknown>>
        const contractRows = (await contractsResponse.json()) as Array<Record<string, unknown>>
        const agreementRows = (await agreementsResponse.json()) as Array<Record<string, unknown>>
        const investRows = (await investResponse.json()) as Array<Record<string, unknown>>

        const parseNumber = (value: unknown): number => {
          const normalized = String(value ?? '').replace(/\s+/g, '').replace(',', '.')
          const parsed = Number(normalized)
          return Number.isFinite(parsed) ? parsed : 0
        }

        const serviceBudgetByType = new Map<string, number>()
        bdrRows.forEach((row) => {
          const serviceName = String(row['Статья бюджета УС'] ?? row['Статья бюджета'] ?? 'Не указана').trim()
          const amount = parseNumber(row['Лимит'])
          serviceBudgetByType.set(serviceName, (serviceBudgetByType.get(serviceName) ?? 0) + amount)
        })

        const countBy = (rows: Array<Record<string, unknown>>, key: string): Record<string, number> => {
          return rows.reduce<Record<string, number>>((acc, row) => {
            const value = String(row[key] ?? 'не указано').trim() || 'не указано'
            acc[value] = (acc[value] ?? 0) + 1
            return acc
          }, {})
        }

        const normalizeStatus = (value: unknown): string => String(value ?? 'не указано').trim() || 'не указано'
        const contractStatusCounts = contractRows.reduce<Record<string, number>>((acc, row) => {
          const status = normalizeStatus(row['GN_contract_approval_status'] ?? row['GN_contract_state'])
          acc[status] = (acc[status] ?? 0) + 1
          return acc
        }, {})

        const agreementStatusCounts = agreementRows.reduce<Record<string, number>>((acc, row) => {
          const status = normalizeStatus(row['GN_additional_agreement_status'])
          acc[status] = (acc[status] ?? 0) + 1
          return acc
        }, {})

        const purchaseStatusCounts = investRows.reduce<Record<string, number>>((acc, row) => {
          const status = normalizeStatus(row['GN_invest_status'])
          acc[status] = (acc[status] ?? 0) + 1
          return acc
        }, {})

        if (!isMounted) return

        setSummary({
          serviceLines: bdrRows.length,
          serviceTypes: serviceBudgetByType.size,
          totalServiceBudget: Array.from(serviceBudgetByType.values()).reduce((sum, value) => sum + value, 0),
          contractCount: contractRows.length,
          contractStatusCounts,
          agreementCount: agreementRows.length,
          agreementStatusCounts,
          purchaseItems: investRows.length,
          purchaseQuantity: investRows.reduce((sum, row) => sum + parseNumber(row['GN_invest_quantity']), 0),
          purchaseStatusCounts,
          purchaseInBudget: investRows.filter((row) => String(row['GN_invest_in_budget'] ?? '').trim().toLowerCase() === 'да').length,
          topServices: Array.from(serviceBudgetByType.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, budget]) => ({ name, budget })),
        })
      } catch (err) {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : 'Не удалось загрузить данные')
      } finally {
        if (!isMounted) return
        setLoading(false)
      }
    }

    void loadSummary()
    return () => {
      isMounted = false
    }
  }, [])

  const formatCount = (value: number): string => new Intl.NumberFormat('ru-RU').format(value)
  const formatMoney = (value: number): string => new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value)

  if (loading) {
    return <p className="hint">Загрузка сводной информации...</p>
  }

  if (error || !summary) {
    return <p className="hint hint--error">Ошибка загрузки: {error ?? 'данные недоступны'}</p>
  }

  const usefulLinks = [
    { label: 'Диск на портале', href: 'http://portal.corp.nedra.gazprom.ru/company/personal/user/10705/disk/path/Отдел%20телекоммуникаций%20СИУСиС/' },
    { label: 'Файл Услуги связи', href: 'http://portal.corp.nedra.gazprom.ru/~XHH57' },
    { label: 'Redmine Отдел телекоммуникаций', href: 'https://appredmine.adm.ggr.gazprom.ru/projects/telecom/issues?per_page=50&query_id=30' },
    { label: 'Управление связи', href: 'https://ucn.adm.gazprom.ru/ucn/' },
    { label: 'Zabbix', href: 'https://monitoring.adm.ggr.gazprom.ru/zabbix/index.php' },
    { label: 'NetBox', href: 'https://netbox.esk.nedra.gazprom.ru/' },
  ]

  const renderStatusItems = (statusCounts: Record<string, number>) => (
    <ul className="dashboard-stat-list">
      {Object.entries(statusCounts).map(([status, count]) => (
        <li className="dashboard-stat-item" key={status}>
          <span>{status}</span>
          <strong>{formatCount(count)}</strong>
        </li>
      ))}
    </ul>
  )

  return (
    <section className="dashboard-section">
      <div className="dashboard-header">
        <div>
          <h2>Сводный дашбоард</h2>
          <p className="hint">Обзор ключевых метрик по услугам связи, договорам и закупкам оборудования.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <h3>Услуги связи</h3>
          <ul className="dashboard-stat-list">
            <li className="dashboard-stat-item">
              <span>Всего строк</span>
              <strong>{formatCount(summary.serviceLines)}</strong>
            </li>
            <li className="dashboard-stat-item">
              <span>Уникальных услуг</span>
              <strong>{formatCount(summary.serviceTypes)}</strong>
            </li>
            <li className="dashboard-stat-item">
              <span>Общий лимит</span>
              <strong>{formatMoney(summary.totalServiceBudget)}</strong>
            </li>
          </ul>
        </div>

        <div className="dashboard-card">
          <h3>Договоры</h3>
          <p className="dashboard-card-value">Всего: <strong>{formatCount(summary.contractCount)}</strong></p>
          {renderStatusItems(summary.contractStatusCounts)}
        </div>

        <div className="dashboard-card">
          <h3>Доп. соглашения</h3>
          <p className="dashboard-card-value">Всего: <strong>{formatCount(summary.agreementCount)}</strong></p>
          {renderStatusItems(summary.agreementStatusCounts)}
        </div>

        <div className="dashboard-card">
          <h3>Закупки оборудования</h3>
          <ul className="dashboard-stat-list">
            <li className="dashboard-stat-item">
              <span>Позиции</span>
              <strong>{formatCount(summary.purchaseItems)}</strong>
            </li>
            <li className="dashboard-stat-item">
              <span>Сумма единиц</span>
              <strong>{formatCount(summary.purchaseQuantity)}</strong>
            </li>
            <li className="dashboard-stat-item">
              <span>В бюджете</span>
              <strong>{formatCount(summary.purchaseInBudget)}</strong>
            </li>
          </ul>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <h3>Полезные ссылки</h3>
          <ul className="dashboard-links-list">
            {usefulLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="dashboard-card">
          <h3>Статусы закупок</h3>
          {renderStatusItems(summary.purchaseStatusCounts)}
        </div>

        <div className="dashboard-card">
          <h3>Топ услуг по бюджету</h3>
          <ul className="dashboard-compact-list">
            {summary.topServices.map((item) => (
              <li key={item.name}>
                <strong>{item.name}</strong> — {formatMoney(item.budget)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

export default function App() {
  const isAddRowPopup = window.location.hash === '#add-row-window'
  const limitPopupMatch = window.location.hash.match(/^#limit-window-(\d+)$/)
  const limitPopupRowId = limitPopupMatch ? Number(limitPopupMatch[1]) : null
  const isLimitPopup = limitPopupRowId != null && !Number.isNaN(limitPopupRowId)
  const contractPopupMatch = window.location.hash.match(/^#contract-window-(.+)$/)
  const contractPopupName = contractPopupMatch ? decodeURIComponent(contractPopupMatch[1]) : null
  const isContractPopup = contractPopupName != null && contractPopupName !== ''
  const objectPopupMatch = window.location.hash.match(/^#object-window-(\d+)$/)
  const objectPopupRowId = objectPopupMatch ? Number(objectPopupMatch[1]) : null
  const isObjectPopup = objectPopupRowId != null && !Number.isNaN(objectPopupRowId)
  const departmentPopupMatch = window.location.hash.match(/^#department-window-(\d+)$/)
  const departmentPopupRowId = departmentPopupMatch ? Number(departmentPopupMatch[1]) : null
  const isDepartmentPopup = departmentPopupRowId != null && !Number.isNaN(departmentPopupRowId)
  const contractorPopupMatch = window.location.hash.match(/^#contractor-window-(\d+)$/)
  const contractorPopupRowId = contractorPopupMatch ? Number(contractorPopupMatch[1]) : null
  const isContractorPopup = contractorPopupRowId != null && !Number.isNaN(contractorPopupRowId)
  const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash))

  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === '#add-row-window') return
      if (/^#limit-window-\d+$/.test(window.location.hash)) return
      if (/^#contract-window-.+$/.test(window.location.hash)) return
      if (/^#object-window-\d+$/.test(window.location.hash)) return
      if (/^#department-window-\d+$/.test(window.location.hash)) return
      if (/^#contractor-window-\d+$/.test(window.location.hash)) return
      setPage(pageFromHash(window.location.hash))
    }

    window.addEventListener('hashchange', onHashChange)

    if (!window.location.hash && !isAddRowPopup && !isLimitPopup && !isContractPopup) {
      window.location.hash = '#start'
    }

    return () => window.removeEventListener('hashchange', onHashChange)
  }, [isAddRowPopup, isLimitPopup, isContractPopup])

  // Переключает активную страницу приложения, обновляя хэш URL.
  function goTo(nextPage: Page): void {
    if (nextPage === 'start') {
      window.location.hash = '#start'
      return
    }
    if (nextPage === 'contracts') {
      window.location.hash = '#contracts'
      return
    }
    if (nextPage === 'invest-program-table') {
      window.location.hash = '#invest-program-table'
      return
    }
    if (nextPage === 'guide') {
      window.location.hash = '#guide'
      return
    }
    window.location.hash = '#budget'
  }

  // Открывает отдельное окно для создания новой строки бюджета.
  function openAddRowWindow(): void {
    const popupUrl = `${window.location.pathname}#add-row-window`
    const popup = window.open(
      popupUrl,
      'add-row-window',
      'popup=yes,width=980,height=900,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  // Открывает окно детальной страницы расчета лимита для выбранной строки.
  function openLimitWindow(rowId: number): void {
    const popupUrl = `${window.location.pathname}#limit-window-${rowId}`
    const popup = window.open(
      popupUrl,
      `limit-window-${rowId}`,
      'popup=yes,width=900,height=760,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  // Открывает окно просмотра деталей по договору, передавая его имя через хэш.
  function openContractWindow(contractName: string): void {
    const encodedName = encodeURIComponent(contractName)
    const popupUrl = `${window.location.pathname}#contract-window-${encodedName}`
    const popup = window.open(
      popupUrl,
      `contract-window-${encodedName}`,
      'popup=yes,width=900,height=700,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  // Открывает окно просмотра информации по объекту, передавая идентификатор строки.
  function openObjectWindow(rowId: number): void {
    const popupUrl = `${window.location.pathname}#object-window-${rowId}`
    const popup = window.open(
      popupUrl,
      `object-window-${rowId}`,
      'popup=yes,width=900,height=700,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  // Открывает окно просмотра информации по подразделению, передавая идентификатор строки.
  function openDepartmentWindow(rowId: number): void {
    const popupUrl = `${window.location.pathname}#department-window-${rowId}`
    const popup = window.open(
      popupUrl,
      `department-window-${rowId}`,
      'popup=yes,width=900,height=700,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  // Открывает окно просмотра информации по контрагенту, передавая идентификатор строки.
  function openContractorWindow(rowId: number): void {
    const popupUrl = `${window.location.pathname}#contractor-window-${rowId}`
    const popup = window.open(
      popupUrl,
      `contractor-window-${rowId}`,
      'popup=yes,width=900,height=700,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  if (isAddRowPopup) {
    return (
      <main>
        <AddBudgetRowPage onBack={() => window.close()} showFormOnLoad={true} />
      </main>
    )
  }

  if (isLimitPopup && limitPopupRowId != null) {
    return (
      <main>
        <LimitDetailsPage rowId={limitPopupRowId} onBack={() => window.close()} />
      </main>
    )
  }

  if (isContractPopup && contractPopupName) {
    return (
      <main>
        <ContractDetailsPage contractName={contractPopupName} onBack={() => window.close()} />
      </main>
    )
  }

  if (isObjectPopup && objectPopupRowId != null) {
    return (
      <main>
        <ObjectDetailsPage rowId={objectPopupRowId} onBack={() => window.close()} />
      </main>
    )
  }

  if (isDepartmentPopup && departmentPopupRowId != null) {
    return (
      <main>
        <DepartmentDetailsPage rowId={departmentPopupRowId} onBack={() => window.close()} />
      </main>
    )
  }

  if (isContractorPopup && contractorPopupRowId != null) {
    return (
      <main>
        <ContractorDetailsPage rowId={contractorPopupRowId} onBack={() => window.close()} />
      </main>
    )
  }

  return (
    <main>
      <nav className="app-nav">
        <div className="app-nav-center">
          <a href="#start" onClick={(event) => { event.preventDefault(); goTo('start') }}>
            Начало
          </a>
          <a href="#budget" onClick={(event) => { event.preventDefault(); goTo('budget') }}>
            Услуги_связи
          </a>
          <a href="#contracts" onClick={(event) => { event.preventDefault(); goTo('contracts') }}>
            Карта_договоров
          </a>
          <a href="#invest-program-table" onClick={(event) => { event.preventDefault(); goTo('invest-program-table') }}>
            Закупки
          </a>
        </div>
        <div className="app-nav-guide">
          <a href="#guide" onClick={(event) => { event.preventDefault(); goTo('guide') }}>
            Справочник
          </a>
        </div>
      </nav>

      {page === 'guide' && <Guide />}
      {page === 'start' && (
        <div className="page-start-wrapper">
     
          <StartDashboard />
         
        </div>
      )}
      {page === 'budget' && (
        <div>
          <BudgetTable
            onAddRow={openAddRowWindow}
            onOpenLimit={openLimitWindow}
            onOpenContract={openContractWindow}
            onOpenObject={openObjectWindow}
            onOpenDepartment={openDepartmentWindow}
            onOpenContractor={openContractorWindow}
            showMainTable
          />
        </div>
      )}
      {page === 'contracts' && <ContractsPage onOpenContract={openContractWindow} />}
      {page === 'invest-program-table' && <InvestProgramTablePage />}
    </main>
  )
}
