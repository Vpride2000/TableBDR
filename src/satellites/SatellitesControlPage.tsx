import { useEffect, useState } from 'react'

interface Satellite {
  GN_satellite_id: number
  GN_satellite_mac: string
  GN_satellite_direction_name: string
  GN_Dep_id: number | null
  GN_department: string | null
}

interface SatellitesControlPageProps {
  onBack?: () => void
}

export default function SatellitesControlPage({ onBack }: SatellitesControlPageProps) {
  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    async function loadData(): Promise<void> {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/satellites')
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json() as { satellites: Satellite[] }
        if (!isActive) return
        setSatellites(data.satellites)
      } catch (err) {
        if (!isActive) return
        const message = err instanceof Error ? err.message : 'Не удалось загрузить данные'
        setError(message)
      } finally {
        if (!isActive) return
        setLoading(false)
      }
    }

    void loadData()

    return () => {
      isActive = false
    }
  }, [])

  return (
    <section className="page-section satellites-section">
      <div className="page-header satellites-page-header">
        <div>
          <h1>Спутники: Контроль</h1>
          <p className="hint">Управление спутниковыми направлениями и подразделениями</p>
        </div>
        {onBack && (
          <button className="page-action-btn page-action-btn--secondary" onClick={onBack} type="button">
            Назад в Спутники
          </button>
        )}
      </div>

      <div className="page-content satellites-content">
        {loading && <p className="hint">Загрузка данных...</p>}
        {!loading && error && <p className="hint hint--error">Ошибка: {error}</p>}

        {!loading && !error && satellites.length > 0 && (
          <div className="satellites-table-card">
            <h3 className="satellites-subtitle">Спутниковые услуги</h3>
            <p className="hint">Найдено направлений: <strong>{satellites.length}</strong></p>
            <table className="guide-table table-compact satellites-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>MAC адрес</th>
                  <th>Имя направления</th>
                  <th>Подразделение</th>
                </tr>
              </thead>
              <tbody>
                {satellites.map((sat, index) => (
                  <tr key={sat.GN_satellite_id}>
                    <td>{index + 1}</td>
                    <td>{sat.GN_satellite_mac}</td>
                    <td>{sat.GN_satellite_direction_name}</td>
                    <td>{sat.GN_department || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && satellites.length === 0 && (
          <p className="hint">Данные о спутниковых услугах отсутствуют</p>
        )}
      </div>
    </section>
  )
}

