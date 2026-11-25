import { useState, useEffect } from 'react'
import BudgetTable from './budget/BudgetTable'
import BudgetSummaryPopup from './budget/BudgetSummaryPopup'
import Guide from './Guide'
import AddBudgetRowPage from './budget/AddBudgetRowPage'
import LimitDetailsPage from './budget/LimitDetailsPage'
import ObjectDetailsPage from './budget/ObjectDetailsPage'
import DepartmentDetailsPage from './budget/DepartmentDetailsPage'
import ContractorDetailsPage from './budget/ContractorDetailsPage'
import ContractDetailsPage from './contract/ContractDetailsPage'
import ContractsPage from './contract/ContractsPage'
import EquipmentOrderPopup from './Purchase/EquipmentOrderPopup'
import SatellitesPage from './satellites/SatellitesPage'
import SatellitesControlPage from './satellites/SatellitesControlPage'
import SatellitesDetailsPage from './satellites/SatellitesDetailsPage'
import CellularPage from './cellular/CellularPage'
import CellularTariffGuidePopup from './cellular/CellularTariffGuidePopup'
import CellularIdentifierGuidePopup from './cellular/CellularIdentifierGuidePopup'
import CellularAccountGuidePopup from './cellular/CellularAccountGuidePopup'
import ImportSubstitutionPage from './importSubstitution/ImportSubstitutionPage'
import ImportSubstitutionTable from './importSubstitution/ImportSubstitutionTable'
import EquipmentAccountingTable from './importSubstitution/EquipmentAccountingTable'
import PostgresSchemaPopup from './components/PostgresSchemaPopup'
import PersonalAccountPage from './components/PersonalAccountPage'
import NotesPage from './notes/NotesPage'
import PrimaryPage from './PrimaryPage'
import PrimaryAccountDetailsPage from './PrimaryAccountDetailsPage'
import StartDashboard from './StartDashboard'
import BudgetSectionPage from './budget/BudgetSectionPage'

type Page = 'start' | 'budget' | 'guide' | 'contracts' | 'satellites' | 'satellites-control' | 'cellular' | 'import-substitution' | 'notes' | 'personal-account' | 'primary'

function pageFromHash(hash: string): Page {
  if (hash === '#start') return 'start'
  if (
    hash === '#invest-program-table'
    || hash === '#equipment-purchases'
    || hash === '#equipment-accounting'
  ) return 'import-substitution'
  if (hash === '#notes') return 'notes'
  if (hash === '#primary') return 'primary'
  if (hash === '#contracts') return 'contracts'
  if (hash === '#satellites') return 'satellites'
  if (hash === '#satellites-control') return 'satellites-control'
  if (hash === '#personal-account') return 'personal-account'
  if (hash === '#cellular') return 'cellular'
  if (hash === '#import-substitution') return 'import-substitution'
  if (hash === '#guide') return 'guide'
  return 'budget'
}

/*
  Основная точка входа клиентской части приложения.
  Отвечает за маршрутизацию между страницами по хэшу,
  отображение попапов и навигацию между разделами.
*/

