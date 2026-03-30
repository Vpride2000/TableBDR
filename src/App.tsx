import { useEffect, useState } from 'react'
import BudgetTable from './BudgetTable'
import Guide from './Guide'
import AddBudgetRowPage from './AddBudgetRowPage'
import LimitDetailsPage from './LimitDetailsPage'
import ContractDetailsPage from './ContractDetailsPage'
import './styles.css'

type Page = 'budget' | 'guide'

function pageFromHash(hash: string): Page {
  if (hash === '#guide') return 'guide'
  return 'budget'
}

export default function App() {
  const isAddRowPopup = window.location.hash === '#add-row-window'
  const limitPopupMatch = window.location.hash.match(/^#limit-window-(\d+)$/)
  const limitPopupRowId = limitPopupMatch ? Number(limitPopupMatch[1]) : null
  const isLimitPopup = limitPopupRowId != null && !Number.isNaN(limitPopupRowId)
  const contractPopupMatch = window.location.hash.match(/^#contract-window-(.+)$/)
  const contractPopupName = contractPopupMatch ? decodeURIComponent(contractPopupMatch[1]) : null
  const isContractPopup = contractPopupName != null && contractPopupName !== ''
  const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash))

  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === '#add-row-window') return
      if (/^#limit-window-\d+$/.test(window.location.hash)) return
      if (/^#contract-window-.+$/.test(window.location.hash)) return
      setPage(pageFromHash(window.location.hash))
    }
    window.addEventListener('hashchange', onHashChange)

    if (!window.location.hash && !isAddRowPopup && !isLimitPopup && !isContractPopup) {
      window.location.hash = '#budget'
    }

    return () => window.removeEventListener('hashchange', onHashChange)
  }, [isAddRowPopup, isLimitPopup, isContractPopup])

  function goTo(nextPage: Page): void {
    if (nextPage === 'guide') {
      window.location.hash = '#guide'
      return
    }
    window.location.hash = '#budget'
  }

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

  if (isContractPopup && contractPopupName != null) {
    return (
      <main>
        <ContractDetailsPage contractName={contractPopupName} onBack={() => window.close()} />
      </main>
    )
  }

  return (
    <main>
      <nav className="app-nav">
        <a
          href="#guide"
          onClick={() => goTo('guide')}
        >
          Справочник
        </a>
        <a
          href="#budget"
          onClick={() => goTo('budget')}
        >
          Бюджет услуг связи
        </a>
      </nav>

      {page === 'guide' && <Guide />}
      {page === 'budget' && <BudgetTable onAddRow={openAddRowWindow} onOpenLimit={openLimitWindow} onOpenContract={openContractWindow} />}
    </main>
  )
}
