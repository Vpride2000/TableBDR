import type { ChangeEvent } from 'react'

type ExcelActionToolbarProps = {
  onReset: () => void
  onExport: () => void
  onUpload: (file: File) => void
  uploading: boolean
}

export default function ExcelActionToolbar({
  onReset,
  onExport,
  onUpload,
  uploading,
}: ExcelActionToolbarProps) {
  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onUpload(file)
  }

  return (
    <div className="excel-action-toolbar">
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
      <button
        type="button"
        className="excel-action-toolbar__icon"
        onClick={onExport}
        title="Выгрузить в Excel"
        aria-label="Выгрузить в Excel"
      >
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="M17 2H7a2 2 0 0 0-2 2v24a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V10z" fill="#217346" />
          <path d="M17 2v8h8" fill="#33A867" />
          <path d="m9 14 6 9m0-9-6 9" fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="2.5" />
          <path d="M23 14v11m-4-4 4 4 4-4" fill="none" stroke="#217346" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      </button>
      <label
        className="excel-action-toolbar__icon"
        style={{ cursor: uploading ? 'default' : 'pointer' }}
        title={uploading ? 'Загрузка...' : 'Загрузить из Excel'}
        aria-label={uploading ? 'Загрузка...' : 'Загрузить из Excel'}
      >
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="M17 2H7a2 2 0 0 0-2 2v24a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V10z" fill="#217346" />
          <path d="M17 2v8h8" fill="#33A867" />
          <path d="m9 16 6 9m0-9-6 9" fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="2.5" />
          <path d="M23 26V15m-4 4 4-4 4 4" fill="none" stroke="#217346" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
        <input type="file" accept=".xlsx" hidden disabled={uploading} onChange={handleFileChange} />
      </label>
    </div>
  )
}