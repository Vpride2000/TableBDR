import { Fragment, useEffect, useState } from 'react'
import './styles.css'
import { formatHttpError } from './utils/forecastUtils'

// Страница управления договорами.
// Загружает справочники, отображает список договоров и позволяет сохранять изменения.
type Row = Record<string, unknown>
type LookupOption = { value: string; label: string }

type ContractRow = {
  GN_contract_id: number
  GN_contract_contractor_FK: number
  GN_contract_dogovor_FK: number
  GN_contract_sed_launch_date: string
  GN_contract_asez_load_date: string
  GN_contract_state: string
  GN_contract_status_updated_at: string
  GN_contract_approval_status?: string
}

type ContractAgreement = {
  GN_additional_agreement_id: number
  GN_contract_id_FK: number
  GN_additional_agreement_number: string
  GN_additional_agreement_date: string
  GN_additional_agreement_description: string
  GN_additional_agreement_amount: number
  GN_additional_agreement_status?: string
}

const COLUMNS = [
  { key: 'GN_contract_contractor_FK', label: 'контрагент', kind: 'lookup' as const },
  { key: 'GN_contract_dogovor_FK', label: 'договор', kind: 'lookup' as const },
  { key: 'GN_contract_sed_launch_date', label: 'дата запуска в СЭД', kind: 'date' as const },
  { key: 'GN_contract_asez_load_date', label: 'дата загрузки в АСЭЗ', kind: 'date' as const },
  { key: 'GN_contract_state', label: 'состояние', kind: 'text' as const },
  { key: 'GN_contract_status_updated_at', label: 'дата обновления статуса', kind: 'date' as const },
  { key: 'GN_contract_approval_status', label: 'статус', kind: 'status' as const },
]

function mapLookupOptions(rows: Row[], valueKey: string, labelKey: string): LookupOption[] {
  return rows.map((row) => ({
    value: String(row[valueKey] ?? ''),
    label: String(row[labelKey] ?? ''),
  }))
}

function toRow(data: Row): ContractRow {
  return {
    GN_contract_id: Number(data.GN_contract_id ?? 0),
    GN_contract_contractor_FK: Number(data.GN_contract_contractor_FK ?? 0),
    GN_contract_dogovor_FK: Number(data.GN_contract_dogovor_FK ?? 0),
    GN_contract_sed_launch_date: normalizeDateValue(data.GN_contract_sed_launch_date),
    GN_contract_asez_load_date: normalizeDateValue(data.GN_contract_asez_load_date),
    GN_contract_state: String(data.GN_contract_state ?? ''),
    GN_contract_status_updated_at: normalizeDateValue(data.GN_contract_status_updated_at),
    GN_contract_approval_status: String(data.GN_contract_approval_status ?? 'действующий'),
  }
}

function displayLookupLabel(options: LookupOption[], value: unknown): string {
  const normalizedValue = String(value ?? '')
  return options.find((option) => option.value === normalizedValue)?.label ?? normalizedValue
}

function normalizeDateValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  const normalizedValue = String(value ?? '')
  if (normalizedValue === '') return ''
  return normalizedValue.length >= 10 ? normalizedValue.slice(0, 10) : normalizedValue
}

