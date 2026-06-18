import { useEffect, useState } from 'react'
import { formatHttpError } from '../utils/forecastUtils'

type Row = Record<string, unknown>

type SummaryCounts = Record<string, number>

interface ObjectDetailsPageProps {
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

export default function ObjectDetailsPage({ rowId, onBack }: ObjectDetailsPageProps) {
  const [objectName, setObjectName] = useState<string>('')
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<{
    contractors: SummaryCounts
    contracts: SummaryCounts
    budgetItems: SummaryCounts
    paoBudgetItems: SummaryCounts
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadObjectSummary(): Promise<void> {
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
        if (!currentRow) {
          throw new Error('Строка с указанным объектом не найдена')
        }

        const objectValue = String(currentRow['Объект'] ?? '').trim()
        if (!objectValue) {
          throw new Error('У выбранной строки не задан объект')
        }

        const filteredRows = allRows.filter(
          (row) => String(row['Объект'] ?? '').trim() === objectValue
        )

        setObjectName(objectValue)
        setRows(filteredRows)
        setSummary({
          contractors: buildSummary(filteredRows, 'Контрагент'),
          contracts: buildSummary(filteredRows, 'Договор'),
          budgetItems: buildSummary(filteredRows, 'Статья бюджета'),
          paoBudgetItems: buildSummary(filteredRows, 'Статья бюджета УС'),
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить данные объекта')
      } finally {
        setLoading(false)
      }
    }

    void loadObjectSummary()
  }, [rowId])

  return (
    <section className="budget add-row-page object-details-page">
      <h2>Информация по объекту</h2>
      {loading && <p className="hint">Загрузка данных...</p>}
      {error && <p className="hint hint--error">Ошибка: {error}</p>}
      {!loading && !error && summary && (
        <div className="contract-details">
          <div><strong>Объект:</strong> {objectName}</div>
          <div><strong>Строк в таблице:</strong> {rows.length}</div>

          <section className="object-summary-section">
            <h3>Контрагенты</h3>
            {Object.keys(summary.contractors).length > 0 ? (
              <table className="guide-table table-compact object-summary-table">
                <thead>
                  <tr>
                    <th>Контрагент</th>
                    <th>Строк</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.contractors).map(([name, count]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="hint">Контрагенты не найдены</p>
            )}
          </section>

          <section className="object-summary-section">
            <h3>Договоры</h3>
            {Object.keys(summary.contracts).length > 0 ? (
              <table className="guide-table table-compact object-summary-table">
                <thead>
                  <tr>
                    <th>Договор</th>
                    <th>Строк</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.contracts).map(([name, count]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="hint">Договоры не найдены</p>
            )}
          </section>

          <section className="object-summary-section">
            <h3>Статьи бюджета</h3>
            {Object.keys(summary.budgetItems).length > 0 ? (
              <table className="guide-table table-compact object-summary-table">
                <thead>
                  <tr>
                    <th>Статья бюджета</th>
                    <th>Строк</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.budgetItems).map(([name, count]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="hint">Статьи бюджета не найдены</p>
            )}
          </section>

          <section className="object-summary-section">
            <h3>Статьи бюджета УС</h3>
            {Object.keys(summary.paoBudgetItems).length > 0 ? (
              <table className="guide-table table-compact object-summary-table">
                <thead>
                  <tr>
                    <th>Статья бюджета УС</th>
                    <th>Строк</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.paoBudgetItems).map(([name, count]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="hint">Статьи бюджета УС не найдены</p>
            )}
          </section>
        </div>
      )}
      <div className="budget-actions limit-details-actions">
        <button type="button" className="page-action-btn page-action-btn--secondary" onClick={onBack}>
          Назад
        </button>
      </div>
    </section>
  )
}
