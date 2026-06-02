import { Fragment, useEffect, useState } from 'react'
import { formatHttpError } from '../utils/forecastUtils'

// Страница управления договорами.
// Загружает справочники, отображает список договоров и позволяет сохранять изменения.
type Row = Record<string, unknown>
type LookupOption = { value: string; label: string; meta?: Row }

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
    meta: row,
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

  // Add-contract quick form state
  const [showAddContractForm, setShowAddContractForm] = useState(false)
  const [newDogovorId, setNewDogovorId] = useState('')
  const [newDogovorStatus, setNewDogovorStatus] = useState('на согласовании')

  async function addPendingContract(): Promise<void> {
    if (!newDogovorId) return
    const selectedDogovor = dogovorOptions.find((opt) => opt.value === newDogovorId)
    if (!selectedDogovor || !selectedDogovor.meta) return

    const contractorFk = Number(selectedDogovor.meta.GN_contarctor_FK ?? 0)
    if (!contractorFk) {
      setSaveError('Не найден контрагент для выбранного договора')
      return
    }

    setSaveError(null)
    try {
      const payload = {
        GN_contract_contractor_FK: contractorFk,
        GN_contract_dogovor_FK: Number(newDogovorId),
        GN_contract_sed_launch_date: new Date().toISOString().slice(0, 10),
        GN_contract_asez_load_date: new Date().toISOString().slice(0, 10),
        GN_contract_state: '',
        GN_contract_approval_status: newDogovorStatus,
      }

      const response = await fetch('/api/gn/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const payloadErr = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payloadErr.error || formatHttpError(response.status))
      }

      const created = await response.json()

      // Add created contract to local state so popup can find it
      setRows((prev) => [toRow(created), ...prev])

      const id = `contract-${created.GN_contract_id ?? `new-${Date.now()}`}`
      const contractName = selectedDogovor.label
      setPendingDocuments((prev) => [
        {
          id,
          type: 'contract',
          number: contractName,
          date: created.GN_contract_sed_launch_date || new Date().toISOString().slice(0, 10),
          description: `Договор: ${contractName}`,
          contractName,
        },
        ...prev,
      ])

      setNewDogovorId('')
      setNewDogovorStatus('на согласовании')
      setShowAddContractForm(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось создать договор')
    }
  }

  return (
    <section className="guide invest-program-section transparent-section">
      <div className="guide-section invest-program-content">
        {loading && <p className="hint">Загрузка данных...</p>}
        {error && <p className="hint hint--error">Ошибка: {error}</p>}
        {saveError && <p className="hint hint--error">Ошибка сохранения: {saveError}</p>}

        {!loading && !error && (
          <div>
            {/* Documents pending approval */}
            <div className="guide-table-wrap invest-program-table-wrap section-bottom-space">
              <div className="form-fields-inline" style={{ marginBottom: '10px' }}>
              <button
                type="button"
                className="page-action-btn page-action-btn--success"
                onClick={() => setShowAddContractForm((prev) => !prev)}
              >
                {showAddContractForm ? 'Отмена' : 'Добавить договор'}
              </button>
            </div>
            {showAddContractForm && (
              <div className="form-fields-inline" style={{ marginBottom: '10px' }}>
                <select
                  value={newDogovorId}
                  onChange={(e) => setNewDogovorId(e.target.value)}
                >
                  <option value="">Выберите договор</option>
                  {dogovorOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select value={newDogovorStatus} onChange={(e) => setNewDogovorStatus(e.target.value)}>
                  <option value="на согласовании">на согласовании</option>
                  <option value="действующий">действующий</option>
                </select>
                <button
                  type="button"
                  className="page-action-btn page-action-btn--success"
                  onClick={addPendingContract}
                  disabled={!newDogovorId}
                >
                  Добавить
                </button>
              </div>
            )}
            <h3 className="section-title section-title--warning">На согласовании</h3>
              <table className="guide-table table-compact invest-program-table-min">
                  <thead>
                    <tr>
                      <th>Тип</th>
                      <th>Номер</th>
                      <th>Дата</th>
                      <th>Описание</th>
                      <th>Сумма</th>
                      <th>Договор</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingDocuments.map((doc) => {
                      const isEditingDoc = editingPendingDocId === doc.id && draftPendingDoc != null
                      return (
                        <tr key={doc.id}>
                          <td>
                            <span className={`doc-type-badge ${doc.type === 'contract' ? 'doc-type-badge--contract' : 'doc-type-badge--agreement'}`}>
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
                          <td>
                            <button
                              type="button"
                              className="contract-cell-button"
                              disabled={!doc.contractName}
                              onClick={() => doc.contractName && onOpenContract(doc.contractName)}
                            >
                              {doc.contractName || '-'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
       <h3 className="section-title section-title--success">Действующие договора</h3>
            {/* Main contracts table */}
            <div className="guide-table-wrap invest-program-table-wrap">
              <table className="guide-table table-compact invest-program-table-min">
              <thead>
                <tr>
                  <th>№</th>
                  {COLUMNS.filter(c => c.key !== 'GN_contract_sed_launch_date' && c.key !== 'GN_contract_asez_load_date' && c.kind !== 'status').map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                  <th>ДС</th>
                </tr>
              </thead>
              <tbody>
                {rows.filter(row => String(row.GN_contract_approval_status ?? 'действующий') === 'действующий').map((row, rowIndex) => {
                  return (
                    <Fragment key={`contract-block-${row.GN_contract_id}`}>
                      <tr key={`contract-${row.GN_contract_id}`}>
                    <td className="invest-program-row-number">{rowIndex + 1}</td>
                    {COLUMNS.filter(c => c.key !== 'GN_contract_sed_launch_date' && c.key !== 'GN_contract_asez_load_date' && c.kind !== 'status').map((column) => {
                        if (column.kind === 'lookup') {
                          const options = column.key === 'GN_contract_contractor_FK' ? contractorOptions : dogovorOptions
                          const label = displayLookupLabel(options, row[column.key as keyof ContractRow])
                          return (
                            <td key={column.key}>
                              {column.key === 'GN_contract_dogovor_FK' ? (
                                <button
                                  type="button"
                                  className="contract-cell-button"
                                  onClick={() => onOpenContract(label)}
                                >
                                  {label}
                                </button>
                              ) : (
                                <span className="invest-program-cell-text">{label}</span>
                              )}
                            </td>
                          )
                        }

                        if (column.kind === 'date') {
                          const value = String(row[column.key as keyof ContractRow] ?? '')
                          return (
                            <td key={column.key}>
                              <span className="invest-program-cell-text">{value}</span>
                            </td>
                          )
                        }

                        if (column.kind === 'status') {
                          const statusValue = String(row[column.key as keyof ContractRow] ?? 'действующий')
                          const statusClass = statusValue === 'на согласовании'
                            ? 'status-cell status-cell--pending'
                            : statusValue === 'действующий'
                              ? 'status-cell status-cell--active'
                              : statusValue === 'не действующий'
                                ? 'status-cell status-cell--inactive'
                                : 'status-cell'
                          return (
                            <td key={column.key} className={statusClass}>
                              <span className={`invest-program-cell-text status-label ${statusClass}`}>{statusValue}</span>
                            </td>
                          )
                        }

                        const value = String(row[column.key as keyof ContractRow] ?? '')
                        return (
                          <td key={column.key}>
                            <span className="invest-program-cell-text">{value}</span>
                          </td>
                        )
                      })}
                      <td className="invest-program-actions-cell">
                        {(() => {
                          const contractAgreements = agreementsByContract[row.GN_contract_id] ?? []
                          const agreementCount = contractAgreements.length
                          const hasAgreements = agreementCount > 0
                          const isExpanded = expandedContracts.has(row.GN_contract_id)

                          return hasAgreements ? (
                            <button
                              type="button"
                              className="invest-program-row-action-button invest-program-row-action-button--secondary"
                              onClick={() => toggleContractAgreements(row.GN_contract_id)}
                              aria-label={isExpanded ? `Скрыть ${agreementCount} дополнительных соглашений` : `Показать ${agreementCount} дополнительных соглашений`}
                            >
                              {isExpanded ? `− ${agreementCount}` : `+ ${agreementCount}`}
                            </button>
                          ) : (
                            <span className="invest-program-row-action-button invest-program-row-action-button--disabled">-</span>
                          )
                        })()}
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
                                            const statusClass = agreementStatusValue === 'на согласовании'
                                              ? 'status-cell status-cell--pending'
                                              : agreementStatusValue === 'действующий'
                                                ? 'status-cell status-cell--active'
                                                : 'status-cell'
                                            return isAgreementEditing ? (
                                              <select
                                                className={`invest-program-cell-select status-select ${statusClass}`}
                                                value={agreementStatusValue}
                                                onChange={(event) => updateAgreementDraft('GN_additional_agreement_status', event.target.value)}
                                              >
                                                <option value="действующий">действующий</option>
                                                <option value="на согласовании">на согласовании</option>
                                              </select>
                                            ) : (
                                              <span className={`status-label ${statusClass}`}>
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
        {/* Archive table for inactive contracts */}
        {!loading && !error && rows.filter(row => String(row.GN_contract_approval_status ?? 'действующий') === 'не действующий').length > 0 && (
          <div className="guide-table-wrap invest-program-table-wrap section-top-space">
            <h3 className="section-title section-title--danger">Архив (не действующие договора)</h3>
            <table className="guide-table table-compact invest-program-table-min">
              <thead>
                <tr>
                  <th>№</th>
                  {COLUMNS.filter(c => c.key !== 'GN_contract_sed_launch_date' && c.key !== 'GN_contract_asez_load_date' && c.kind !== 'status').map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.filter(row => String(row.GN_contract_approval_status ?? 'действующий') === 'не действующий').map((row, rowIndex) => {

                  return (
                    <Fragment key={`archive-contract-block-${row.GN_contract_id}`}>
                      <tr key={`archive-contract-${row.GN_contract_id}`}>
                        <td className="invest-program-row-number">{rowIndex + 1}</td>
                        {COLUMNS.filter(c => c.key !== 'GN_contract_sed_launch_date' && c.key !== 'GN_contract_asez_load_date' && c.kind !== 'status').map((column) => {
                          if (column.kind === 'lookup') {
                            const options = column.key === 'GN_contract_contractor_FK' ? contractorOptions : dogovorOptions
                            const label = displayLookupLabel(options, row[column.key as keyof ContractRow])
                            return (
                              <td key={column.key}>
                                {column.key === 'GN_contract_dogovor_FK' ? (
                                  <button
                                    type="button"
                                    className="contract-cell-button"
                                    onClick={() => onOpenContract(label)}
                                  >
                                    {label}
                                  </button>
                                ) : (
                                  <span className="invest-program-cell-text">{label}</span>
                                )}
                              </td>
                            )
                          }

                          if (column.kind === 'date') {
                            const value = String(row[column.key as keyof ContractRow] ?? '')
                            return (
                              <td key={column.key}>
                                <span className="invest-program-cell-text">{value}</span>
                              </td>
                            )
                          }

                          if (column.kind === 'status') {
                            const statusValue = String(row[column.key as keyof ContractRow] ?? 'действующий')
                            const statusClass = statusValue === 'на согласовании'
                              ? 'status-cell status-cell--pending'
                              : statusValue === 'действующий'
                                ? 'status-cell status-cell--active'
                                : statusValue === 'не действующий'
                                  ? 'status-cell status-cell--inactive'
                                  : 'status-cell'
                            return (
                              <td key={column.key} className={statusClass}>
                                <span className={`invest-program-cell-text status-label ${statusClass}`}>{statusValue}</span>
                              </td>
                            )
                          }

                          const value = String(row[column.key as keyof ContractRow] ?? '')
                          return (
                            <td key={column.key}>
                              <span className="invest-program-cell-text">{value}</span>
                            </td>
                          )
                        })}
                        <td className="invest-program-actions-cell">
                        </td>
                      </tr>
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