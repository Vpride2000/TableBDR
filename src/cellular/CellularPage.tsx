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
}

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [cellularRows, setCellularRows] = useState<CellularRow[]>([])

  const [globalSearch, setGlobalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [zoneFilter, setZoneFilter] = useState('')
  const [tariffFilter, setTariffFilter] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [changedColumnsByRowKey, setChangedColumnsByRowKey] = useState<Record<string, string[]>>({})


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

  const filteredCellularRows = useMemo(() => {
    const normalizedSearch = globalSearch.trim().toLowerCase()

    return cellularRows.filter((row) => {
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

      const searchable = [
        row.GN_cellular_account,
        row.GN_cellular_client,
        row.GN_cellular_contract_number,
        row.GN_cellular_identifier,
        row.GN_cellular_identifier_fio,
        row.GN_cellular_icc,
        row.GN_cellular_status,
        row.GN_cellular_zone,
        row.GN_cellular_tariff_plan,
        row.GN_cellular_tariff_plan_details,
        normalizeDateDisplay(row.GN_cellular_activation_date),
        normalizeDateDisplay(row.GN_cellular_tariff_plan_enabled_date),
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ')

      return searchable.includes(normalizedSearch)
    })
  }, [cellularRows, globalSearch, statusFilter, zoneFilter, tariffFilter])

  async function loadAll(): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const cellularRes = await fetch('/api/gn/cellular')

      if (!cellularRes.ok) throw new Error(formatHttpError(cellularRes.status))

      const cellularData = (await cellularRes.json()) as CellularRow[]

      setCellularRows(cellularData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные по сотовой связи')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  function resetCellularFilters(): void {
    setGlobalSearch('')
    setStatusFilter('')
    setZoneFilter('')
    setTariffFilter('')
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

  return (
    <section className="guide invest-program-section transparent-section">
      <div className="guide-section invest-program-content">
        <h2>Сотовая связь</h2>

        {loading && <p className="hint">Загрузка данных...</p>}
        {error && <p className="hint hint--error">Ошибка: {error}</p>}

        {!loading && !error && (
          <>
            <p className="hint">
              Основная таблица загружается из XLSX и связана со справочниками Идентификатор и Тарифный план.
            </p>

            <div className="guide-table-wrap section-bottom-space">
              <div className="guide-table-actions" style={{ justifyContent: 'flex-start', marginBottom: '8px' }}>
                <button
                  type="button"
                  className="page-action-btn page-action-btn--secondary"
                  onClick={openTariffGuideWindow}
                >
                  Справочник: Тарифный план (popup)
                </button>
              </div>
              <h3>Основная таблица сотовой связи</h3>
              <div className="form-fields-compact" style={{ marginBottom: '10px' }}>
                <label className="form-field-compact">
                  <span className="page-action-btn page-action-btn--success" style={{ display: 'inline-block' }}>
                    {uploading ? 'Загрузка...' : 'Загрузить обновленный XLSX'}
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
                </label>
              </div>
              {uploadMessage && <p className="hint">{uploadMessage}</p>}
              {uploadError && <p className="hint hint--error">Ошибка загрузки: {uploadError}</p>}
              <div className="form-fields-compact" style={{ marginBottom: '10px' }}>
                <label className="form-field-compact">
                  <span className="form-field-label">Поиск</span>
                  <input
                    type="text"
                    placeholder="Л/С, Клиент, Идентификатор, ICC, тариф..."
                    value={globalSearch}
                    onChange={(event) => setGlobalSearch(event.target.value)}
                  />
                </label>

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
                  <span className="form-field-label">Зона</span>
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

                <div className="form-actions-row-compact">
                  <button
                    type="button"
                    className="page-action-btn page-action-btn--secondary"
                    onClick={resetCellularFilters}
                  >
                    Сбросить
                  </button>
                </div>
              </div>

              <p className="hint">Найдено строк: <strong>{filteredCellularRows.length}</strong> из {cellularRows.length}</p>

              <table className="guide-table table-compact">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Л/С</th>
                    <th>Клиент</th>
                    <th>Номер договора</th>
                    <th>Идентификатор</th>
                    <th>ФИО (из справочника)</th>
                    <th>ICC</th>
                    <th>Статус</th>
                    <th>Дата активации</th>
                    <th>Зона</th>
                    <th>Тарифный план</th>
                    <th>Детали (из справочника)</th>
                    <th>Тарифный план включен</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCellularRows.map((row) => (
                    <tr key={row.GN_cellular_id}>
                      <td>{row.GN_cellular_id}</td>
                      <td className={isCellChanged(row, 'GN_cellular_account') ? 'cellular-cell-changed' : ''}>{row.GN_cellular_account ?? ''}</td>
                      <td className={isCellChanged(row, 'GN_cellular_client') ? 'cellular-cell-changed' : ''}>{row.GN_cellular_client ?? ''}</td>
                      <td className={isCellChanged(row, 'GN_cellular_contract_number') ? 'cellular-cell-changed' : ''}>{row.GN_cellular_contract_number ?? ''}</td>
                      <td className={isCellChanged(row, 'GN_cellular_identifier') ? 'cellular-cell-changed' : ''}>{row.GN_cellular_identifier}</td>
                      <td>{row.GN_cellular_identifier_fio ?? ''}</td>
                      <td className={isCellChanged(row, 'GN_cellular_icc') ? 'cellular-cell-changed' : ''}>{row.GN_cellular_icc ?? ''}</td>
                      <td className={isCellChanged(row, 'GN_cellular_status') ? 'cellular-cell-changed' : ''}>{row.GN_cellular_status ?? ''}</td>
                      <td className={isCellChanged(row, 'GN_cellular_activation_date') ? 'cellular-cell-changed' : ''}>{normalizeDateDisplay(row.GN_cellular_activation_date)}</td>
                      <td className={isCellChanged(row, 'GN_cellular_zone') ? 'cellular-cell-changed' : ''}>{row.GN_cellular_zone ?? ''}</td>
                      <td className={isCellChanged(row, 'GN_cellular_tariff_plan') ? 'cellular-cell-changed' : ''}>{row.GN_cellular_tariff_plan}</td>
                      <td>{row.GN_cellular_tariff_plan_details ?? ''}</td>
                      <td className={isCellChanged(row, 'GN_cellular_tariff_plan_enabled_date') ? 'cellular-cell-changed' : ''}>{normalizeDateDisplay(row.GN_cellular_tariff_plan_enabled_date)}</td>
                    </tr>
                  ))}
                  {filteredCellularRows.length === 0 && (
                    <tr>
                      <td colSpan={13}>
                        <p className="hint">По выбранным фильтрам совпадений нет.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