export default function App() {
  const isAddRowPopup = window.location.hash === '#add-row-window'
  const isSatellitesDetailsPopup = window.location.hash === '#satellites-window'
  const isBudgetDeptPopup = window.location.hash === '#budget-dept-window'
  const isBudgetMainPopup = window.location.hash === '#budget-main-window'
  const isCellularTariffGuidePopup = window.location.hash === '#cellular-tariff-guide-window'
  const isCellularIdentifierGuidePopup = window.location.hash === '#cellular-identifier-guide-window'
  const isCellularAccountGuidePopup = window.location.hash === '#cellular-account-guide-window'
  const isImportSubstitutionTablePopup = window.location.hash === '#import-substitution-table-window'
  const isEquipmentAccountingPopup = window.location.hash === '#equipment-accounting-window'
  const isMseAccountingPopup = window.location.hash === '#mse-accounting-window'
  const isEquipmentOrderPopup = window.location.hash === '#equipment-order-window'
  const guidePopupMatch = window.location.hash.match(/^#guide-window-([a-z-]+)$/)
  const guidePopupEntity = guidePopupMatch ? guidePopupMatch[1] : null
  const isGuidePopup = guidePopupEntity != null
  const limitPopupMatch = window.location.hash.match(/^#limit-window-(\d+)$/)
  const limitPopupRowId = limitPopupMatch ? Number(limitPopupMatch[1]) : null
  const isLimitPopup = limitPopupRowId != null && !Number.isNaN(limitPopupRowId)
  const contractPopupMatch = window.location.hash.match(/^#contract-window-(\d+)$/)
  const contractPopupId = contractPopupMatch ? Number(contractPopupMatch[1]) : null
  const isContractPopup = contractPopupId != null && !Number.isNaN(contractPopupId)
  const primaryAccountPopupMatch = window.location.hash.match(/^#primary-account-window-(\d+)$/)
  const primaryAccountPopupRowId = primaryAccountPopupMatch ? Number(primaryAccountPopupMatch[1]) : null
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
      if (window.location.hash === '#satellites-window') return
      if (window.location.hash === '#budget-dept-window') return
      if (window.location.hash === '#budget-main-window') return
      if (window.location.hash === '#cellular-tariff-guide-window') return
      if (window.location.hash === '#cellular-identifier-guide-window') return
      if (window.location.hash === '#cellular-account-guide-window') return
      if (window.location.hash === '#import-substitution-table-window') return
      if (window.location.hash === '#equipment-accounting-window') return
      if (window.location.hash === '#mse-accounting-window') return
      if (window.location.hash === '#equipment-order-window') return
      if (/^#guide-window-[a-z-]+$/.test(window.location.hash)) return
      if (/^#limit-window-\d+$/.test(window.location.hash)) return
      if (/^#contract-window-.+$/.test(window.location.hash)) return
      if (/^#primary-account-window-\d+$/.test(window.location.hash)) return
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
    if (nextPage === 'notes') {
      window.location.hash = '#notes'
      return
    }
    if (nextPage === 'primary') {
      window.location.hash = '#primary'
      return
    }
    if (nextPage === 'personal-account') {
      window.location.hash = '#personal-account'
      return
    }
    if (nextPage === 'satellites') {
      window.location.hash = '#satellites'
      return
    }
    if (nextPage === 'satellites-control') {
      window.location.hash = '#satellites-control'
      return
    }
    if (nextPage === 'cellular') {
      window.location.hash = '#cellular'
      return
    }
    if (nextPage === 'import-substitution') {
      window.location.hash = '#import-substitution'
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

  // Открывает подраздел "Детализация" (спутники) в отдельном окне.
  function openSatellitesDetailsWindow(): void {
    const popupUrl = `${window.location.pathname}#satellites-window`
    const popup = window.open(
      popupUrl,
      'satellites-details-window',
      'popup=yes,width=1300,height=850,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  // Открывает окно просмотра деталей по договору, передавая его ID через хэш.
  function openContractWindow(contractId: number): void {
    const popupUrl = `${window.location.pathname}#contract-window-${contractId}`
    const popup = window.open(
      popupUrl,
      `contract-window-${contractId}`,
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

  // Открывает попап-окно сводной таблицы по подразделениям.
  function openBudgetDeptWindow(): void {
    const popup = window.open(
      `${window.location.pathname}#budget-dept-window`,
      'budget-dept-window',
      'popup=yes,width=900,height=800,resizable=yes,scrollbars=yes'
    )
    if (popup) popup.focus()
  }

  // Открывает попап-окно основной таблицы лимитов.
  function openBudgetMainWindow(): void {
    const popup = window.open(
      `${window.location.pathname}#budget-main-window`,
      'budget-main-window',
      'popup=yes,width=1400,height=900,resizable=yes,scrollbars=yes'
    )
    if (popup) popup.focus()
  }

  if (isBudgetDeptPopup) {
    return (
      <main>
        <BudgetSummaryPopup />
      </main>
    )
  }

  if (isBudgetMainPopup) {
    return (
      <main>
        <h2 className="budget-popup-title">БДР Услуги связи</h2>
        <BudgetTable
          onAddRow={openAddRowWindow}
          onOpenContract={openContractWindow}
          onOpenObject={openObjectWindow}
          onOpenDepartment={openDepartmentWindow}
          onOpenContractor={openContractorWindow}
          showMainTable
        />
      </main>
    )
  }

  if (isAddRowPopup) {
    return (
      <main>
        <AddBudgetRowPage onBack={() => window.close()} showFormOnLoad={true} />
      </main>
    )
  }

  if (isSatellitesDetailsPopup) {
    return (
      <main>
        <SatellitesDetailsPage />
      </main>
    )
  }

  if (isCellularTariffGuidePopup) {
    return (
      <main>
        <CellularTariffGuidePopup />
      </main>
    )
  }

  if (isCellularIdentifierGuidePopup) {
    return (
      <main>
        <CellularIdentifierGuidePopup />
      </main>
    )
  }

  if (isCellularAccountGuidePopup) {
    return (
      <main>
        <CellularAccountGuidePopup />
      </main>
    )
  }

  if (isImportSubstitutionTablePopup) {
    return (
      <main>
        <div className="page-header">
          <h3>Данные ИС ПРИТ</h3>
        </div>
        <ImportSubstitutionTable />
      </main>
    )
  }

  if (isEquipmentAccountingPopup) {
    return <EquipmentAccountingTable />
  }

  if (isMseAccountingPopup) {
    return <EquipmentAccountingTable requiredType="МСЭ" />
  }

  if (isEquipmentOrderPopup) {
    return (
      <main>
        <EquipmentOrderPopup />
      </main>
    )
  }

  if (isGuidePopup && guidePopupEntity === 'postgres-schema') {
    return <PostgresSchemaPopup />
  }

  if (isGuidePopup && guidePopupEntity) {
    return (
      <main>
        <Guide onlyEntities={[guidePopupEntity]} initialExpandedEntities={[guidePopupEntity]} />
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

  if (isContractPopup && contractPopupId) {
    return (
      <main>
        <ContractDetailsPage contractId={contractPopupId} />
      </main>
    )
  }

  if (primaryAccountPopupRowId != null) {
    return <PrimaryAccountDetailsPage rowId={primaryAccountPopupRowId} />
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

  const isStandaloneSatellitesControl = page === 'satellites-control'

  if (isStandaloneSatellitesControl) {
    return (
      <main>
        <SatellitesControlPage />
      </main>
    )
  }

  return (
    <main>
      <nav className="app-nav">
        <div className="app-nav-personal">
          <a href="#personal-account" onClick={(event) => { event.preventDefault(); goTo('personal-account') }}>
            ЛК
          </a>
        </div>
        <div className="app-nav-center">
          <a href="#start" onClick={(event) => { event.preventDefault(); goTo('start') }}>
            Начало
          </a>
          <a href="#budget" onClick={(event) => { event.preventDefault(); goTo('budget') }}>
            Услуги_связи
          </a>
          <a href="#contracts" onClick={(event) => { event.preventDefault(); goTo('contracts') }}>
            Договора
          </a>
          <a href="#primary" onClick={(event) => { event.preventDefault(); goTo('primary') }}>
            Первичные
          </a>
          <a href="#notes" onClick={(event) => { event.preventDefault(); goTo('notes') }}>
            Заметки
          </a>
          <a href="#satellites" onClick={(event) => { event.preventDefault(); goTo('satellites') }}>
            Спутники
          </a>
          <a href="#cellular" onClick={(event) => { event.preventDefault(); goTo('cellular') }}>
            Сотовая
          </a>
          <a href="#import-substitution" onClick={(event) => { event.preventDefault(); goTo('import-substitution') }}>
            Оборудование
          </a>
        </div>        
        <div className="app-nav-guide">
          <a href="#guide" onClick={(event) => { event.preventDefault(); goTo('guide') }}>
            Справочник
          </a>
        </div>
      </nav>

      {page === 'guide' && <Guide directoryView />}
      {page === 'start' && (
        <div className="page-start-wrapper">
     
          <StartDashboard />
         
        </div>
      )}
      {page === 'cellular' && <CellularPage />}
      {page === 'import-substitution' && <ImportSubstitutionPage />}
      {page === 'budget' && (
        <BudgetSectionPage
          onOpenBudgetDept={openBudgetDeptWindow}
          onOpenBudgetMain={openBudgetMainWindow}
          onOpenSatellitesDetails={openSatellitesDetailsWindow}
        />
      )}
      {page === 'satellites' && <SatellitesPage />}
      {page === 'contracts' && <ContractsPage onOpenContract={openContractWindow} />}
      {page === 'notes' && <NotesPage />}
      {page === 'personal-account' && <PersonalAccountPage />}
      {page === 'primary' && <PrimaryPage onOpenContract={openContractWindow} />}
    </main>
  )
}
