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
  const [editingAgreementId, setEditingAgreementId] = useState<number | null>(null)
  const [draftAgreement, setDraftAgreement] = useState<ContractAgreement | null>(null)
  const [editingPendingDocId, setEditingPendingDocId] = useState<string | null>(null)
  const [draftPendingDoc, setDraftPendingDoc] = useState<{
    id: string
    type: 'contract' | 'agreement'
    number: string
    date: string
    description: string
    amount?: number
    contractName?: string
  } | null>(null)
  const [pendingDocuments, setPendingDocuments] = useState<Array<{
    id: string
    type: 'contract' | 'agreement'
    number: string
    date: string
    description: string
    amount?: number
    contractName?: string
  }>>([])

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

        // Filter documents pending approval
        const pendingDocs: Array<{
          id: string
          type: 'contract' | 'agreement'
          number: string
          date: string
          description: string
          amount?: number
          contractName?: string
        }> = []

        // Add contracts pending approval
        nextRows.forEach((contract) => {
          if (contract.GN_contract_approval_status === 'на согласовании') {
            const contractName = String(dogovors.find(d => d.GN_dgv_id === contract.GN_contract_dogovor_FK)?.GN_dogovor || '')
            pendingDocs.push({
              id: `contract-${contract.GN_contract_id}`,
              type: 'contract',
              number: contractName,
              date: String(contract.GN_contract_sed_launch_date || ''),
              description: `Договор: ${contractName}`,
              contractName,
            })
          }
        })

        // Add agreements pending approval
        agreements.forEach((agreement) => {
          if (agreement.GN_additional_agreement_status === 'на согласовании') {
            const contract = nextRows.find(c => c.GN_contract_id === agreement.GN_contract_id_FK)
            const contractName = String(dogovors.find(d => d.GN_dgv_id === contract?.GN_contract_dogovor_FK)?.GN_dogovor || '')
            pendingDocs.push({
              id: `agreement-${agreement.GN_additional_agreement_id}`,
              type: 'agreement',
              number: agreement.GN_additional_agreement_number,
              date: agreement.GN_additional_agreement_date,
              description: agreement.GN_additional_agreement_description,
              amount: agreement.GN_additional_agreement_amount,
              contractName,
            })
          }
        })

        setRows(nextRows.map(toRow))
        setContractorOptions(mapLookupOptions(contractors, 'GN_c_id', 'GN_contarctor'))
        setDogovorOptions(mapLookupOptions(dogovors, 'GN_dgv_id', 'GN_dogovor'))
        setAgreementsByContract(groupedAgreements)
        setPendingDocuments(pendingDocs)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить данные')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  // Update pending documents when data changes
  useEffect(() => {
    const pendingDocs: Array<{
      id: string
      type: 'contract' | 'agreement'
      number: string
      date: string
      description: string
      amount?: number
      contractName?: string
    }> = []

    // Add contracts pending approval
    rows.forEach((contract) => {
      if (contract.GN_contract_approval_status === 'на согласовании') {
        const contractName = dogovorOptions.find(d => d.value === String(contract.GN_contract_dogovor_FK))?.label || ''
        pendingDocs.push({
          id: `contract-${contract.GN_contract_id}`,
          type: 'contract',
          number: contractName,
          date: contract.GN_contract_sed_launch_date,
          description: `Договор: ${contractName}`,
          contractName,
        })
      }
    })

    // Add agreements pending approval
    Object.values(agreementsByContract).flat().forEach((agreement) => {
      if (agreement.GN_additional_agreement_status === 'на согласовании') {
        const contract = rows.find(c => c.GN_contract_id === agreement.GN_contract_id_FK)
        const contractName = dogovorOptions.find(d => d.value === String(contract?.GN_contract_dogovor_FK))?.label || ''
        pendingDocs.push({
          id: `agreement-${agreement.GN_additional_agreement_id}`,
          type: 'agreement',
          number: agreement.GN_additional_agreement_number,
          date: agreement.GN_additional_agreement_date,
          description: agreement.GN_additional_agreement_description,
          amount: agreement.GN_additional_agreement_amount,
          contractName,
        })
      }
    })

    setPendingDocuments(pendingDocs)
  }, [rows, agreementsByContract, dogovorOptions])

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

  function startEditAgreement(agreement: ContractAgreement): void {
    setEditingAgreementId(agreement.GN_additional_agreement_id)
    setDraftAgreement({ ...agreement })
    setSaveError(null)
  }

  function cancelAgreementEdit(): void {
    setEditingAgreementId(null)
    setDraftAgreement(null)
    setSaveError(null)
  }

  async function saveAgreementEdit(): Promise<void> {
    if (editingAgreementId == null || draftAgreement == null) return

    setSaveError(null)

    try {
      const response = await fetch(`/api/gn/contract-additional-agreements/${editingAgreementId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: draftAgreement.GN_contract_id_FK,
          number: draftAgreement.GN_additional_agreement_number,
          date: draftAgreement.GN_additional_agreement_date,
          description: draftAgreement.GN_additional_agreement_description,
          amount: draftAgreement.GN_additional_agreement_amount,
          approvalStatus: draftAgreement.GN_additional_agreement_status,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || formatHttpError(response.status))
      }

      const updatedAgreement = (await response.json()) as ContractAgreement
      setAgreementsByContract((prev) => ({
        ...prev,
        [updatedAgreement.GN_contract_id_FK]: (prev[updatedAgreement.GN_contract_id_FK] ?? []).map((agreement) =>
          agreement.GN_additional_agreement_id === editingAgreementId ? updatedAgreement : agreement
        ),
      }))
      cancelAgreementEdit()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить изменения')
    }
  }

  function updateAgreementDraft(field: keyof ContractAgreement, value: string | number): void {
    setDraftAgreement((prevAgreement) => {
      if (!prevAgreement) return prevAgreement

      if (field === 'GN_additional_agreement_amount') {
        return { ...prevAgreement, [field]: Number(value) }
      }

      return { ...prevAgreement, [field]: value }
    })
  }

  function getAgreementDraftValue(field: keyof ContractAgreement): string {
    if (!draftAgreement) return ''
    const value = draftAgreement[field]
    if (field === 'GN_additional_agreement_amount') {
      return String(value ?? 0)
    }
    if (field === 'GN_additional_agreement_date' && typeof value === 'string') {
      return value.slice(0, 10) // Extract date part
    }
    return String(value ?? '')
  }

  function handleEdit(doc: { id: string; type: 'contract' | 'agreement'; number: string; contractName?: string }): void {
    setEditingPendingDocId(doc.id)
    const docToEdit = pendingDocuments.find(d => d.id === doc.id)
    if (docToEdit) {
      setDraftPendingDoc({ ...docToEdit })
    }
    setSaveError(null)
  }

  function cancelPendingDocEdit(): void {
    setEditingPendingDocId(null)
    setDraftPendingDoc(null)
    setSaveError(null)
  }

  async function savePendingDocEdit(): Promise<void> {
    if (editingPendingDocId == null || draftPendingDoc == null) return

    setSaveError(null)

    try {
      // Determine the API endpoint and payload based on document type
      let endpoint: string
      let payload: any

      if (draftPendingDoc.type === 'contract') {
        // Find the contract by number
        const contract = rows.find(r => dogovorOptions.find(d => d.value === String(r.GN_contract_dogovor_FK))?.label === draftPendingDoc.number)
        if (!contract) throw new Error('Контракт не найден')

        endpoint = `/api/gn/contracts/${contract.GN_contract_id}`
        payload = {
          contractorId: contract.GN_contract_contractor_FK,
          dogovorId: contract.GN_contract_dogovor_FK,
          sedLaunchDate: draftPendingDoc.date,
          asezLoadDate: contract.GN_contract_asez_load_date,
          state: contract.GN_contract_state,
          statusUpdatedAt: contract.GN_contract_status_updated_at,
          approvalStatus: 'approved' // Change status to approved
        }
      } else {
        // Find the agreement by number
        const agreement = Object.values(agreementsByContract).flat().find(a => a.GN_additional_agreement_number === draftPendingDoc.number)
        if (!agreement) throw new Error('Дополнительное соглашение не найдено')

        endpoint = `/api/gn/contract-additional-agreements/${agreement.GN_additional_agreement_id}`
        payload = {
          contractId: agreement.GN_contract_id_FK,
          number: draftPendingDoc.number,
          date: draftPendingDoc.date,
          description: draftPendingDoc.description,
          amount: draftPendingDoc.amount,
          approvalStatus: 'approved' // Change status to approved
        }
      }

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || formatHttpError(response.status))
      }

      // Update the document status in pendingDocuments
      setPendingDocuments(prev => prev.filter(doc => doc.id !== editingPendingDocId))

      cancelPendingDocEdit()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить изменения')
    }
  }

  function updatePendingDocDraft(field: string, value: string | number): void {
    setDraftPendingDoc((prevDoc) => {
      if (!prevDoc) return prevDoc

      if (field === 'amount') {
        return { ...prevDoc, [field]: Number(value) }
      }

      return { ...prevDoc, [field]: value }
    })
  }

  function getPendingDocDraftValue(field: string): string {
    if (!draftPendingDoc) return ''
    const value = (draftPendingDoc as any)[field]
    if (field === 'amount') {
      return String(value ?? 0)
    }
    return String(value ?? '')
  }

  return (
    <section className="guide invest-program-section">
      <div className="guide-section invest-program-content">
        <h2>Договора</h2>
        {loading && <p className="hint">Загрузка данных...</p>}
        {error && <p className="hint hint--error">Ошибка: {error}</p>}
        {saveError && <p className="hint hint--error">Ошибка сохранения: {saveError}</p>}

        {!loading && !error && (
          <div>
            {/* Documents pending approval */}
            <div className="guide-table-wrap invest-program-table-wrap" style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', color: '#d97706' }}>Документы на согласовании</h3>
              <table className="guide-table table-compact invest-program-table-min">
                  <thead>
                    <tr>
                      <th>Тип</th>
                      <th>Номер</th>
                      <th>Дата</th>
                      <th>Описание</th>
                      <th>Сумма</th>
                      <th>Договор</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingDocuments.map((doc) => {
                      const isEditingDoc = editingPendingDocId === doc.id && draftPendingDoc != null
                      return (
                        <tr key={doc.id} style={{ backgroundColor: '#fef3c7' }}>
                          <td>
                            <span style={{
                              backgroundColor: doc.type === 'contract' ? '#fef3c7' : '#dbeafe',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.875rem',
                              fontWeight: '500'
                            }}>
                              {doc.type === 'contract' ? 'Договор' : 'Доп. соглашение'}
                            </span>
                          </td>
                          <td>
                            {isEditingDoc ? (
                              <input
                                type="text"
                                value={getPendingDocDraftValue('number')}
                                onChange={(e) => updatePendingDocDraft('number', e.target.value)}
                                className="guide-input"
                              />
                            ) : (
                              doc.number
                            )}
                          </td>
                          <td>
                            {isEditingDoc ? (
                              <input
                                type="date"
                                value={getPendingDocDraftValue('date')}
                                onChange={(e) => updatePendingDocDraft('date', e.target.value)}
                                className="guide-input"
                              />
                            ) : (
                              doc.date ? new Date(doc.date).toLocaleDateString('ru-RU') : ''
                            )}
                          </td>
                          <td>
                            {isEditingDoc ? (
                              <input
                                type="text"
                                value={getPendingDocDraftValue('description')}
                                onChange={(e) => updatePendingDocDraft('description', e.target.value)}
                                className="guide-input"
                              />
                            ) : (
                              doc.description
                            )}
                          </td>
                          <td>
                            {isEditingDoc ? (
                              <input
                                type="number"
                                value={getPendingDocDraftValue('amount')}
                                onChange={(e) => updatePendingDocDraft('amount', e.target.value)}
                                className="guide-input"
                              />
                            ) : (
                              doc.amount !== undefined ? Number(doc.amount).toLocaleString('ru-RU', {
                                style: 'currency',
                                currency: 'RUB',
                              }) : ''
                            )}
                          </td>
                          <td>{doc.contractName}</td>
                          <td>
                            {isEditingDoc ? (
                              <>
                                <button
                                  onClick={savePendingDocEdit}
                                  style={{
                                    backgroundColor: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    marginRight: '4px'
                                  }}
                                >
                                  Сохранить
                                </button>
                                <button
                                  onClick={cancelPendingDocEdit}
                                  style={{
                                    backgroundColor: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Отмена
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleEdit(doc)}
                                style={{
                                  backgroundColor: '#3b82f6',
                                  color: 'white',
                                  border: 'none',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  cursor: 'pointer'
                                }}
                              >
                                ИЗМ
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

            {/* Main contracts table */}
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
                          const statusValue = isEditing ? getDraftValue(column.key as keyof ContractRow) : String(row[column.key as keyof ContractRow] ?? 'действующий')
                          const bgColor = statusValue === 'на согласовании' ? '#fef3c7' : statusValue === 'действующий' ? '#dcfce7' : '#f3f4f6'
                          const textColor = statusValue === 'на согласовании' ? '#92400e' : statusValue === 'действующий' ? '#15803d' : '#6b7280'
                          return (
                            <td key={column.key} style={{ backgroundColor: bgColor }}>
                              {isEditing ? (
                                <select
                                  className="invest-program-cell-select"
                                  value={statusValue}
                                  onChange={(event) => updateDraft(column.key as keyof ContractRow, event.target.value)}
                                  style={{ backgroundColor: bgColor, color: textColor }}
                                >
                                  <option value="действующий">действующий</option>
                                  <option value="на согласовании">на согласовании</option>
                                </select>
                              ) : (
                                <span className="invest-program-cell-text" style={{ color: textColor, fontWeight: '500' }}>{statusValue}</span>
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
                          <td colSpan={9} className="contracts-agreements-cell">
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
                                    <th>Действия</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {contractAgreements.map((agreement) => {
                                    const isAgreementEditing = editingAgreementId === agreement.GN_additional_agreement_id && draftAgreement != null

                                    return (
                                      <tr key={agreement.GN_additional_agreement_id}>
                                        <td>
                                          {isAgreementEditing ? (
                                            <input
                                              className="invest-program-inline-input"
                                              value={getAgreementDraftValue('GN_additional_agreement_number')}
                                              onChange={(event) => updateAgreementDraft('GN_additional_agreement_number', event.target.value)}
                                            />
                                          ) : (
                                            agreement.GN_additional_agreement_number
                                          )}
                                        </td>
                                        <td>
                                          {isAgreementEditing ? (
                                            <input
                                              className="invest-program-inline-input"
                                              type="date"
                                              value={getAgreementDraftValue('GN_additional_agreement_date')}
                                              onChange={(event) => updateAgreementDraft('GN_additional_agreement_date', event.target.value)}
                                            />
                                          ) : (
                                            agreement.GN_additional_agreement_date
                                          )}
                                        </td>
                                        <td>
                                          {isAgreementEditing ? (
                                            <input
                                              className="invest-program-inline-input"
                                              value={getAgreementDraftValue('GN_additional_agreement_description')}
                                              onChange={(event) => updateAgreementDraft('GN_additional_agreement_description', event.target.value)}
                                            />
                                          ) : (
                                            agreement.GN_additional_agreement_description
                                          )}
                                        </td>
                                        <td>
                                          {isAgreementEditing ? (
                                            <input
                                              className="invest-program-inline-input"
                                              type="number"
                                              step="0.01"
                                              value={getAgreementDraftValue('GN_additional_agreement_amount')}
                                              onChange={(event) => updateAgreementDraft('GN_additional_agreement_amount', event.target.value)}
                                            />
                                          ) : (
                                            Number(agreement.GN_additional_agreement_amount).toLocaleString('ru-RU', {
                                              style: 'currency',
                                              currency: 'RUB',
                                            })
                                          )}
                                        </td>
                                        <td>
                                          {(() => {
                                            const agreementStatusValue = isAgreementEditing ? getAgreementDraftValue('GN_additional_agreement_status') : (agreement.GN_additional_agreement_status || 'действующий')
                                            const bgColor = agreementStatusValue === 'на согласовании' ? '#fef3c7' : agreementStatusValue === 'действующий' ? '#dcfce7' : '#f3f4f6'
                                            const textColor = agreementStatusValue === 'на согласовании' ? '#92400e' : agreementStatusValue === 'действующий' ? '#15803d' : '#6b7280'
                                            return isAgreementEditing ? (
                                              <select
                                                className="invest-program-cell-select"
                                                value={agreementStatusValue}
                                                onChange={(event) => updateAgreementDraft('GN_additional_agreement_status', event.target.value)}
                                                style={{ backgroundColor: bgColor, color: textColor }}
                                              >
                                                <option value="действующий">действующий</option>
                                                <option value="на согласовании">на согласовании</option>
                                              </select>
                                            ) : (
                                              <span style={{ backgroundColor: bgColor, color: textColor, padding: '2px 6px', borderRadius: '4px', fontWeight: '500', display: 'inline-block' }}>
                                                {agreementStatusValue}
                                              </span>
                                            )
                                          })()}
                                        </td>
                                        <td>
                                          {isAgreementEditing ? (
                                            <>
                                              <button type="button" className="invest-program-row-action-button" onClick={() => void saveAgreementEdit()}>
                                                СОХР
                                              </button>
                                              <button
                                                type="button"
                                                className="invest-program-row-action-button invest-program-row-action-button--secondary"
                                                onClick={cancelAgreementEdit}
                                              >
                                                ОТМ
                                              </button>
                                            </>
                                          ) : (
                                            <button type="button" className="invest-program-row-action-button" onClick={() => startEditAgreement(agreement)}>
                                              ИЗМ
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  })}
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
          </div>
        )}
      </div>
    </section>
  )
}