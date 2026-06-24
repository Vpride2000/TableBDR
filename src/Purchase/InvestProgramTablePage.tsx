import { useEffect, useState } from 'react'
import { formatHttpError, formatErrorMessage } from '../utils/forecastUtils'
import { EquipmentPurchaseTable } from './EquipmentPurchaseTable'

// Страница инвестпрограммы.
// Генерирует демонстрационную таблицу с инвестиционными позициями,
// подгружает справочники для выпадающих списков и поддерживает редактирование.
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

type LookupOption = { value: string; label: string }
type InvestRow = Record<string, string>

/**
 * Преобразует массив строк справочника в список опций для select.
 * @param rows - данные справочника с полями-ключами
 * @param valueKey - ключ поля, которое используется как value
 * @param labelKey - ключ поля, которое используется как метка
 * @returns список опций вида { value, label }
 */
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

/**
 * Возвращает метку опции справочника по ее идентификатору.
 * Если значение не найдено, возвращает оригинальный текст.
 */
function getLookupLabel(options: LookupOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value
}

export default function InvestProgramTablePage() {
  // Основные строки таблицы инвестпрограммы.
  const [rows, setRows] = useState<InvestRow[]>([])
  // Опции справочников для выпадающих списков.
  const [okdpOptions, setOkdpOptions] = useState<LookupOption[]>([])
  const [ogruzOptions, setOgruzOptions] = useState<LookupOption[]>([])
  const [contractorOptions, setContractorOptions] = useState<LookupOption[]>([])
  const [departmentOptions, setDepartmentOptions] = useState<LookupOption[]>([])
  // Статусы загрузки и ошибки для основной таблицы и для справочников.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingLookups, setLoadingLookups] = useState(true)
  const [lookupError, setLookupError] = useState<string | null>(null)
  // Индексы для всплывающего окна деталей и редактирования строки.
  const [activePopupRowIndex, setActivePopupRowIndex] = useState<number | null>(null)
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null)
  const [editingRowDraft, setEditingRowDraft] = useState<InvestRow | null>(null)

  useEffect(() => {
    /**
     * Загружает данные инвестпрограммы из API и формирует строки таблицы.
     * Устанавливает состояние загрузки и отображает ошибки при неудаче.
     */
    async function loadInvestProgram(): Promise<void> {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/gn/invest-program')
        if (!response.ok) throw new Error(formatHttpError(response.status))
        const data = (await response.json()) as Record<string, unknown>[]

        const mappedRows: InvestRow[] = data.map((row) => ({
          'ПФ/НПФ': String(row.GN_invest_pf_npf ?? ''),
          'Наименование': String(row.GN_invest_name ?? ''),
          'Кол-во': String(row.GN_invest_quantity ?? ''),
          'ОКДП ТКО для ИС ПРИТ': String(row.GN_invest_okdp ?? ''),
          'поставщик': String(row.GN_invest_supplier ?? ''),
          'Огрузочный реквизит': String(row.GN_invest_ogruz ?? ''),
          'Статус': String(row.GN_invest_status ?? ''),
          'оплата': String(row.GN_invest_payment ?? ''),
          'в бюджете': String(row.GN_invest_in_budget ?? ''),
          'код ПЭО': String(row.GN_invest_peo_code ?? ''),
          'Код МТР': String(row.GN_invest_mtr_code ?? ''),
          'ПЗП': String(row.GN_invest_pzp ?? ''),
          'отчет агента': String(row.GN_invest_agent_report ?? ''),
          'АП': String(row.GN_invest_ap ?? ''),
          'Спецификация': String(row.GN_invest_spec ?? ''),
          'Ввод в эксплуатацию': String(row.GN_invest_commissioning ?? ''),
          'Учёт ИТ': String(row.GN_invest_it_accounting ?? ''),
          'СЭД СПЕЦ': String(row.GN_invest_sed_spec ?? ''),
          'СЭД отчет агента': String(row.GN_invest_sed_agent_report ?? ''),
          'Состояние': String(row.GN_invest_state ?? ''),
          'реальная цена без НДС за шт': String(row.GN_invest_real_price_no_vat_per_unit ?? ''),
          'реальная сумма без НДС + агентские цена без НДС': String(row.GN_invest_real_sum_no_vat_plus_agent_no_vat ?? ''),
          'Сумма без НДС': String(row.GN_invest_sum_no_vat ?? ''),
        }))

        setRows(mappedRows)
      } catch (err) {
        setError(formatErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }

    void loadInvestProgram()
  }, [])

  useEffect(() => {
    /**
     * Загружает внешние справочники для селектов и обновляет строки значениями из них.
     * При отсутствии данных справочников показывает соответствующее сообщение.
     */
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

        if (!okdpRes.ok) throw new Error(formatHttpError(okdpRes.status))
        if (!ogruzRes.ok) throw new Error(formatHttpError(ogruzRes.status))
        if (!contractorRes.ok) throw new Error(formatHttpError(contractorRes.status))
        if (!departmentRes.ok) throw new Error(formatHttpError(departmentRes.status))

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

  /**
   * Обновляет значение ячейки в строке таблицы по индексу и названию колонки.
   */
  function updateCell(rowIndex: number, column: string, nextValue: string): void {
    setRows((prevRows) =>
      prevRows.map((row, index) => (index === rowIndex ? { ...row, [column]: nextValue } : row))
    )
  }

  /**
   * Устанавливает строку для редактирования и копирует её данные в черновик.
   */
  function startRowEdit(rowIndex: number): void {
    setEditingRowIndex(rowIndex)
    setEditingRowDraft({ ...rows[rowIndex] })
  }

  /**
   * Отменяет редактирование текущей строки и сбрасывает состояние черновика.
   */
  function cancelRowEdit(): void {
    setEditingRowIndex(null)
    setEditingRowDraft(null)
  }

  /**
   * Сохраняет изменения из черновика в основную таблицу и завершает режим редактирования.
   */
  function saveRowEdit(): void {
    if (editingRowIndex == null || editingRowDraft == null) return

    setRows((prevRows) =>
      prevRows.map((row, index) => (index === editingRowIndex ? { ...editingRowDraft } : row))
    )

    cancelRowEdit()
  }

  /**
   * Обновляет значение в черновике редактируемой строки.
   */
  function updateDraftCell(column: string, nextValue: string): void {
    setEditingRowDraft((prevRow) => (prevRow ? { ...prevRow, [column]: nextValue } : prevRow))
  }

  /**
   * Возвращает текущую строку, выбранную для просмотра деталей в попапе.
   */
  function activePopupRow(): InvestRow | null {
    if (activePopupRowIndex == null) return null
    return rows[activePopupRowIndex] ?? null
  }

  const popupRow = activePopupRow()

  return (
    <>
      <section className="guide invest-program">
        <div className="guide-section">
          <h2>Инвест.программа: таблица</h2>
          {loading && <p className="hint">Загрузка данных...</p>}
          {error && <p className="hint hint--error">Ошибка: {error}</p>}
          {loadingLookups && <p className="hint">Загрузка справочников...</p>}
          {lookupError && <p className="hint hint--error">Ошибка: {lookupError}</p>}

          {!loading && !error && (
            <div className="guide-table-wrap">
            <table className="guide-table table-compact">
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
                            <input
                              className="invest-program-field invest-program-field--name"
                              value={cellValue}
                              onChange={(event) => updateDraftCell(column, event.target.value)}
                            />
                          ) : (
                            <button
                              type="button"
                              className="contract-cell-button"
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
                              className="invest-program-field"
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
                            <span className="invest-program-cell-text">
                              {getLookupLabel(okdpOptions, String(cellValue))}
                            </span>
                          )}
                        </td>
                      )
                    }

                    if (column === OGRUZ_COLUMN) {
                      return (
                        <td key={`${column}-${rowIndex}`}>
                          {isEditingRow ? (
                            <select
                              className="invest-program-field"
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
                            <span className="invest-program-cell-text">
                              {getLookupLabel(ogruzOptions, String(cellValue))}
                            </span>
                          )}
                        </td>
                      )
                    }

                    if (column === SUPPLIER_COLUMN) {
                      return (
                        <td key={`${column}-${rowIndex}`}>
                          {isEditingRow ? (
                            <select
                              className="invest-program-field"
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
                            <span className="invest-program-cell-text">
                              {getLookupLabel(contractorOptions, String(cellValue))}
                            </span>
                          )}
                        </td>
                      )
                    }

                    if (column === PF_NPF_COLUMN) {
                      return (
                        <td key={`${column}-${rowIndex}`}>
                          {isEditingRow ? (
                            <select
                              className="invest-program-field"
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
                            <span className="invest-program-cell-text">
                              {getLookupLabel(departmentOptions, String(cellValue))}
                            </span>
                          )}
                        </td>
                      )
                    }

                    if (MAIN_TEXT_EDIT_COLUMNS.has(column)) {
                      return (
                        <td key={`${column}-${rowIndex}`}>
                          {isEditingRow ? (
                            <input
                            className="invest-program-field"
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
        )}

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
        </section>
        <EquipmentPurchaseTable />
      </>
    )
  }