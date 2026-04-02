import { useEffect, useState } from 'react'
import './styles.css'

const DETAIL_COLUMNS = ['код ПЭО', 'Код МТР', 'ПЗП', 'отчет агента', 'АП', 'Спецификация', 'Ввод в эксплуатацию', 'Учёт ИТ'] as const
const SED_COLUMNS = ['СЭД СПЕЦ', 'СЭД отчет агента', 'Состояние'] as const
const COST_COLUMNS = ['реальная цена без НДС за шт', 'реальная сумма без НДС + агентские цена без НДС', 'Сумма без НДС'] as const

const INVEST_TABLE_COLUMNS = [
  'ПФ/НПФ',
  'Наименование',
  'Кол-во',
  'ОКДП ТКО для ИС ПРИТ',
  'поставщик',
  'Огрузочный реквизит',
  'Статус',
  'оплата',
  'в бюджете',
]

const OKDP_COLUMN = 'ОКДП ТКО для ИС ПРИТ'
const OGRUZ_COLUMN = 'Огрузочный реквизит'
const SUPPLIER_COLUMN = 'поставщик'
const PF_NPF_COLUMN = 'ПФ/НПФ'
const NAME_COLUMN = 'Наименование'
const MAIN_TEXT_EDIT_COLUMNS = new Set(['Кол-во', 'Статус', 'оплата', 'в бюджете'])

const EQUIPMENT_MODELS = [
  'Маршрутизатор Cisco ISR 4331',
  'Коммутатор Huawei S5735-L24T4X',
  'Точка доступа Ubiquiti UniFi U6-Pro',
  'IP-телефон Yealink SIP-T54W',
  'Радиомодем Eltex WOP-2ac-LR5',
]

type LookupOption = { value: string; label: string }
type InvestRow = Record<string, string>

function buildInitialRows(count: number): InvestRow[] {
  return Array.from({ length: count }, () =>
    Object.fromEntries([...INVEST_TABLE_COLUMNS, ...DETAIL_COLUMNS].map((column) => [column, '-'])) as InvestRow
  ).map((row, index) => ({
    ...row,
    'код ПЭО': `ПЭО-${String(index + 1).padStart(3, '0')}`,
    [NAME_COLUMN]: EQUIPMENT_MODELS[index % EQUIPMENT_MODELS.length],
    'Кол-во': String((index % 3) + 1),
    'Код МТР': `MTR-${1000 + index}`,
    'ПЗП': `ПЗП-${index + 1}`,
    'отчет агента': `Агент-${index + 1}`,
    'АП': `АП-${index + 1}`,
    'Спецификация': `СП-${100 + index}`,
    'Ввод в эксплуатацию': `Q${(index % 4) + 1} 2027`,
    'Учёт ИТ': index % 2 === 0 ? 'Да' : 'Нет',
  }))
}

function mapLookupOptions(
  rows: Array<Record<string, unknown>>,
  valueKey: string,
  labelKey: string
): LookupOption[] {
  return rows.map((row) => {
    const value = String(row[valueKey] ?? '')
    const label = String(row[labelKey] ?? '')
    return { value, label }
  })
}

