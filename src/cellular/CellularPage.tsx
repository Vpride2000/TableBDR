import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { formatHttpError } from '../utils/forecastUtils'

type CellularRow = {
  GN_cellular_id: number
  GN_cellular_account: string | null
  GN_cellular_client: string | null
  GN_cellular_contract_number: string | null
  GN_cellular_identifier_FK: number
  GN_cellular_identifier: string
  GN_cellular_identifier_fio: string | null
  GN_cellular_icc: string | null
  GN_cellular_status: string | null
  GN_cellular_activation_date: string | null
  GN_cellular_zone: string | null
  GN_cellular_tariff_plan_FK: number
  GN_cellular_tariff_plan: string
  GN_cellular_tariff_plan_details: string | null
  GN_cellular_tariff_plan_enabled_date: string | null
  GN_cellular_updated_at: string | null
}

type SortDirection = 'asc' | 'desc'
type SortKey =
  | 'id'
  | 'account'
  | 'identifier'
  | 'fio'
  | 'status'
  | 'zone'
  | 'tariff'
  | 'activationDate'
  | 'tariffEnabledDate'

type CellularSyncUploadRow = {
  account: string | null
  clientName: string | null
  contractNumber: string | null
  identifier: string
  icc: string | null
  status: string | null
  activationDate: string | null
  zone: string | null
  tariffPlan: string
  tariffPlanEnabledDate: string | null
}

type SyncResult = {
  insertedRows: number
  updatedRows: number
  unchangedRows: number
  changedColumnsByRowKey: Record<string, string[]>
}

type CellularAccountOption = {
  account: string
  department: string
}

function normalizeDateDisplay(value: string | null): string {
  if (!value) return ''
  if (value.length >= 10) return value.slice(0, 10)
  return value
}

function toNullableText(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized === '' ? null : normalized
}

function excelSerialToDateString(value: unknown): string | null {
  if (value == null || value === '') return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    const converted = XLSX.SSF.parse_date_code(value)
    if (!converted) return null
    const month = String(converted.m).padStart(2, '0')
    const day = String(converted.d).padStart(2, '0')
    return `${converted.y}-${month}-${day}`
  }

  const text = String(value).trim()
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text

  const asNumber = Number(text.replace(',', '.'))
  if (Number.isFinite(asNumber)) {
    const converted = XLSX.SSF.parse_date_code(asNumber)
    if (!converted) return null
    const month = String(converted.m).padStart(2, '0')
    const day = String(converted.d).padStart(2, '0')
    return `${converted.y}-${month}-${day}`
  }

  return null
}

function buildCellularRowKey(account: string | null, identifier: string, icc: string | null): string {
  return `${account ?? ''}||${identifier}||${icc ?? ''}`
}

function parseCellularXlsxRows(file: File): Promise<CellularSyncUploadRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event): void => {
      try {
        const buffer = event.target?.result
        if (!(buffer instanceof ArrayBuffer)) {
          reject(new Error('Не удалось прочитать XLSX файл'))
          return
        }

        const workbook = XLSX.read(buffer, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        if (!firstSheetName) {
          reject(new Error('В XLSX отсутствуют листы'))
          return
        }

        const sheet = workbook.Sheets[firstSheetName]
        const rawRows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, { header: 1, defval: '' })
        if (rawRows.length === 0) {
          resolve([])
          return
        }

        const headers = rawRows[0].map((cell) => String(cell ?? '').trim())
        const headerIndex = new Map<string, number>()
        headers.forEach((header, index) => headerIndex.set(header, index))

        if (!headerIndex.has('Идентификатор') || !headerIndex.has('Тарифный план')) {
          reject(new Error('В файле не найдены обязательные колонки Идентификатор и Тарифный план'))
          return
        }

        const parsedRows: CellularSyncUploadRow[] = []

        for (let rowIndex = 1; rowIndex < rawRows.length; rowIndex += 1) {
          const row = rawRows[rowIndex]
          const identifier = String(row[headerIndex.get('Идентификатор') ?? -1] ?? '').trim()
          const tariffPlan = String(row[headerIndex.get('Тарифный план') ?? -1] ?? '').trim()

          if (!identifier || !tariffPlan) continue

          parsedRows.push({
            account: toNullableText(row[headerIndex.get('Л/С') ?? -1]),
            clientName: toNullableText(row[headerIndex.get('Клиент') ?? -1]),
            contractNumber: toNullableText(row[headerIndex.get('Номер договора') ?? -1]),
            identifier,
            icc: toNullableText(row[headerIndex.get('ICC') ?? -1]),
            status: toNullableText(row[headerIndex.get('Статус') ?? -1]),
            activationDate: excelSerialToDateString(row[headerIndex.get('Дата активации') ?? -1]),
            zone: toNullableText(row[headerIndex.get('Зона') ?? -1]),
            tariffPlan,
            tariffPlanEnabledDate: excelSerialToDateString(row[headerIndex.get('Тарифный план включен') ?? -1]),
          })
        }

        resolve(parsedRows)
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Ошибка разбора XLSX'))
      }
    }

    reader.onerror = (): void => reject(new Error('Ошибка чтения XLSX'))
    reader.readAsArrayBuffer(file)
  })
}

