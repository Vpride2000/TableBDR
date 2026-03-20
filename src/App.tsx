import { useState } from 'react'
import BudgetTable from './BudgetTable'
import Guide from './Guide'
import './styles.css'

type Page = 'budget' | 'guide'

export default function App() {
  const [page, setPage] = useState<Page>('budget')

  return (
    <main>
      <nav className="app-nav">
        <a
          href="#guide"
          onClick={(e) => {
            e.preventDefault()
            setPage('guide')
          }}
        >
          Справочник
        </a>
        <a
          href="#budget"
          onClick={(e) => {
            e.preventDefault()
            setPage('budget')
          }}
        >
          Таблица
        </a>
      </nav>

      {page === 'guide' ? <Guide /> : <BudgetTable />}
    </main>
  )
}