export default function InvestProgramTablePage() {
  const [rows, setRows] = useState<InvestRow[]>(() => buildInitialRows(5))
  const [okdpOptions, setOkdpOptions] = useState<LookupOption[]>([])
  const [ogruzOptions, setOgruzOptions] = useState<LookupOption[]>([])
  const [contractorOptions, setContractorOptions] = useState<LookupOption[]>([])
  const [departmentOptions, setDepartmentOptions] = useState<LookupOption[]>([])
  const [loadingLookups, setLoadingLookups] = useState(true)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [activePopupRowIndex, setActivePopupRowIndex] = useState<number | null>(null)
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null)
  const [editingRowDraft, setEditingRowDraft] = useState<InvestRow | null>(null)

  useEffect(() => {
    async function loadLookups(): Promise<void> {
      setLoadingLookups(true)
      setLookupError(null)

      try {
        const [okdpRes, ogruzRes, contractorRes, departmentRes] = await Promise.all([
          fetch('/api/gn/invest-okdp-tko-is-prit'),
          fetch('/api/gn/invest-ogruz-rekvizit'),
          fetch('/api/gn/contractors'),
          fetch('/api/gn/departments'),
        ])

        if (!okdpRes.ok) throw new Error(`HTTP ${okdpRes.status}`)
        if (!ogruzRes.ok) throw new Error(`HTTP ${ogruzRes.status}`)
        if (!contractorRes.ok) throw new Error(`HTTP ${contractorRes.status}`)
        if (!departmentRes.ok) throw new Error(`HTTP ${departmentRes.status}`)

        const okdpRows = (await okdpRes.json()) as Array<Record<string, unknown>>
        const ogruzRows = (await ogruzRes.json()) as Array<Record<string, unknown>>
        const contractorRows = (await contractorRes.json()) as Array<Record<string, unknown>>
        const departmentRows = (await departmentRes.json()) as Array<Record<string, unknown>>

        const nextOkdpOptions = mapLookupOptions(
          okdpRows,
          'GN_invest_okdp_tko_is_prit_id',
          'GN_invest_okdp_tko_is_prit'
        )

        const nextOgruzOptions = mapLookupOptions(
          ogruzRows,
          'GN_invest_ogruz_rekvizit_id',
          'GN_invest_ogruz_rekvizit'
        )

        const nextContractorOptions = mapLookupOptions(
          contractorRows,
          'GN_c_id',
          'GN_contarctor'
        )

        const nextDepartmentOptions = mapLookupOptions(
          departmentRows,
          'GN_Dep_id',
          'GN_department'
        )

        setOkdpOptions(nextOkdpOptions)
        setOgruzOptions(nextOgruzOptions)
        setContractorOptions(nextContractorOptions)
        setDepartmentOptions(nextDepartmentOptions)

        setRows((prevRows) =>
          prevRows.map((row, index) => ({
            ...row,
            [OKDP_COLUMN]: nextOkdpOptions[index % Math.max(nextOkdpOptions.length, 1)]?.value ?? '-',
            [OGRUZ_COLUMN]: nextOgruzOptions[index % Math.max(nextOgruzOptions.length, 1)]?.value ?? '-',
            [SUPPLIER_COLUMN]: nextContractorOptions[index % Math.max(nextContractorOptions.length, 1)]?.value ?? '-',
            [PF_NPF_COLUMN]: nextDepartmentOptions[index % Math.max(nextDepartmentOptions.length, 1)]?.value ?? '-',
          }))
        )
      } catch (err) {
        setLookupError(err instanceof Error ? err.message : 'Не удалось загрузить справочники')
      } finally {
        setLoadingLookups(false)
      }
    }

    void loadLookups()
  }, [])

  function updateCell(rowIndex: number, column: string, nextValue: string): void {
    setRows((prevRows) =>
      prevRows.map((row, index) => (index === rowIndex ? { ...row, [column]: nextValue } : row))
    )
  }

  function startRowEdit(rowIndex: number): void {
    setEditingRowIndex(rowIndex)
    setEditingRowDraft({ ...rows[rowIndex] })
  }

  function cancelRowEdit(): void {
    setEditingRowIndex(null)
    setEditingRowDraft(null)
  }

  function saveRowEdit(): void {
    if (editingRowIndex == null || editingRowDraft == null) return

    setRows((prevRows) =>
      prevRows.map((row, index) => (index === editingRowIndex ? { ...editingRowDraft } : row))
    )

    cancelRowEdit()
  }

  function updateDraftCell(column: string, nextValue: string): void {
    setEditingRowDraft((prevRow) => (prevRow ? { ...prevRow, [column]: nextValue } : prevRow))
  }

  function activePopupRow(): InvestRow | null {
    if (activePopupRowIndex == null) return null
    return rows[activePopupRowIndex] ?? null
  }

  const popupRow = activePopupRow()

  return (
    <section className="guide invest-program-section">
      <div className="guide-section invest-program-content">
        <h2>Инвест.программа: таблица</h2>
        {loadingLookups && <p className="hint">Загрузка справочников...</p>}
        {lookupError && <p className="hint hint--error">Ошибка: {lookupError}</p>}

        <div className="guide-table-wrap invest-program-table-wrap">
          <table className="guide-table table-compact invest-program-table-min">
            <thead>
              <tr>
                <th>№</th>
                {INVEST_TABLE_COLUMNS.map((column) => (
                  <th key={column}>{column}</th>
                ))}
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  <td className="invest-program-row-number">{rowIndex + 1}</td>
                  {INVEST_TABLE_COLUMNS.map((column) => {
                    const isEditingRow = editingRowIndex === rowIndex && editingRowDraft != null
                    const cellValue = isEditingRow ? editingRowDraft[column] : row[column]

                    if (column === NAME_COLUMN) {
                      return (
                        <td key={`${column}-${rowIndex}`}>
                          {isEditingRow ? (
                            <div className="invest-program-name-cell">
                              <input
                                className="invest-program-inline-input invest-program-inline-input--name"
                                value={cellValue}
                                onChange={(event) => updateDraftCell(column, event.target.value)}
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="invest-program-name-link"
                              onClick={() => setActivePopupRowIndex(rowIndex)}
                            >
                              {cellValue}
                            </button>
                          )}
                        </td>
                      )
                    }

                    if (column === OKDP_COLUMN) {
                      return (
                        <td key={`${column}-${rowIndex}`}>
                          {isEditingRow ? (
                            <select
                              className="invest-program-cell-select"
                              value={cellValue}
                              onChange={(event) => updateDraftCell(column, event.target.value)}
                              disabled={loadingLookups || okdpOptions.length === 0}
                            >
                              {okdpOptions.length === 0 ? (
                                <option value="-">-</option>
                              ) : (
                                okdpOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))
                              )}
                            </select>
                          ) : (
                            <span className="invest-program-cell-text">{cellValue}</span>
                          )}
                        </td>
                      )
                    }

                    if (column === OGRUZ_COLUMN) {
                      return (
                        <td key={`${column}-${rowIndex}`}>
                          {isEditingRow ? (
                            <select
                              className="invest-program-cell-select"
                              value={cellValue}
                              onChange={(event) => updateDraftCell(column, event.target.value)}
                              disabled={loadingLookups || ogruzOptions.length === 0}
                            >
                              {ogruzOptions.length === 0 ? (
                                <option value="-">-</option>
                              ) : (
                                ogruzOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))
                              )}
                            </select>
                          ) : (
                            <span className="invest-program-cell-text">{cellValue}</span>
                          )}
                        </td>
                      )
                    }

                    if (column === SUPPLIER_COLUMN) {
                      return (
                        <td key={`${column}-${rowIndex}`}>
                          {isEditingRow ? (
                            <select
                              className="invest-program-cell-select"
                              value={cellValue}
                              onChange={(event) => updateDraftCell(column, event.target.value)}
                              disabled={loadingLookups || contractorOptions.length === 0}
                            >
                              {contractorOptions.length === 0 ? (
                                <option value="-">-</option>
                              ) : (
                                contractorOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))
                              )}
                            </select>
                          ) : (
                            <span className="invest-program-cell-text">{cellValue}</span>
                          )}
                        </td>
                      )
                    }

                    if (column === PF_NPF_COLUMN) {
                      return (
                        <td key={`${column}-${rowIndex}`}>
                          {isEditingRow ? (
                            <select
                              className="invest-program-cell-select"
                              value={cellValue}
                              onChange={(event) => updateDraftCell(column, event.target.value)}
                              disabled={loadingLookups || departmentOptions.length === 0}
                            >
                              {departmentOptions.length === 0 ? (
                                <option value="-">-</option>
                              ) : (
                                departmentOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))
                              )}
                            </select>
                          ) : (
                            <span className="invest-program-cell-text">{cellValue}</span>
                          )}
                        </td>
                      )
                    }

                    if (MAIN_TEXT_EDIT_COLUMNS.has(column)) {
                      return (
                        <td key={`${column}-${rowIndex}`}>
                          {isEditingRow ? (
                            <input
                              className="invest-program-inline-input"
                              value={cellValue}
                              onChange={(event) => updateDraftCell(column, event.target.value)}
                            />
                          ) : (
                            <span className="invest-program-cell-text">{cellValue}</span>
                          )}
                        </td>
                      )
                    }

                    return (
                      <td key={`${column}-${rowIndex}`}>
                        <span className="invest-program-cell-text">{cellValue}</span>
                      </td>
                    )
                  })}
                  <td className="invest-program-actions-cell">
                    {editingRowIndex === rowIndex ? (
                      <>
                        <button type="button" className="invest-program-row-action-button" onClick={saveRowEdit}>
                          СОХР
                        </button>
                        <button
                          type="button"
                          className="invest-program-row-action-button invest-program-row-action-button--secondary"
                          onClick={cancelRowEdit}
                        >
                          ОТМ
                        </button>
                      </>
                    ) : (
                      <button type="button" className="invest-program-row-action-button" onClick={() => startRowEdit(rowIndex)}>
                        ИЗМ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {popupRow && activePopupRowIndex != null && (
          <div className="invest-popup-backdrop" onClick={() => setActivePopupRowIndex(null)}>
            <div className="invest-popup-card" onClick={(event) => event.stopPropagation()}>
              <h3>Детали по позиции: {popupRow[NAME_COLUMN]}</h3>

              <div className="invest-popup-grid">
                {DETAIL_COLUMNS.map((column) => (
                  <label key={column} className="invest-popup-field">
                    <span>{column}</span>
                    <input
                      value={popupRow[column]}
                      onChange={(event) => updateCell(activePopupRowIndex, column, event.target.value)}
                    />
                  </label>
                ))}

                <div className="invest-popup-group">
                  <h4>СЭД</h4>
                  <div className="invest-popup-grid invest-popup-grid--grouped">
                    {SED_COLUMNS.map((column) => (
                      <label key={column} className="invest-popup-field">
                        <span>{column}</span>
                        <input
                          value={popupRow[column]}
                          onChange={(event) => updateCell(activePopupRowIndex, column, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="invest-popup-group">
                  <h4>СТОИМОСТЬ</h4>
                  <div className="invest-popup-grid invest-popup-grid--grouped">
                    {COST_COLUMNS.map((column) => (
                      <label key={column} className="invest-popup-field">
                        <span>{column}</span>
                        <input
                          value={popupRow[column]}
                          onChange={(event) => updateCell(activePopupRowIndex, column, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="invest-popup-actions">
                <button
                  type="button"
                  className="invest-popup-close"
                  onClick={() => setActivePopupRowIndex(null)}
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}