export default function ContractsPage({ onOpenContract }: { onOpenContract: (contractName: string) => void }) {
  const [rows, setRows] = useState<ContractRow[]>([])
  const [contractorOptions, setContractorOptions] = useState<LookupOption[]>([])
  const [dogovorOptions, setDogovorOptions] = useState<LookupOption[]>([])
  const [agreementsByContract, setAgreementsByContract] = useState<Record<number, ContractAgreement[]>>({})
  const [expandedContracts, setExpandedContracts] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null)
  const [draftRow, setDraftRow] = useState<ContractRow | null>(null)

  useEffect(() => {
    async function load(): Promise<void> {
      setLoading(true)
      setError(null)

      try {
        const [rowsRes, contractorRes, dogovorRes, agreementsRes] = await Promise.all([
          fetch('/api/gn/contracts'),
          fetch('/api/gn/contractors'),
          fetch('/api/gn/dogovors'),
          fetch('/api/gn/contract-additional-agreements'),
        ])

        if (!rowsRes.ok) throw new Error(formatHttpError(rowsRes.status))
        if (!contractorRes.ok) throw new Error(formatHttpError(contractorRes.status))
        if (!dogovorRes.ok) throw new Error(formatHttpError(dogovorRes.status))
        if (!agreementsRes.ok) throw new Error(formatHttpError(agreementsRes.status))

        const nextRows = (await rowsRes.json()) as Row[]
        const contractors = (await contractorRes.json()) as Row[]
        const dogovors = (await dogovorRes.json()) as Row[]
        const agreements = (await agreementsRes.json()) as ContractAgreement[]

        const groupedAgreements: Record<number, ContractAgreement[]> = {}
        agreements.forEach((agreement) => {
          const contractId = Number(agreement.GN_contract_id_FK)
          if (!groupedAgreements[contractId]) groupedAgreements[contractId] = []
          groupedAgreements[contractId].push(agreement)
        })

        setRows(nextRows.map(toRow))
        setContractorOptions(mapLookupOptions(contractors, 'GN_c_id', 'GN_contarctor'))
        setDogovorOptions(mapLookupOptions(dogovors, 'GN_dgv_id', 'GN_dogovor'))
        setAgreementsByContract(groupedAgreements)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить данные')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  function startEdit(rowIndex: number): void {
    setEditingRowIndex(rowIndex)
    setDraftRow({ ...rows[rowIndex] })
    setSaveError(null)
  }

  function cancelEdit(): void {
    setEditingRowIndex(null)
    setDraftRow(null)
    setSaveError(null)
  }

  async function saveEdit(): Promise<void> {
    if (editingRowIndex == null || draftRow == null) return

    setSaveError(null)

    try {
      const response = await fetch(`/api/gn/contracts/${draftRow.GN_contract_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftRow),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || formatHttpError(response.status))
      }

      const updatedRow = toRow((await response.json()) as Row)
      setRows((prevRows) => prevRows.map((row, index) => (index === editingRowIndex ? updatedRow : row)))
      cancelEdit()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить изменения')
    }
  }

  function updateDraft(column: keyof ContractRow, value: string): void {
    setDraftRow((prevRow) => {
      if (!prevRow) return prevRow

      if (column === 'GN_contract_contractor_FK' || column === 'GN_contract_dogovor_FK') {
        return { ...prevRow, [column]: Number(value) }
      }

      return { ...prevRow, [column]: value }
    })
  }

  function getDraftValue(column: keyof ContractRow): string {
    if (!draftRow) return ''
    return String(draftRow[column] ?? '')
  }

  function toggleContractAgreements(contractId: number): void {
    setExpandedContracts((prev) => {
      const next = new Set(prev)
      if (next.has(contractId)) {
        next.delete(contractId)
      } else {
        next.add(contractId)
      }
      return next
    })
  }

  return (
    <section className="guide invest-program-section">
      <div className="guide-section invest-program-content">
        <h2>Договора</h2>
        {loading && <p className="hint">Загрузка данных...</p>}
        {error && <p className="hint hint--error">Ошибка: {error}</p>}
        {saveError && <p className="hint hint--error">Ошибка сохранения: {saveError}</p>}

        {!loading && !error && (
          <div className="guide-table-wrap invest-program-table-wrap">
            <table className="guide-table table-compact invest-program-table-min">
              <thead>
                <tr>
                  <th>№</th>
                  {COLUMNS.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => {
                  const isEditing = editingRowIndex === rowIndex && draftRow != null

                  return (
                    <Fragment key={`contract-block-${row.GN_contract_id}`}>
                      <tr key={`contract-${row.GN_contract_id}`}>
                    <td className="invest-program-row-number">{rowIndex + 1}</td>
                    {COLUMNS.map((column) => {
                        if (column.kind === 'lookup') {
                          const options = column.key === 'GN_contract_contractor_FK' ? contractorOptions : dogovorOptions
                          const value = isEditing ? getDraftValue(column.key as keyof ContractRow) : String(row[column.key as keyof ContractRow] ?? '')
                          return (
                            <td key={column.key}>
                              {isEditing ? (
                                <select
                                  className="invest-program-cell-select"
                                  value={value}
                                  onChange={(event) => updateDraft(column.key as keyof ContractRow, event.target.value)}
                                >
                                  {options.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              ) : column.key === 'GN_contract_dogovor_FK' ? (
                                <button
                                  type="button"
                                  className="contract-cell-button"
                                  onClick={() => onOpenContract(displayLookupLabel(options, row[column.key as keyof ContractRow]))}
                                >
                                  {displayLookupLabel(options, row[column.key as keyof ContractRow])}
                                </button>
                              ) : (
                                <span className="invest-program-cell-text">
                                  {displayLookupLabel(options, row[column.key as keyof ContractRow])}
                                </span>
                              )}
                            </td>
                          )
                        }

                        if (column.kind === 'date') {
                          const value = isEditing ? getDraftValue(column.key as keyof ContractRow) : String(row[column.key as keyof ContractRow] ?? '')
                          return (
                            <td key={column.key}>
                              {isEditing ? (
                                <input
                                  className="invest-program-inline-input"
                                  type="date"
                                  value={value}
                                  onChange={(event) => updateDraft(column.key as keyof ContractRow, event.target.value)}
                                />
                              ) : (
                                <span className="invest-program-cell-text">{value}</span>
                              )}
                            </td>
                          )
                        }

                        if (column.kind === 'status') {
                          const value = isEditing ? getDraftValue(column.key as keyof ContractRow) : String(row[column.key as keyof ContractRow] ?? 'действующий')
                          return (
                            <td key={column.key}>
                              {isEditing ? (
                                <select
                                  className="invest-program-cell-select"
                                  value={value}
                                  onChange={(event) => updateDraft(column.key as keyof ContractRow, event.target.value)}
                                >
                                  <option value="действующий">действующий</option>
                                  <option value="на согласовании">на согласовании</option>
                                </select>
                              ) : (
                                <span className="invest-program-cell-text">{value}</span>
                              )}
                            </td>
                          )
                        }

                        const value = isEditing ? getDraftValue(column.key as keyof ContractRow) : String(row[column.key as keyof ContractRow] ?? '')
                        return (
                          <td key={column.key}>
                            {isEditing ? (
                              <input
                                className="invest-program-inline-input"
                                value={value}
                                onChange={(event) => updateDraft(column.key as keyof ContractRow, event.target.value)}
                              />
                            ) : (
                              <span className="invest-program-cell-text">{value}</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="invest-program-actions-cell">
                        <button
                          type="button"
                          className="invest-program-row-action-button invest-program-row-action-button--secondary"
                          onClick={() => toggleContractAgreements(row.GN_contract_id)}
                        >
                          {expandedContracts.has(row.GN_contract_id) ? 'Скрыть доп.' : 'Показать доп.'}
                        </button>
                        {isEditing ? (
                          <>
                            <button type="button" className="invest-program-row-action-button" onClick={() => void saveEdit()}>
                              СОХР
                            </button>
                            <button
                              type="button"
                              className="invest-program-row-action-button invest-program-row-action-button--secondary"
                              onClick={cancelEdit}
                            >
                              ОТМ
                            </button>
                          </>
                        ) : (
                          <button type="button" className="invest-program-row-action-button" onClick={() => startEdit(rowIndex)}>
                            ИЗМ
                          </button>
                        )}
                      </td>
                    </tr>
                    {(() => {
                      const contractAgreements = agreementsByContract[row.GN_contract_id] ?? []
                      if (contractAgreements.length === 0 || !expandedContracts.has(row.GN_contract_id)) {
                        return null
                      }

                      return (
                        <tr key={`agreements-${row.GN_contract_id}`} className="contracts-agreements-row">
                          <td colSpan={8} className="contracts-agreements-cell">
                            <div className="contracts-agreements-nested">
                              <div className="contracts-agreements-title">Дополнительные соглашения</div>
                              <table className="guide-table table-compact contracts-agreements-table">
                                <thead>
                                  <tr>
                                    <th>Номер</th>
                                    <th>Дата</th>
                                    <th>Описание</th>
                                    <th>Сумма</th>
                                    <th>Статус</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {contractAgreements.map((agreement) => (
                                    <tr key={agreement.GN_additional_agreement_id}>
                                      <td>{agreement.GN_additional_agreement_number}</td>
                                      <td>{agreement.GN_additional_agreement_date}</td>
                                      <td>{agreement.GN_additional_agreement_description}</td>
                                      <td>{Number(agreement.GN_additional_agreement_amount).toLocaleString('ru-RU', {
                                        style: 'currency',
                                        currency: 'RUB',
                                      })}</td>
                                      <td>{agreement.GN_additional_agreement_status || 'действующий'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )
                    })()}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}