export default function CellularPage() {
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [loadingTable, setLoadingTable] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [cellularRows, setCellularRows] = useState<CellularRow[]>([])

  const [globalSearch, setGlobalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [zoneFilter, setZoneFilter] = useState('')
  const [tariffFilter, setTariffFilter] = useState('')
  const [accountOptions, setAccountOptions] = useState<CellularAccountOption[]>([])
  const [accountFilter, setAccountFilter] = useState('')
  const [hideBlocked, setHideBlocked] = useState(true)
  const [hideGlonass, setHideGlonass] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [hasLoadedTable, setHasLoadedTable] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [changedColumnsByRowKey, setChangedColumnsByRowKey] = useState<Record<string, string[]>>({})
  const [sortState, setSortState] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'id', direction: 'asc' })


  const lastUploadDisplay = useMemo(() => {
    const latest = cellularRows
      .map((row) => row.GN_cellular_updated_at)
      .filter((value): value is string => !!value)
      .reduce<string | null>((acc, value) => {
        if (!acc) return value
        return new Date(value).getTime() > new Date(acc).getTime() ? value : acc
      }, null)

    if (!latest) return 'нет данных'
    const parsed = new Date(latest)
    if (Number.isNaN(parsed.getTime())) return 'нет данных'
    return parsed.toLocaleString('ru-RU')
  }, [cellularRows])

  const statusOptions = useMemo(() => {
    const values = new Set<string>()
    cellularRows.forEach((row) => {
      const status = String(row.GN_cellular_status ?? '').trim()
      if (status) values.add(status)
    })
    return [...values].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [cellularRows])

  const zoneOptions = useMemo(() => {
    const values = new Set<string>()
    cellularRows.forEach((row) => {
      const zone = String(row.GN_cellular_zone ?? '').trim()
      if (zone) values.add(zone)
    })
    return [...values].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [cellularRows])

  const tariffOptions = useMemo(() => {
    const values = new Set<string>()
    cellularRows.forEach((row) => {
      const tariff = String(row.GN_cellular_tariff_plan ?? '').trim()
      if (tariff) values.add(tariff)
    })
    return [...values].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [cellularRows])

  const canLoadTable = true

  const filteredCellularRows = useMemo(() => {
    const normalizedSearch = globalSearch.trim().toLowerCase()

    return cellularRows.filter((row) => {
      if (accountFilter && String(row.GN_cellular_account ?? '') !== accountFilter) {
        return false
      }

      if (hideGlonass) {
        const tariffText = `${String(row.GN_cellular_tariff_plan ?? '')} ${String(row.GN_cellular_tariff_plan_details ?? '')}`.toLowerCase()
        if (tariffText.includes('глонасс')) {
          return false
        }
      }

      if (hideBlocked) {
        const status = String(row.GN_cellular_status ?? '').trim().toLowerCase()
        if (status !== 'действующий') {
          return false
        }
      }

      if (statusFilter && String(row.GN_cellular_status ?? '') !== statusFilter) {
        return false
      }

      if (zoneFilter && String(row.GN_cellular_zone ?? '') !== zoneFilter) {
        return false
      }

      if (tariffFilter && String(row.GN_cellular_tariff_plan ?? '') !== tariffFilter) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const accountComment = [
        row.GN_cellular_contract_number,
      ].map((value) => String(value ?? '')).join(' ')

      const identifierComment = [
        row.GN_cellular_icc,
        normalizeDateDisplay(row.GN_cellular_activation_date),
      ].map((value) => String(value ?? '')).join(' ')

      const tariffComment = [
        row.GN_cellular_tariff_plan_details,
        normalizeDateDisplay(row.GN_cellular_tariff_plan_enabled_date),
      ].map((value) => String(value ?? '')).join(' ')

      const searchable = [
        row.GN_cellular_account,
        row.GN_cellular_identifier,
        row.GN_cellular_identifier_fio,
        row.GN_cellular_status,
        row.GN_cellular_zone,
        row.GN_cellular_tariff_plan,
        accountComment,
        identifierComment,
        tariffComment,
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ')

      return searchable.includes(normalizedSearch)
    })
  }, [cellularRows, globalSearch, statusFilter, zoneFilter, tariffFilter, accountFilter, hideBlocked, hideGlonass])

  const sortedCellularRows = useMemo(() => {
    const valueBySortKey = (row: CellularRow, key: SortKey): string | number => {
      switch (key) {
        case 'id':
          return row.GN_cellular_id
        case 'account':
          return row.GN_cellular_account ?? ''
        case 'identifier':
          return row.GN_cellular_identifier ?? ''
        case 'fio':
          return row.GN_cellular_identifier_fio ?? ''
        case 'status':
          return row.GN_cellular_status ?? ''
        case 'zone':
          return row.GN_cellular_zone ?? ''
        case 'tariff':
          return row.GN_cellular_tariff_plan ?? ''
        case 'activationDate':
          return normalizeDateDisplay(row.GN_cellular_activation_date)
        case 'tariffEnabledDate':
          return normalizeDateDisplay(row.GN_cellular_tariff_plan_enabled_date)
      }
    }

    const direction = sortState.direction === 'asc' ? 1 : -1

    return [...filteredCellularRows].sort((left, right) => {
      const leftValue = valueBySortKey(left, sortState.key)
      const rightValue = valueBySortKey(right, sortState.key)

      let compare = 0
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        compare = leftValue - rightValue
      } else {
        compare = String(leftValue).localeCompare(String(rightValue), 'ru', { sensitivity: 'base' })
      }

      if (compare === 0) {
        compare = left.GN_cellular_id - right.GN_cellular_id
      }

      return compare * direction
    })
  }, [filteredCellularRows, sortState])

  async function loadAccounts(): Promise<void> {
    setAccountsLoading(true)
    try {
      const accountsRes = await fetch('/api/gn/cellular-account-options')

      if (!accountsRes.ok) throw new Error(formatHttpError(accountsRes.status))

      const accounts = (await accountsRes.json()) as CellularAccountOption[]
      setAccountOptions(accounts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить список Л/С')
    } finally {
      setAccountsLoading(false)
    }
  }

  async function loadAll(): Promise<void> {
    setError(null)
    setLoadingTable(true)

    try {
      const cellularRes = await fetch(`/api/gn/cellular?account=${encodeURIComponent(accountFilter)}`)

      if (!cellularRes.ok) throw new Error(formatHttpError(cellularRes.status))

      const cellularData = (await cellularRes.json()) as CellularRow[]

      setCellularRows(cellularData)
      setHasLoadedTable(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные по сотовой связи')
    } finally {
      setLoadingTable(false)
    }
  }

  useEffect(() => {
    void loadAccounts()
  }, [])

  function resetCellularFilters(): void {
    setGlobalSearch('')
    setStatusFilter('')
    setZoneFilter('')
    setTariffFilter('')
    setAccountFilter('')
    setHideBlocked(false)
    setHideGlonass(true)
    setHasLoadedTable(false)
    setCellularRows([])
    setUploadMessage(null)
    setUploadError(null)
    setChangedColumnsByRowKey({})
    setError(null)
  }

  async function handleLoadTable(): Promise<void> {
    await loadAll()
  }

  async function handleXlsxUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadMessage(null)
    setUploadError(null)

    try {
      setUploading(true)
      const rows = await parseCellularXlsxRows(file)

      if (rows.length === 0) {
        throw new Error('В файле нет подходящих строк для загрузки')
      }

      const response = await fetch('/api/gn/cellular/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })

      if (!response.ok) {
        throw new Error(formatHttpError(response.status))
      }

      const result = (await response.json()) as SyncResult
      setChangedColumnsByRowKey(result.changedColumnsByRowKey ?? {})
      setUploadMessage(`Обновление завершено: добавлено ${result.insertedRows}, обновлено ${result.updatedRows}, без изменений ${result.unchangedRows}.`)

      await loadAll()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Не удалось обновить данные из XLSX')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  function isCellChanged(row: CellularRow, columnName: string): boolean {
    const rowKey = buildCellularRowKey(
      toNullableText(row.GN_cellular_account),
      String(row.GN_cellular_identifier ?? '').trim(),
      toNullableText(row.GN_cellular_icc)
    )
    const changedColumns = changedColumnsByRowKey[rowKey] ?? []
    return changedColumns.includes(columnName)
  }

  function openTariffGuideWindow(): void {
    const popup = window.open(
      `${window.location.pathname}#cellular-tariff-guide-window`,
      'cellular-tariff-guide-window',
      'popup=yes,width=1000,height=760,resizable=yes,scrollbars=yes'
    )
    if (popup) popup.focus()
  }

  function openAccountGuideWindow(): void {
    const popup = window.open(
      `${window.location.pathname}#cellular-account-guide-window`,
      'cellular-account-guide-window',
      'popup=yes,width=1100,height=760,resizable=yes,scrollbars=yes'
    )
    if (popup) popup.focus()
  }

  function openIdentifierGuideWindow(): void {
    const popup = window.open(
      `${window.location.pathname}#cellular-identifier-guide-window`,
      'cellular-identifier-guide-window',
      'popup=yes,width=1000,height=760,resizable=yes,scrollbars=yes'
    )
    if (popup) popup.focus()
  }

  function toggleSort(key: SortKey): void {
    setSortState((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        }
      }

      return {
        key,
        direction: 'asc',
      }
    })
  }

  function sortMark(key: SortKey): string {
    if (sortState.key !== key) return '↕'
    return sortState.direction === 'asc' ? '↑' : '↓'
  }

  return (
    <section className="guide invest-program-section transparent-section">
      <div className="guide-section invest-program-content">    

        {accountsLoading && <p className="hint">Загрузка списка Л/С...</p>}
        {error && <p className="hint hint--error">Ошибка: {error}</p>}

        {!accountsLoading && !error && (
          <>
          <div className="guide-table-wrap cellular-main-table-wrap section-bottom-space">
                <div className="page-header">
                  <h3> Справочник абонентов служебной сотовой связи </h3>
                </div>
                
                <div className="guide-table-actions" style={{ justifyContent: 'flex-start', marginBottom: '8px' }}>
                <button
                  type="button"
                  className="page-action-btn page-action-btn--secondary"
                  onClick={openIdentifierGuideWindow}
                >
                  Справочник абонентов краткий
                </button>
                <button
                  type="button"
                  className="page-action-btn page-action-btn--secondary"
                  onClick={openTariffGuideWindow}
                >
                  Тарифы
                </button>
                <button
                  type="button"
                  className="page-action-btn page-action-btn--secondary"
                  onClick={openAccountGuideWindow}
                >
                  Лицевые счета
                </button>               
                  <span className="page-action-btn page-action-btn--secondary" style={{ display: 'inline-block' }}>
                    {uploading ? 'Загрузка...' : 'Загрузить обновленный отчет из XLSX'}
                  </span>
                  <input
                    type="file"
                    accept=".xlsx"
                    onChange={(event) => {
                      void handleXlsxUpload(event)
                    }}
                    style={{ display: 'none' }}
                    disabled={uploading}
                  />
                  <span style={{ marginLeft: '12px' }}>Последняя загрузка: <strong>{lastUploadDisplay}</strong></span>
              </div>  
          
                         <p className="hint">
                {hasLoadedTable && cellularRows.length > 0
                  ? <>Найдено строк: <strong>{filteredCellularRows.length}</strong> из {cellularRows.length}</>
                  : hasLoadedTable
                    ? 'По выбранному Л/С данные не найдены.'
                    : accountFilter
                      ? 'Нажмите Загрузить, чтобы подгрузить данные по выбранному Л/С.'
                      : 'Выберите Л/С или пункт Все и нажмите Загрузить.'}
              </p>
              <div className="form-field-compact">
                 <button
                    type="button"
                    className="page-action-btn page-action-btn--success"
                    onClick={() => {
                      void handleLoadTable()
                    }}
                    disabled={!canLoadTable || loadingTable}
                  >
                    {loadingTable ? 'Загрузка...' : 'Показать справочник'}
                  </button>                  
                  <span className="form-field-label">Л/С</span>
                  <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
                    <option value="">Все</option>
                    {accountOptions.map((option) => (
                      <option key={option.account} value={option.account}>
                        {option.department ? `${option.account} (${option.department})` : option.account}
                      </option>
                    ))}
                  </select>                
                    <button
                    type="button"
                    className="page-action-btn page-action-btn--secondary"
                    onClick={resetCellularFilters}
                  >
                    Сбросить
                  </button>
                  </div> 
                  <div style={{ marginTop: '20px' }}>  
               <label className="form-field-compact">
                  <span className="form-field-label">Поиск</span>
                  <input
                    type="text"
                    placeholder="Л/С, идентификатор, ФИО, статус, зона, тариф и комментарии..."
                    value={globalSearch}
                    onChange={(event) => setGlobalSearch(event.target.value)}
                  />
                </label>
                
                             
              </div>
              {uploadMessage && <p className="hint">{uploadMessage}</p>}
              {uploadError && <p className="hint hint--error">Ошибка загрузки: {uploadError}</p>}
              <div className="form-fields-compact" style={{ marginTop: '20px', marginBottom: '10px' }}>
                <label className="form-field-compact">
                  <span className="form-field-label">Статус</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="">Все</option>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>

                <label className="form-field-compact">
                  <span className="form-field-label">Регион номера</span>
                  <select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}>
                    <option value="">Все</option>
                    {zoneOptions.map((zone) => (
                      <option key={zone} value={zone}>{zone}</option>
                    ))}
                  </select>
                </label>

                <label className="form-field-compact">
                  <span className="form-field-label">Тариф</span>
                  <select value={tariffFilter} onChange={(event) => setTariffFilter(event.target.value)}>
                    <option value="">Все</option>
                    {tariffOptions.map((tariff) => (
                      <option key={tariff} value={tariff}>{tariff}</option>
                    ))}
                  </select>
                </label>
                <label className="satellites-hide-unused-label" style={{ marginRight: '12px' }}>
                  <input
                    type="checkbox"
                    checked={!hideBlocked}
                    onChange={(event) => setHideBlocked(!event.target.checked)}
                  />
                  Показывать заблокированные
                </label>
                <label className="satellites-hide-unused-label">
                  <input
                    type="checkbox"
                    checked={!hideGlonass}
                    onChange={(event) => setHideGlonass(!event.target.checked)}
                  />
                  Показывать Глонасс
                </label>  
              </div> 
              {hasLoadedTable && (
                <table className="guide-table table-compact cellular-main-table">
                <thead>
                  <tr>
                    <th>
                      <button type="button" className="satellites-sort-btn" onClick={() => toggleSort('id')}>
                        № {sortMark('id')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="satellites-sort-btn" onClick={() => toggleSort('identifier')}>
                        Идентификатор {sortMark('identifier')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="satellites-sort-btn" onClick={() => toggleSort('fio')}>
                        ФИО (из справочника) {sortMark('fio')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="satellites-sort-btn" onClick={() => toggleSort('account')}>
                        Л/С {sortMark('account')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="satellites-sort-btn" onClick={() => toggleSort('status')}>
                        Статус {sortMark('status')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="satellites-sort-btn" onClick={() => toggleSort('zone')}>
                        Зона {sortMark('zone')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="satellites-sort-btn" onClick={() => toggleSort('tariff')}>
                        Тарифный план {sortMark('tariff')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCellularRows.map((row) => {
                    const accountComment = [
                      `Номер договора: ${row.GN_cellular_contract_number ?? '-'}`,
                    ].join('\n')

                    const identifierComment = [
                      `ICC: ${row.GN_cellular_icc ?? '-'}`,
                      `Дата активации: ${normalizeDateDisplay(row.GN_cellular_activation_date) || '-'}`,
                    ].join('\n')

                    const tariffComment = [
                      `Состав тарифа: ${row.GN_cellular_tariff_plan_details ?? '-'}`,
                      `Тарифный план включен: ${normalizeDateDisplay(row.GN_cellular_tariff_plan_enabled_date) || '-'}`,
                    ].join('\n')

                    return (
                    <tr key={row.GN_cellular_id}>
                      <td>{row.GN_cellular_id}</td>
                      <td className={isCellChanged(row, 'GN_cellular_identifier') ? 'cellular-cell-changed' : ''} title={identifierComment}>{row.GN_cellular_identifier}</td>
                      <td>{row.GN_cellular_identifier_fio ?? ''}</td>
                      <td className={isCellChanged(row, 'GN_cellular_account') ? 'cellular-cell-changed' : ''} title={accountComment}>{row.GN_cellular_account ?? ''}</td>
                      <td className={isCellChanged(row, 'GN_cellular_status') ? 'cellular-cell-changed' : ''}>{row.GN_cellular_status ?? ''}</td>
                      <td className={isCellChanged(row, 'GN_cellular_zone') ? 'cellular-cell-changed' : ''}>{row.GN_cellular_zone ?? ''}</td>
                      <td className={isCellChanged(row, 'GN_cellular_tariff_plan') ? 'cellular-cell-changed' : ''} title={tariffComment}>{row.GN_cellular_tariff_plan}</td>
                    </tr>
                    )
                  })}
                  {sortedCellularRows.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <p className="hint">По выбранным фильтрам совпадений нет.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}