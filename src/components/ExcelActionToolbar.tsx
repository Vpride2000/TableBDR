import type { ChangeEvent } from 'react'

type ExcelActionToolbarProps = {
  onReset: () => void
  onAddRow?: () => void
  addRowDisabled?: boolean
  onExport: () => void
  onUpload?: (file: File) => void
  onHistory?: () => void
  historyCount?: number
  uploading?: boolean
  className?: string
  showUpload?: boolean
}

export default function ExcelActionToolbar({
  onReset,
  onAddRow,
  addRowDisabled = false,
  onExport,
  onUpload,
  onHistory,
  historyCount = 0,
  uploading = false,
  className = '',
  showUpload = true,
}: ExcelActionToolbarProps) {
  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onUpload?.(file)
  }

  return (
    <div className={`excel-action-toolbar ${className}`}>
      <button
        type="button"
        className="excel-action-toolbar__icon"
        onClick={onReset}
        title="Сбросить все фильтры"
        aria-label="Сбросить все фильтры"
      >
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="M4 6h18l-7 8v8l-4 2v-10z" fill="none" stroke="#0c4a6e" strokeLinejoin="round" strokeWidth="2" />
          <path d="m20 19 7 7m0-7-7 7" fill="none" stroke="#0c4a6e" strokeLinecap="round" strokeWidth="2" />
        </svg>
      </button>
      {onAddRow && (
        <button
          type="button"
          className="excel-action-toolbar__icon"
          onClick={onAddRow}
          disabled={addRowDisabled}
          title="Добавить новую строку"
          aria-label="Добавить новую строку"
        >
          <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <path d="M4 5h24v22H4zM4 12h24M4 19h24M12 5v22M20 5v22" fill="none" stroke="#14532d" strokeLinejoin="round" strokeWidth="1.8" />
            <path d="M24 3v8m-4-4h8" fill="none" stroke="#14532d" strokeLinecap="round" strokeWidth="2.4" />
          </svg>
        </button>
      )}
      {onHistory && (
        <button
          type="button"
          className="excel-action-toolbar__icon excel-action-toolbar__history"
          onClick={onHistory}
          title={`Журнал изменений (${historyCount})`}
          aria-label={`Открыть журнал изменений, записей: ${historyCount}`}
        >
          <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <path d="M8 4h16v24H8zM12 10h8m-8 5h8m-8 5h5" fill="none" stroke="#0c4a6e" strokeLinejoin="round" strokeLinecap="round" strokeWidth="2" />
            <path d="M4 10v6h6" fill="none" stroke="#0c4a6e" strokeLinejoin="round" strokeLinecap="round" strokeWidth="2" />
            <path d="M4.5 16a12 12 0 1 0 3-8" fill="none" stroke="#0c4a6e" strokeLinecap="round" strokeWidth="2" />
          </svg>
          {historyCount > 0 && <span className="excel-action-toolbar__history-count">{historyCount}</span>}
        </button>
      )}
      <button
        type="button"
        className="excel-action-toolbar__icon"
        onClick={onExport}
        title="Выгрузить в Excel"
        aria-label="Выгрузить в Excel"
      >
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path className="excel-action-toolbar__file" d="M17 2H7a2 2 0 0 0-2 2v24a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V10z" fill="#217346" />
          <path className="excel-action-toolbar__file-fold" d="M17 2v8h8" fill="#33A867" />
          <path d="m9 14 6 9m0-9-6 9" fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="2.5" />
          <path className="excel-action-toolbar__arrow" d="M23 14v11m-4-4 4 4 4-4" fill="none" stroke="#217346" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      </button>
      {showUpload && (
        <label
          className="excel-action-toolbar__icon"
          style={{ cursor: uploading ? 'default' : 'pointer' }}
          title={uploading ? 'Загрузка...' : 'Загрузить из Excel'}
          aria-label={uploading ? 'Загрузка...' : 'Загрузить из Excel'}
        >
          <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <path className="excel-action-toolbar__file" d="M17 2H7a2 2 0 0 0-2 2v24a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V10z" fill="#217346" />
            <path className="excel-action-toolbar__file-fold" d="M17 2v8h8" fill="#33A867" />
            <path d="m9 16 6 9m0-9-6 9" fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="2.5" />
            <path className="excel-action-toolbar__arrow" d="M23 26V15m-4 4 4-4 4 4" fill="none" stroke="#217346" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
          <input type="file" accept=".xlsx" hidden disabled={uploading} onChange={handleFileChange} />
        </label>
      )}
    </div>
  )
}