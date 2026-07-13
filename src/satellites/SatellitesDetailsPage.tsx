import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  aggregateSatelliteRowsByMac,
  buildSatelliteBranchSummary,
  parseSatelliteAmount,
  parseSatelliteRowsFromBuffer,
  type SatelliteRow,
} from './satelliteXml'

export default function SatellitesDetailsPage() {
  const [rows, setRows] = useState<SatelliteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const totals = useMemo(() => {
    const totalWithoutVat = rows.reduce((acc, row) => acc + parseSatelliteAmount(row.amountWithoutVat), 0)
    return {
      totalWithoutVat,
    }
  }, [rows])

  const summaryRows = useMemo(() => buildSatelliteBranchSummary(rows), [rows])

  const moneyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    []
  )

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e): void => {
      try {
        const buffer = e.target?.result
        if (!(buffer instanceof ArrayBuffer)) throw new Error('Некорректный формат файла')

        const parsedRows = parseSatelliteRowsFromBuffer(buffer)
        setRows(aggregateSatelliteRowsByMac(parsedRows))
        setError(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось загрузить XML'
        setError(message)
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

  function exportToXlsx(): void {
    if (rows.length === 0) {
      setError('Нет данных для экспорта')
      return
    }

    const timestamp = new Date().toISOString().split('T')[0]
    const fileName = `Спутники_${timestamp}.xlsx`

    // Сводная таблица по филиалам
    const summaryRows_data = [['ФИЛИАЛ', 'Сумма без НДС']]
    summaryRows.forEach((row) => {
      summaryRows_data.push([row.branch, row.totalWithoutVat])
    })
    summaryRows_data.push(['Итого', totals.totalWithoutVat])

    // Пустые строки для разделения
    const spacerRows = [[], []]

    // Детализация
    const detailHeaderRow = ['№', 'MAC', 'Объект', 'ФИЛИАЛ', 'Тариф', 'Месяц', 'Ед. изм.', 'Кол-во', 'Сумма без НДС']
    const detailRows: (string | number)[][] = rows.map((row) => [
      row.index,
      row.macAddress,
      row.objectName,
      row.branch,
      row.tariff,
      row.month,
      row.unit,
      row.quantity,
      row.amountWithoutVat,
    ])

    // Объединяем все данные в один массив
    const allData = [...summaryRows_data, ...spacerRows, detailHeaderRow, ...detailRows]

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(allData)

    XLSX.utils.book_append_sheet(wb, ws, 'Спутники')

    XLSX.writeFile(wb, fileName)
  }

  function clearTable(): void {
    setRows([])
    setError(null)
  }

  return (
    <section className="page-section satellites-section">
      <div className="page-header">
        <h1>Спутники: Детализация</h1>
        <p className="hint">Таблица позиций из XML-файла месяц.xml</p>
      </div>

      <div className="satellites-actions">
        <label className="satellites-file-input-label">
          <span className="page-action-btn page-action-btn--success">
            Загрузить XML
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </label>
        <button
          className="page-action-btn"
          type="button"
          onClick={exportToXlsx}
          disabled={rows.length === 0}
        >
          Экспорт в XLSX
        </button>
        <button
          className="page-action-btn page-action-btn--danger"
          type="button"
          onClick={clearTable}
          disabled={rows.length === 0}
        >
          Очистить таблицу
        </button>
      </div>

      <div className="page-content satellites-content">
        {error && <p className="hint hint--error">Ошибка: {error}</p>}

        {rows.length > 0 && (
          <>
            <p className="hint">
              Найдено строк: <strong>{rows.length}</strong>. Сумма без НДС: <strong>{moneyFormatter.format(totals.totalWithoutVat)}</strong>. Поля Код товара, Цена, Ставка НДС и Сумма с НДС при загрузке XML игнорируются.
            </p>

            <div className="satellites-stack satellites-layout--left">
              <div className="satellites-table-card satellites-summary-card">
                <h3 className="satellites-subtitle">Сводка по филиалам</h3>
                <table className="guide-table table-compact satellites-summary-table">
                  <thead>
                    <tr>
                      <th>ФИЛИАЛ</th>
                      <th>Сумма без НДС</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((row) => (
                      <tr key={row.branch}>
                        <td>{row.branch}</td>
                        <td className="number-cell">{moneyFormatter.format(row.totalWithoutVat)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td><strong>Итого</strong></td>
                      <td className="number-cell"><strong>{moneyFormatter.format(totals.totalWithoutVat)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="satellites-table-wrap satellites-table-card">
                <table className="guide-table table-compact satellites-table">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>MAC</th>
                      <th>Объект</th>
                      <th>ФИЛИАЛ</th>
                      <th>Тариф</th>
                      <th>Месяц</th>
                      <th>Ед. изм.</th>
                      <th>Кол-во</th>
                      <th>Сумма без НДС</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={`${row.index}-${row.macAddress}-${row.description}`}>
                        <td>{row.index}</td>
                        <td>{row.macAddress || '-'}</td>
                        <td>{row.objectName || '-'}</td>
                        <td>{row.branch || '-'}</td>
                        <td>{row.tariff || '-'}</td>
                        <td>{row.month || '-'}</td>
                        <td>{row.unit || '-'}</td>
                        <td className="number-cell">{row.quantity || '-'}</td>
                        <td className="number-cell" title={row.description || '-'}>{row.amountWithoutVat || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        {rows.length === 0 && !error && (
          <p className="hint">Загрузите XML файл для отображения данных</p>
        )}
      </div>
    </section>
  )
}
