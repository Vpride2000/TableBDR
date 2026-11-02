import { useEffect, useState } from 'react'
import {
  DASHBOARD_TILE_STATUS_OPTIONS,
  DASHBOARD_TILES,
  DEFAULT_DASHBOARD_TILE_STATUSES,
  isDashboardTileStatus,
  type DashboardTileKey,
  type DashboardTileStatus,
  type DashboardTileStatuses,
} from '../utils/dashboardTileStatuses'
import {
  DASHBOARD_BDR_FIELDS,
  DEFAULT_DASHBOARD_BDR_FIELD,
  isDashboardBdrField,
  type DashboardBdrField,
} from '../utils/dashboardBdrField'

const PERSONAL_ACCOUNT_USER_KEY = 'personal-account-user'
const PERSONAL_ACCOUNT_TOKEN_KEY = 'personal-account-token'

export default function PersonalAccountPage(): React.ReactElement {
  const [password, setPassword] = useState('')
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(PERSONAL_ACCOUNT_TOKEN_KEY))
  const [sessionChecking, setSessionChecking] = useState(() => Boolean(sessionStorage.getItem(PERSONAL_ACCOUNT_TOKEN_KEY)))
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [tileStatuses, setTileStatuses] = useState<DashboardTileStatuses>(DEFAULT_DASHBOARD_TILE_STATUSES)
  const [statusesLoading, setStatusesLoading] = useState(false)
  const [statusSavingKey, setStatusSavingKey] = useState<DashboardTileKey | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [dashboardBdrField, setDashboardBdrField] = useState<DashboardBdrField>(DEFAULT_DASHBOARD_BDR_FIELD)
  const [bdrFieldLoading, setBdrFieldLoading] = useState(false)
  const [bdrFieldSaving, setBdrFieldSaving] = useState(false)
  const [bdrFieldError, setBdrFieldError] = useState<string | null>(null)
  const [bdrFieldMessage, setBdrFieldMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let active = true

    async function validateSession(): Promise<void> {
      try {
        const response = await fetch('/api/personal-account/session', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          if (active) {
            sessionStorage.removeItem(PERSONAL_ACCOUNT_USER_KEY)
            sessionStorage.removeItem(PERSONAL_ACCOUNT_TOKEN_KEY)
            setToken(null)
            if (response.status !== 401) {
              throw new Error(`Не удалось проверить сессию (HTTP ${response.status})`)
            }
          }
        }
      } catch (requestError) {
        if (active) setAuthError(requestError instanceof Error ? requestError.message : 'Не удалось проверить сессию')
      } finally {
        if (active) setSessionChecking(false)
      }
    }

    void validateSession()
    return () => {
      active = false
    }
  }, [token])

  useEffect(() => {
    if (!token || sessionChecking) return
    let active = true

    async function loadTileStatuses(): Promise<void> {
      setStatusesLoading(true)
      setStatusError(null)
      try {
        const response = await fetch('/api/dashboard/tile-statuses')
        if (!response.ok) throw new Error(`Не удалось загрузить статусы (HTTP ${response.status})`)
        const statuses = await response.json() as Partial<Record<DashboardTileKey, unknown>>
        const nextStatuses: DashboardTileStatuses = { ...DEFAULT_DASHBOARD_TILE_STATUSES }
        for (const tile of DASHBOARD_TILES) {
          const value = statuses[tile.key]
          if (isDashboardTileStatus(value)) nextStatuses[tile.key] = value
        }
        if (active) setTileStatuses(nextStatuses)
      } catch (requestError) {
        if (active) setStatusError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить статусы')
      } finally {
        if (active) setStatusesLoading(false)
      }
    }

    void loadTileStatuses()
    return () => {
      active = false
    }
  }, [sessionChecking, token])

  useEffect(() => {
    if (!token || sessionChecking) return
    let active = true

    async function loadDashboardBdrField(): Promise<void> {
      setBdrFieldLoading(true)
      setBdrFieldError(null)
      try {
        const response = await fetch('/api/dashboard/bdr-field')
        if (!response.ok) throw new Error(`Не удалось загрузить вариант БДР (HTTP ${response.status})`)
        const payload = await response.json() as { field?: unknown }
        if (!isDashboardBdrField(payload.field)) throw new Error('Сервер вернул неизвестный вариант БДР')
        if (active) setDashboardBdrField(payload.field)
      } catch (requestError) {
        if (active) setBdrFieldError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить вариант БДР')
      } finally {
        if (active) setBdrFieldLoading(false)
      }
    }

    void loadDashboardBdrField()
    return () => {
      active = false
    }
  }, [sessionChecking, token])

  async function handleLogin(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setAuthLoading(true)
    setAuthError(null)

    try {
      const response = await fetch('/api/personal-account/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const payload = await response.json() as { error?: string; user?: string; token?: string }
      if (!response.ok) throw new Error(payload.error || `Ошибка авторизации (HTTP ${response.status})`)
      if (payload.user !== 'ADM' || !payload.token) throw new Error('Сервер не подтвердил доступ для пользователя АДМ')

      sessionStorage.setItem(PERSONAL_ACCOUNT_USER_KEY, payload.user)
      sessionStorage.setItem(PERSONAL_ACCOUNT_TOKEN_KEY, payload.token)
      setToken(payload.token)
      setPassword('')
    } catch (requestError) {
      setAuthError(requestError instanceof Error ? requestError.message : 'Ошибка авторизации')
    } finally {
      setAuthLoading(false)
    }
  }

  function handleLogout(): void {
    sessionStorage.removeItem(PERSONAL_ACCOUNT_USER_KEY)
    sessionStorage.removeItem(PERSONAL_ACCOUNT_TOKEN_KEY)
    setToken(null)
    setPassword('')
    setAuthError(null)
  }

  async function saveTileStatus(tileKey: DashboardTileKey, status: DashboardTileStatus): Promise<void> {
    if (!token || statusSavingKey) return
    setStatusSavingKey(tileKey)
    setStatusError(null)
    setStatusMessage(null)
    try {
      const response = await fetch(`/api/dashboard/tile-statuses/${encodeURIComponent(tileKey)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      })
      const payload = await response.json() as { error?: string; status?: DashboardTileStatus }
      if (response.status === 401) {
        handleLogout()
        throw new Error('Сессия истекла. Войдите снова.')
      }
      if (!response.ok) throw new Error(payload.error || `Не удалось сохранить статус (HTTP ${response.status})`)
      if (payload.status !== status) throw new Error('Сервер не подтвердил сохранение выбранного статуса')
      setTileStatuses((current) => ({ ...current, [tileKey]: status }))
      setStatusMessage('Статус актуальности сохранён.')
    } catch (requestError) {
      setStatusError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить статус')
    } finally {
      setStatusSavingKey(null)
    }
  }

  async function saveDashboardBdrField(field: DashboardBdrField): Promise<void> {
    if (!token || bdrFieldSaving) return
    setBdrFieldSaving(true)
    setBdrFieldError(null)
    setBdrFieldMessage(null)
    try {
      const response = await fetch('/api/dashboard/bdr-field', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ field }),
      })
      const payload = await response.json() as { error?: string; field?: unknown }
      if (response.status === 401) {
        handleLogout()
        throw new Error('Сессия истекла. Войдите снова.')
      }
      if (!response.ok) throw new Error(payload.error || `Не удалось сохранить вариант БДР (HTTP ${response.status})`)
      if (!isDashboardBdrField(payload.field) || payload.field !== field) {
        throw new Error('Сервер не подтвердил сохранение выбранного варианта БДР')
      }
      setDashboardBdrField(field)
      setBdrFieldMessage('Вариант БДР для сводки сохранён.')
    } catch (requestError) {
      setBdrFieldError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить вариант БДР')
    } finally {
      setBdrFieldSaving(false)
    }
  }

  return (
    <section className="page-section">
      <div className="page-header">
        <h1>Личный кабинет</h1>
      </div>
      {sessionChecking ? (
        <p className="hint" role="status">Проверка сессии...</p>
      ) : token ? (
        <div className="page-content personal-account-content">
          <div className="personal-account-session">
            <p className="hint">Пользователь: <strong>АДМ</strong></p>
            <button type="button" className="page-action-btn page-action-btn--secondary" onClick={handleLogout}>
              Выйти
            </button>
          </div>
          <section className="personal-account-statuses">
            <h2>Актуальность данных дашборда</h2>
            <p className="hint">
              Красный — тестовый режим; жёлтый — данные частично обновлены; зелёный — данные актуальны.
            </p>
            {statusesLoading && <p className="hint" role="status">Загрузка статусов...</p>}
            {statusError && <p className="hint hint--error" role="alert">{statusError}</p>}
            {statusMessage && <p className="hint" role="status">{statusMessage}</p>}
            {!statusesLoading && (
              <div className="personal-account-status-list">
                {DASHBOARD_TILES.map((tile) => (
                  <label className="personal-account-status-row" key={tile.key}>
                    <span>{tile.label}</span>
                    <select
                      value={tileStatuses[tile.key]}
                      disabled={statusSavingKey !== null}
                      onChange={(event) => {
                        const value = event.target.value
                        if (isDashboardTileStatus(value)) void saveTileStatus(tile.key, value)
                      }}
                    >
                      {DASHBOARD_TILE_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    {statusSavingKey === tile.key && <span className="hint" role="status">Сохранение...</span>}
                  </label>
                ))}
              </div>
            )}
          </section>
          <section className="personal-account-statuses">
            <h2>Год БДР в сводке услуг связи</h2>
            <p className="hint">
              Выбранный вариант определяет сумму услуг связи в таблице «Сводка по подразделениям и объектам» на главной странице.
            </p>
            {bdrFieldLoading && <p className="hint" role="status">Загрузка варианта БДР...</p>}
            {bdrFieldError && <p className="hint hint--error" role="alert">{bdrFieldError}</p>}
            {bdrFieldMessage && <p className="hint" role="status">{bdrFieldMessage}</p>}
            {!bdrFieldLoading && (
              <label className="personal-account-status-row">
                <span>Вариант БДР</span>
                <select
                  value={dashboardBdrField}
                  disabled={bdrFieldSaving}
                  onChange={(event) => {
                    if (isDashboardBdrField(event.target.value)) void saveDashboardBdrField(event.target.value)
                  }}
                >
                  {DASHBOARD_BDR_FIELDS.map((field) => (
                    <option key={field.value} value={field.value}>{field.label}</option>
                  ))}
                </select>
                {bdrFieldSaving && <span className="hint" role="status">Сохранение...</span>}
              </label>
            )}
          </section>
        </div>
      ) : (
        <div className="page-content">
          <div className="satellites-table-card personal-account-login">
            <h3 className="satellites-subtitle">Авторизация АДМ</h3>
            <form className="invest-popup-grid" onSubmit={(event) => void handleLogin(event)}>
              <p className="hint">Доступ разрешён только пользователю АДМ.</p>
              <label className="invest-popup-field">
                <span>Пароль АДМ</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Введите пароль"
                />
              </label>
              {authError && <p className="hint hint--error" role="alert">Ошибка: {authError}</p>}
              <div>
                <button
                  className="page-action-btn page-action-btn--success"
                  type="submit"
                  disabled={authLoading || !password}
                >
                  {authLoading ? 'Проверка...' : 'Войти'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
