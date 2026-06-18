import { useEffect, useState } from 'react'
import { formatHttpError } from '../utils/forecastUtils'

type Row = Record<string, unknown>
type SummaryCounts = Record<string, number>

interface ContractorDetailsPageProps {
  rowId: number
  onBack: () => void
}

function buildSummary(rows: Row[], key: string): SummaryCounts {
  return rows.reduce<SummaryCounts>((acc, row) => {
    const value = String(row[key] ?? '').trim()
    if (!value) return acc
    acc[value] = (acc[value] ?? 0) + 1
    return acc
  }, {})
}

export default function ContractorDetailsPage({ rowId, onBack }: ContractorDetailsPageProps) {
  const [name, setName] = useState<string>('')
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<{
    objects: SummaryCounts
    contracts: SummaryCounts
    budgetItems: SummaryCounts
    paoBudgetItems: SummaryCounts
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadSummary(): Promise<void> {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/gn/bdr')
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error || formatHttpError(response.status))
        }

        const allRows = (await response.json()) as Row[]
        const currentRow = allRows.find((row) => Number(row['GN_bdr_ID']) === rowId)
        if (!currentRow) throw new Error('Строка не найдена')

        const contractorValue = String(currentRow['Контрагент'] ?? '').trim()
        if (!contractorValue) throw new Error('У строки не задан Контрагент')

        const filteredRows = allRows.filter((row) => String(row['Контрагент'] ?? '').trim() === contractorValue)

        setName(contractorValue)
        setRows(filteredRows)
        setSummary({
          objects: buildSummary(filteredRows, 'Объект'),
          contracts: buildSummary(filteredRows, 'Договор'),
          budgetItems: buildSummary(filteredRows, 'Статья бюджета'),
          paoBudgetItems: buildSummary(filteredRows, 'Статья бюджета УС'),
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить данные')
      } finally {
        setLoading(false)
      }
    }

    void loadSummary()
  }, [rowId])

  return (
    <section className="budget add-row-page object-details-page">
      <h2>Информация по контрагенту</h2>
      {loading && <p className="hint">Загрузка данных...</p>}
      {error && <p className="hint hint--error">Ошибка: {error}</p>}
      {!loading && !error && summary && (
        <div className="contract-details">
          <div><strong>Контрагент:</strong> {name}</div>
          <div><strong>Строк в таблице:</strong> {rows.length}</div>

          <section className="object-summary-section">
            <h3>Объекты</h3>
            {Object.keys(summary.objects).length > 0 ? (
              <table className="guide-table table-compact object-summary-table">
                <thead><tr><th>Объект</th><th>Строк</th></tr></thead>
                <tbody>
                  {Object.entries(summary.objects).map(([name, count]) => (
                    <tr key={name}><td>{name}</td><td>{count}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="hint">Объекты не найдены</p>}
          </section>

          <section className="object-summary-section">
            <h3>Договоры</h3>
            {Object.keys(summary.contracts).length > 0 ? (
              <table className="guide-table table-compact object-summary-table">
                <thead><tr><th>Договор</th><th>Строк</th></tr></thead>
                <tbody>
                  {Object.entries(summary.contracts).map(([name, count]) => (
                    <tr key={name}><td>{name}</td><td>{count}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="hint">Договоры не найдены</p>}
          </section>

          <section className="object-summary-section">
            <h3>Статьи бюджета</h3>
            {Object.keys(summary.budgetItems).length > 0 ? (
              <table className="guide-table table-compact object-summary-table">
                <thead><tr><th>Статья бюджета</th><th>Строк</th></tr></thead>
                <tbody>
                  {Object.entries(summary.budgetItems).map(([name, count]) => (
                    <tr key={name}><td>{name}</td><td>{count}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="hint">Статьи бюджета не найдены</p>}
          </section>

          <section className="object-summary-section">
            <h3>Статьи бюджета УС</h3>
            {Object.keys(summary.paoBudgetItems).length > 0 ? (
              <table className="guide-table table-compact object-summary-table">
                <thead><tr><th>Статья бюджета УС</th><th>Строк</th></tr></thead>
                <tbody>
                  {Object.entries(summary.paoBudgetItems).map(([name, count]) => (
                    <tr key={name}><td>{name}</td><td>{count}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="hint">Статьи бюджета УС не найдены</p>}
          </section>
        </div>
      )}
      <div className="budget-actions limit-details-actions">
        <button type="button" className="page-action-btn page-action-btn--secondary" onClick={onBack}>Назад</button>
      </div>
    </section>
  )
}
