import { useEffect, useRef, useState } from 'react'
import { personalAccountOptions } from '../shared/personalAccounts'
import { formatHttpError } from './utils/httpUtils'

type PrimaryRow = { id: number; contractId: number | null; personalAccount: string | null }
type Dogovor = { GN_dgv_id: number; GN_dogovor_personal_account: string | null }

export default function PrimaryAccountDetailsPage({ rowId }: { rowId: number }): React.ReactElement {
  const [account, setAccount] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<{ name: string; data: ArrayBuffer } | null>(null)
  const [readingFile, setReadingFile] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileRequestRef = useRef(0)

  useEffect(() => {
    let active = true
    async function loadAccount(): Promise<void> {
      try {
        const [rowsResponse, dogovorsResponse] = await Promise.all([
          fetch('/api/primary', { cache: 'no-store' }),
          fetch('/api/gn/dogovors', { cache: 'no-store' }),
        ])
        if (!rowsResponse.ok) throw new Error(formatHttpError(rowsResponse.status))
        if (!dogovorsResponse.ok) throw new Error(formatHttpError(dogovorsResponse.status))
        const rows = await rowsResponse.json() as PrimaryRow[]
        const dogovors = await dogovorsResponse.json() as Dogovor[]
        const row = rows.find((item) => item.id === rowId)
        if (!row) throw new Error('Первичный документ не найден')
        const dogovor = dogovors.find((item) => item.GN_dgv_id === row.contractId)
        const value = row.personalAccount || (dogovor && personalAccountOptions(dogovor.GN_dogovor_personal_account ?? '').length === 0 ? 'НЕТ' : '')
        if (active) setAccount(value)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить лицевой счёт')
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadAccount()
    return () => {
      active = false
      fileRequestRef.current += 1
    }
  }, [rowId])

  async function loadFile(selected: File | null): Promise<void> {
    const request = ++fileRequestRef.current
    setFile(null)
    setFileError(null)
    setReadingFile(false)
    if (!selected) return
    if (!selected.name.toLowerCase().endsWith('.xml')) {
      setFileError('Выберите файл с расширением .xml')
      return
    }
    setReadingFile(true)
    try {
      const data = await selected.arrayBuffer()
      if (request === fileRequestRef.current) setFile({ name: selected.name, data })
    } catch (readError) {
      if (request === fileRequestRef.current) {
        setFileError(readError instanceof Error ? readError.message : 'Не удалось прочитать файл')
      }
    } finally {
      if (request === fileRequestRef.current) setReadingFile(false)
    }
  }

  return (
    <main className="primary-page">
      <section className="page-section">
        <div className="page-header">
          <h1>Расчёт детализации</h1>
          <button type="button" className="page-action-btn page-action-btn--secondary" onClick={() => window.close()}>
            Закрыть
          </button>
        </div>
        {loading && <p className="hint">Загрузка лицевого счёта...</p>}
        {error && <p className="hint hint--error" role="alert">{error}</p>}
        {!loading && !error && (
          <>
            <p><strong>Лицевой счёт:</strong> {account || 'Не указан'}</p>
            <div className="form-field">
              <label className="form-field-label" htmlFor="primary-detail-xml">Выберите XML-файл</label>
              <input
                id="primary-detail-xml"
                type="file"
                accept=".xml,application/xml,text/xml"
                onChange={(event) => void loadFile(event.target.files?.[0] ?? null)}
              />
            </div>
            {fileError && <p className="hint hint--error" role="alert">{fileError}</p>}
            {readingFile && <p className="hint">Чтение файла...</p>}
            {file && <p className="hint">Файл загружен в окно: {file.name} ({file.data.byteLength} байт)</p>}
            <p className="hint">Обработка XML и расчёт будут добавлены после определения правил. Файл пока не сохраняется и не отправляется на сервер.</p>
          </>
        )}
      </section>
    </main>
  )
}
