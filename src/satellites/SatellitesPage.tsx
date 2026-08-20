import { useState } from 'react'

type IridiumRow = {
  number: string
  imei: string
  contractNumber: string
  contractHolder: string
  expenseHolder: string
  location: string
}

const IRIDIUM_COLUMNS: Array<{ key: keyof IridiumRow; label: string }> = [
  { key: 'number', label: 'НОМЕР' },
  { key: 'imei', label: 'IMEI телефона' },
  { key: 'contractNumber', label: 'Договор' },
  { key: 'contractHolder', label: 'На кого договор' },
  { key: 'expenseHolder', label: 'На кого расход' },
  { key: 'location', label: 'Месторасположение' },
]

function createEmptyIridiumRows(count: number): IridiumRow[] {
  return Array.from({ length: count }, () => ({
    number: '',
    imei: '',
    contractNumber: '',
    contractHolder: '',
    expenseHolder: '',
    location: '',
  }))
}

function GksSection() {
  function openControlWindow(): void {
    const popupUrl = `${window.location.pathname}#satellites-control`
    const popup = window.open(
      popupUrl,
      'satellites-control-window',
      'popup=yes,width=1180,height=760,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  return (
    <div>
      <p className="hint">Раздел временно содержит только переход в подраздел Контроль.</p>

      <div className="satellites-control-action">
        <button className="page-action-btn page-action-btn--secondary" type="button" onClick={openControlWindow}>
          Контроль
        </button>
      </div>
    </div>
  )
}

function IridiumSection() {
  const [rows, setRows] = useState<IridiumRow[]>(() => createEmptyIridiumRows(10))

  function updateCell(rowIndex: number, key: keyof IridiumRow, value: string): void {
    setRows((prev) => prev.map((row, index) => (index === rowIndex ? { ...row, [key]: value } : row)))
  }

  return (
    <div className="guide-table-wrap">
      <table className="guide-table table-compact">
        <thead>
          <tr>
            <th>№</th>
            {IRIDIUM_COLUMNS.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td>{rowIndex + 1}</td>
              {IRIDIUM_COLUMNS.map((column) => (
                <td key={column.key}>
                  <input
                    value={row[column.key]}
                    onChange={(event) => updateCell(rowIndex, column.key, event.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SatellitesPage() {
  const [activeTab, setActiveTab] = useState<'gks' | 'iridium'>('gks')

  return (
    <section className="page-section satellites-section">
      <div className="page-header">
        <h1>Спутники</h1>
      </div>

      <div className="budget-subnav">
        <button
          type="button"
          className={`budget-subnav-tab${activeTab === 'gks' ? ' budget-subnav-tab--active' : ''}`}
          onClick={() => setActiveTab('gks')}
        >
          ГКС
        </button>
        <button
          type="button"
          className={`budget-subnav-tab${activeTab === 'iridium' ? ' budget-subnav-tab--active' : ''}`}
          onClick={() => setActiveTab('iridium')}
        >
          Иридиум
        </button>
      </div>

      {activeTab === 'gks' && <GksSection />}
      {activeTab === 'iridium' && <IridiumSection />}
    </section>
  )
}
