import { useEffect, useMemo, useRef, useState } from 'react'
import { aggregateSatelliteRowsByMac, parseSatelliteRowsFromBuffer, type SatelliteRow } from './satelliteXml'

interface Satellite {
  GN_satellite_id: number
  GN_satellite_mac: string
  GN_satellite_direction_name: string
  GN_Dep_id: number | null
  GN_department: string | null
}

interface DepartmentOption {
  GN_Dep_id: number
  GN_department: string
}

type SatelliteMonthStatus = 'сломан' | 'склад' | 'в работе' | 'отключен' | 'ошибка'

const SATELLITE_MONTH_STATUSES: SatelliteMonthStatus[] = ['сломан', 'склад', 'в работе', 'отключен', 'ошибка']

export default function SatellitesControlPage() {
  const initialAuthUser = sessionStorage.getItem('satellites-control-user')
  const initialAuthToken = sessionStorage.getItem('satellites-control-token')

  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [username, setUsername] = useState('ADM')
  const [password, setPassword] = useState('')
  const [authUser, setAuthUser] = useState<string | null>(() => (initialAuthUser && initialAuthToken ? initialAuthUser : null))
  const [authToken, setAuthToken] = useState<string | null>(() => (initialAuthUser && initialAuthToken ? initialAuthToken : null))
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [xmlRowsByMacMonth, setXmlRowsByMacMonth] = useState<Record<string, Record<string, { branch: string; tariff: string; status: SatelliteMonthStatus; amount: number }>>>({})
  const [months, setMonths] = useState<string[]>([])
  const [xmlRowsCount, setXmlRowsCount] = useState(0)
  const [xmlMatchedCount, setXmlMatchedCount] = useState(0)
  const [uploadingXml, setUploadingXml] = useState(false)
  const [clearingMonth, setClearingMonth] = useState<string | null>(null)
  const [editingSatelliteId, setEditingSatelliteId] = useState<number | null>(null)
  const [draftSatellite, setDraftSatellite] = useState<{ mac: string; directionName: string; departmentId: number | null } | null>(null)
  const [savingRowEdit, setSavingRowEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const moneyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    []
  )

  function normalizeMacKey(value: string): string {
    return (value ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  }

  function parseAmount(value: string | number): number {
    const normalized = String(value ?? '').replace(/\s+/g, '').replace(',', '.')
    const numeric = Number(normalized)
    return Number.isFinite(numeric) ? numeric : 0
  }

  function normalizeStatus(value: string | null | undefined): SatelliteMonthStatus {
    const normalized = String(value ?? '').trim().toLowerCase() as SatelliteMonthStatus
    return SATELLITE_MONTH_STATUSES.includes(normalized) ? normalized : 'склад'
  }

  function buildXmlMatrix(rows: Array<{ mac_norm: string; month_name: string; branch: string | null; tariff: string | null; status: string | null; amount_without_vat: string | number }>): {
    matrix: Record<string, Record<string, { branch: string; tariff: string; status: SatelliteMonthStatus; amount: number }>>
    monthList: string[]
  } {
    const monthSet = new Set<string>()
    const matrix: Record<string, Record<string, { branch: string; tariff: string; status: SatelliteMonthStatus; amount: number }>> = {}

    rows.forEach((row) => {
      const mac = String(row.mac_norm ?? '').trim()
      const month = String(row.month_name ?? '').trim()
      if (!mac || !month) return
      monthSet.add(month)
      if (!matrix[mac]) matrix[mac] = {}
      matrix[mac][month] = {
        branch: String(row.branch ?? '').trim(),
        tariff: String(row.tariff ?? '').trim(),
        status: normalizeStatus(row.status),
        amount: parseAmount(row.amount_without_vat),
      }
    })

    return {
      matrix,
      monthList: [...monthSet],
    }
  }

  async function loadXmlMonthly(): Promise<void> {
    if (!authToken) return

    const response = await fetch('/api/satellites/xml-monthly', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    if (response.status === 401) {
      handleLogout()
      setAuthError('Сессия истекла. Войдите снова.')
      return
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const payload = (await response.json()) as {
      rows: Array<{
        mac_norm: string
        month_name: string
        branch: string | null
        tariff: string | null
        status: string | null
        amount_without_vat: string | number
      }>
    }

    const { matrix, monthList } = buildXmlMatrix(payload.rows)
    setXmlRowsByMacMonth(matrix)
    setMonths(monthList)
    setXmlRowsCount(payload.rows.length)
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e): Promise<void> => {
      try {
        const buffer = e.target?.result
        if (!(buffer instanceof ArrayBuffer)) throw new Error('Некорректный формат файла')

        const parsedRows = aggregateSatelliteRowsByMac(parseSatelliteRowsFromBuffer(buffer))
        setUploadingXml(true)

        const saveResponse = await fetch('/api/satellites/xml-monthly', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            rows: parsedRows.map((row) => ({
              macAddress: row.macAddress,
              month: row.month,
              branch: row.branch,
              tariff: row.tariff,
              status: 'склад',
              amountWithoutVat: row.amountWithoutVat,
            })),
          }),
        })

        if (saveResponse.status === 401) {
          handleLogout()
          setAuthError('Сессия истекла. Войдите снова.')
          return
        }

        if (!saveResponse.ok) {
          const payload = (await saveResponse.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error || 'Не удалось сохранить XML в базу')
        }

        await loadXmlMonthly()

        const matched = satellites.reduce((acc, sat) => {
          const satKey = normalizeMacKey(sat.GN_satellite_mac)
          return satKey && parsedRows.some((row) => normalizeMacKey(row.macAddress) === satKey) ? acc + 1 : acc
        }, 0)

        setXmlMatchedCount(matched)
        setError(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось загрузить XML'
        setError(message)
      } finally {
        setUploadingXml(false)
      }
    }
    reader.onerror = (): void => {
      setError('Ошибка при чтении файла')
    }
    reader.readAsArrayBuffer(file)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function clearXmlData(): void {
    setXmlRowsByMacMonth({})
    setMonths([])
    setXmlRowsCount(0)
    setXmlMatchedCount(0)
    setError(null)
  }

  function startEditRow(sat: Satellite): void {
    if (authUser !== 'ADM') return
    setEditingSatelliteId(sat.GN_satellite_id)
    setDraftSatellite({
      mac: sat.GN_satellite_mac,
      directionName: sat.GN_satellite_direction_name,
      departmentId: sat.GN_Dep_id,
    })
  }

  function cancelEditRow(): void {
    setEditingSatelliteId(null)
    setDraftSatellite(null)
    setSavingRowEdit(false)
  }

  async function saveEditRow(sat: Satellite): Promise<void> {
    if (!authToken || authUser !== 'ADM') return
    if (!draftSatellite) return

    setSavingRowEdit(true)
    try {
      const response = await fetch(`/api/satellites/${sat.GN_satellite_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          mac: draftSatellite.mac,
          directionName: draftSatellite.directionName,
          departmentId: draftSatellite.departmentId,
        }),
      })

      if (response.status === 401) {
        handleLogout()
        setAuthError('Сессия истекла. Войдите снова.')
        return
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || 'Не удалось сохранить изменения спутника')
      }

      const updated = (await response.json()) as Satellite
      setSatellites((prev) => prev.map((item) => (item.GN_satellite_id === updated.GN_satellite_id ? updated : item)))
      cancelEditRow()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить изменения спутника')
    } finally {
      setSavingRowEdit(false)
    }
  }

  async function clearMonth(month: string): Promise<void> {
    if (!authToken || authUser !== 'ADM') return
    setClearingMonth(month)
    try {
      const response = await fetch(`/api/satellites/xml-monthly/${encodeURIComponent(month)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      })

      if (response.status === 401) {
        handleLogout()
        setAuthError('Сессия истекла. Войдите снова.')
        return
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || 'Не удалось очистить месяц')
      }

      await loadXmlMonthly()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось очистить месяц')
    } finally {
      setClearingMonth(null)
    }
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setAuthLoading(true)
    setAuthError(null)

    try {
      const response = await fetch('/api/satellites/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || 'Ошибка авторизации')
      }

      const payload = (await response.json()) as { user?: string; token?: string }
      const user = String(payload.user ?? username)
      const token = String(payload.token ?? '')
      if (!token) {
        throw new Error('Не получен токен авторизации')
      }

      setAuthUser(user)
      setAuthToken(token)
      sessionStorage.setItem('satellites-control-user', user)
      sessionStorage.setItem('satellites-control-token', token)
      setPassword('')
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Ошибка авторизации')
    } finally {
      setAuthLoading(false)
    }
  }

  function handleLogout(): void {
    sessionStorage.removeItem('satellites-control-user')
    sessionStorage.removeItem('satellites-control-token')
    setAuthUser(null)
    setAuthToken(null)
    setSatellites([])
    clearXmlData()
    setError(null)
  }

  useEffect(() => {
    if (!authUser || !authToken) {
      setLoading(false)
      return
    }

    let isActive = true

    async function loadData(): Promise<void> {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/satellites', {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        })

        if (response.status === 401) {
          handleLogout()
          setAuthError('Сессия истекла. Войдите снова.')
          return
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json() as { satellites: Satellite[] }
        if (!isActive) return
        setSatellites(data.satellites)

        const depResponse = await fetch('/api/gn/departments')
        if (depResponse.ok) {
          const depRows = (await depResponse.json()) as DepartmentOption[]
          if (!isActive) return
          setDepartments(depRows)
        }

        await loadXmlMonthly()
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
  }, [authUser, authToken])

  return (
    <section className="page-section satellites-section">
      <div className="page-header satellites-page-header">
        <h1>Спутники: Контроль</h1>      
      </div>

      <div className="page-content satellites-content">
        {!authUser && (
          <div className="satellites-table-card" style={{ maxWidth: '420px' }}>
            <h3 className="satellites-subtitle">Авторизация</h3>
            <form className="invest-popup-grid" onSubmit={handleAuthSubmit}>
              <label className="invest-popup-field">
                <span>Пользователь</span>
                <select value={username} onChange={(e) => setUsername(e.target.value)}>
                  <option value="ADM">АДМ</option>
                  <option value="ВГГФ">ВГГФ</option>
                  <option value="СГГФ">СГГФ</option>
                  <option value="ТГГФ">ТГГФ</option>
                </select>
              </label>
              <label className="invest-popup-field">
                <span>Пароль</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                />
              </label>
              {authError && <p className="hint hint--error">Ошибка: {authError}</p>}
              <div>
                <button className="page-action-btn page-action-btn--success" type="submit" disabled={authLoading || !password}>
                  {authLoading ? 'Проверка...' : 'Войти'}
                </button>
              </div>
            </form>
          </div>
        )}

        {authUser && (
          <div className="satellites-control-action" style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
            <p className="hint">Пользователь: <strong>{authUser}</strong></p>
            <button className="page-action-btn page-action-btn--secondary" type="button" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        )}

        {loading && <p className="hint">Загрузка данных...</p>}
        {!loading && error && <p className="hint hint--error">Ошибка: {error}</p>}
        {!loading && !error && authUser && satellites.length > 0 && (
          <div className="satellites-table-card">           
            <p className="hint">Найдено направлений: <strong>{satellites.length}</strong></p>
            <div className="satellites-actions">
              {authUser === 'ADM' && (
                <label className="satellites-file-input-label">
                  <span className="page-action-btn page-action-btn--success">Загрузить XML</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xml"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
            {xmlRowsCount > 0 && (
              <p className="hint">
                Из XML загружено строк: <strong>{xmlRowsCount}</strong>. Сопоставлено по MAC: <strong>{xmlMatchedCount}</strong>.
              </p>
            )}
            <table className="guide-table table-compact satellites-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>MAC адрес</th>
                  <th>Имя направления</th>
                  <th>Подразделение</th>
                  {months.map((month) => (
                    <th key={month}>
                      <div style={{ display: 'grid', gap: '6px' }}>
                        <span>{month}</span>
                        <select
                          className="invest-program-inline-input"
                          value={(() => {
                            const statuses = new Set<SatelliteMonthStatus>()
                            Object.values(xmlRowsByMacMonth).forEach((byMonth) => {
                              const cell = byMonth[month]
                              if (cell) statuses.add(cell.status)
                            })
                            if (statuses.size === 1) return [...statuses][0]
                            return 'склад'
                          })()}
                          onChange={async (event) => {
                            if (authUser !== 'ADM' || !authToken) return
                            const nextStatus = normalizeStatus(event.target.value)
                            const rowsToSave = satellites
                              .map((sat) => {
                                const macKey = normalizeMacKey(sat.GN_satellite_mac)
                                const cell = xmlRowsByMacMonth[macKey]?.[month]
                                if (!cell) return null
                                return {
                                  macAddress: sat.GN_satellite_mac,
                                  month,
                                  branch: cell.branch,
                                  tariff: cell.tariff,
                                  status: nextStatus,
                                  amountWithoutVat: cell.amount,
                                }
                              })
                              .filter((row): row is { macAddress: string; month: string; branch: string; tariff: string; status: SatelliteMonthStatus; amountWithoutVat: number } => row !== null)

                            if (rowsToSave.length === 0) return

                            try {
                              const response = await fetch('/api/satellites/xml-monthly', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  Authorization: `Bearer ${authToken}`,
                                },
                                body: JSON.stringify({ rows: rowsToSave }),
                              })

                              if (response.status === 401) {
                                handleLogout()
                                setAuthError('Сессия истекла. Войдите снова.')
                                return
                              }

                              if (!response.ok) {
                                const payload = (await response.json().catch(() => ({}))) as { error?: string }
                                throw new Error(payload.error || 'Не удалось сохранить статус месяца')
                              }

                              await loadXmlMonthly()
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'Не удалось сохранить статус месяца')
                            }
                          }}
                          disabled={authUser !== 'ADM'}
                        >
                          {SATELLITE_MONTH_STATUSES.map((status) => (
                            <option key={`${month}-${status}`} value={status}>{status}</option>
                          ))}
                        </select>
                        {authUser === 'ADM' && (
                          <button
                            className="page-action-btn page-action-btn--danger"
                            type="button"
                            onClick={() => {
                              void clearMonth(month)
                            }}
                            disabled={clearingMonth === month}
                          >
                            {clearingMonth === month ? 'Очистка...' : 'Очистить'}
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  {authUser === 'ADM' && <th>Действия</th>}
                </tr>
              </thead>
              <tbody>
                {satellites.map((sat, index) => {
                  const macKey = normalizeMacKey(sat.GN_satellite_mac)
                  const isEditingRow = authUser === 'ADM' && editingSatelliteId === sat.GN_satellite_id

                  return (
                    <tr key={sat.GN_satellite_id}>
                      <td>{index + 1}</td>
                      <td>
                        {isEditingRow ? (
                          <input
                            className="invest-program-inline-input"
                            value={draftSatellite?.mac ?? ''}
                            onChange={(event) => {
                              const value = event.target.value
                              setDraftSatellite((prev) => (prev ? { ...prev, mac: value } : prev))
                            }}
                          />
                        ) : sat.GN_satellite_mac}
                      </td>
                      <td>
                        {isEditingRow ? (
                          <input
                            className="invest-program-inline-input"
                            value={draftSatellite?.directionName ?? ''}
                            onChange={(event) => {
                              const value = event.target.value
                              setDraftSatellite((prev) => (prev ? { ...prev, directionName: value } : prev))
                            }}
                          />
                        ) : sat.GN_satellite_direction_name}
                      </td>
                      <td>
                        {isEditingRow ? (
                          <select
                            className="invest-program-inline-input"
                            value={draftSatellite?.departmentId ?? ''}
                            onChange={(event) => {
                              const value = event.target.value
                              setDraftSatellite((prev) => (prev ? { ...prev, departmentId: value ? Number(value) : null } : prev))
                            }}
                          >
                            <option value="">-</option>
                            {departments.map((dep) => (
                              <option key={dep.GN_Dep_id} value={dep.GN_Dep_id}>{dep.GN_department}</option>
                            ))}
                          </select>
                        ) : (sat.GN_department || '-')}
                      </td>
                      {months.map((month) => {
                        const cell = xmlRowsByMacMonth[macKey]?.[month]
                        const tooltip = cell ? `Филиал: ${cell.branch || '-'}\nТариф: ${cell.tariff || '-'}\nСтатус: ${cell.status}` : ''
                        const statusClass = cell?.status === 'в работе'
                          ? 'satellite-amount--green'
                          : cell?.status === 'ошибка'
                            ? 'satellite-amount--red'
                            : 'satellite-amount--yellow'
                        return (
                          <td key={`${sat.GN_satellite_id}-${month}`} className={`number-cell ${statusClass}`} title={tooltip}>
                            {cell ? moneyFormatter.format(cell.amount) : '-'}
                          </td>
                        )
                      })}
                      {authUser === 'ADM' && (
                        <td className="invest-program-actions-cell">
                          {!isEditingRow ? (
                            <button
                              className="page-action-btn page-action-btn--secondary"
                              type="button"
                              onClick={() => startEditRow(sat)}
                            >
                              ИЗМ
                            </button>
                          ) : (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                className="page-action-btn page-action-btn--success"
                                type="button"
                                onClick={() => {
                                  void saveEditRow(sat)
                                }}
                                disabled={savingRowEdit}
                              >
                                {savingRowEdit ? 'Сохр...' : 'Сохранить'}
                              </button>
                              <button
                                className="page-action-btn page-action-btn--secondary"
                                type="button"
                                onClick={cancelEditRow}
                                disabled={savingRowEdit}
                              >
                                Отмена
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {uploadingXml && <p className="hint">Сохранение XML в базу...</p>}
          </div>
        )}

        {!loading && !error && authUser && satellites.length === 0 && (
          <p className="hint">Данные о спутниковых услугах отсутствуют</p>
        )}
      </div>
    </section>
  )
}

