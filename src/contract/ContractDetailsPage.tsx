import { useEffect, useState } from 'react';
import { formatHttpError } from '../utils/forecastUtils';
import type { ContractAdditionalAgreement } from '../types/types';

// Страница просмотра деталей по конкретному договору.
// Загружает все строки BDR и фильтрует их по названию договора.
type Row = Record<string, unknown>;
type LookupOption = { value: string; label: string }

type ContractInfo = {
  GN_contract_id: number
  GN_contract_contractor_FK: number
  GN_contract_dogovor_FK: number
  GN_contract_sed_launch_date: string
  GN_contract_asez_load_date: string
  GN_contract_state: string
  GN_contract_status_updated_at: string
  GN_contract_approval_status?: string
  GN_contract_name?: string;
  GN_contract_date?: string;
  GN_contract_term_from?: string;
  GN_contract_term_to?: string
}

interface ContractDetailsPageProps {
  contractName: string;
  onBack: () => void;
}

export default function ContractDetailsPage({ contractName, onBack }: ContractDetailsPageProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agreements, setAgreements] = useState<ContractAdditionalAgreement[]>([]);
  const [agreementsLoading, setAgreementsLoading] = useState(true);
  const [agreementsError, setAgreementsError] = useState<string | null>(null);
  const [contractId, setContractId] = useState<number | null>(null);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [contractLoading, setContractLoading] = useState(true);
  const [contractError, setContractError] = useState<string | null>(null);
  const [contractorOptions, setContractorOptions] = useState<LookupOption[]>([]);
  const [dogovorOptions, setDogovorOptions] = useState<LookupOption[]>([]);
  const [contractDraft, setContractDraft] = useState<ContractInfo | null>(null);
  const [isEditingContract, setIsEditingContract] = useState(false);
  const [contractSaveLoading, setContractSaveLoading] = useState(false);
  const [contractSaveError, setContractSaveError] = useState<string | null>(null);
  const [newAgreementNumber, setNewAgreementNumber] = useState('');
  const [newAgreementDate, setNewAgreementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newAgreementDescription, setNewAgreementDescription] = useState('');
  const [newAgreementAmount, setNewAgreementAmount] = useState('0');
  const [newAgreementStatus, setNewAgreementStatus] = useState('действующий');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingAgreementId, setEditingAgreementId] = useState<number | null>(null);
  const [editAgreementNumber, setEditAgreementNumber] = useState('');
  const [editAgreementDate, setEditAgreementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editAgreementDescription, setEditAgreementDescription] = useState('');
  const [editAgreementAmount, setEditAgreementAmount] = useState('0');
  const [editAgreementStatus, setEditAgreementStatus] = useState('действующий');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isAddingAgreement, setIsAddingAgreement] = useState(false);

  useEffect(() => {
    async function loadContractRows(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/gn/bdr');
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || formatHttpError(response.status));
        }

        const allRows = (await response.json()) as Row[];
        
        // Filter rows by contract name
        const contractRows = allRows.filter((row) => String(row['Договор'] ?? '') === contractName);
        
        setRows(contractRows);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка при загрузке данных');
      } finally {
        setLoading(false);
      }
    }

    void loadContractRows();
  }, [contractName]);

  useEffect(() => {
    async function loadContractMetadata(): Promise<void> {
      setAgreementsLoading(true);
      setAgreementsError(null);
      setContractLoading(true);
      setContractError(null);

      try {
        const [contractsResponse, contractorsResponse, dogovorsResponse, agreementsResponse] = await Promise.all([
          fetch('/api/gn/contracts'),
          fetch('/api/gn/contractors'),
          fetch('/api/gn/dogovors'),
          fetch('/api/gn/contract-additional-agreements'),
        ]);

        if (!contractsResponse.ok) throw new Error('Failed to fetch contracts');
        if (!contractorsResponse.ok) throw new Error('Failed to fetch contractors');
        if (!dogovorsResponse.ok) throw new Error('Failed to fetch dogovors');
        if (!agreementsResponse.ok) throw new Error('Failed to fetch agreements');

        const contracts = (await contractsResponse.json()) as ContractInfo[];
        const contractors = (await contractorsResponse.json()) as Row[];
        const dogovors = (await dogovorsResponse.json()) as Row[];
        const allAgreements = (await agreementsResponse.json()) as ContractAdditionalAgreement[];

        const contract = contracts.find(c => String(c.GN_contract_name ?? '') === contractName);
        if (!contract) {
          throw new Error('Contract not found');
        }

        setContractId(contract.GN_contract_id);
        setContractInfo(contract);
        setContractDraft(contract);
        setContractorOptions(mapLookupOptions(contractors, 'GN_c_id', 'GN_contarctor'));
        setDogovorOptions(mapLookupOptions(dogovors, 'GN_dgv_id', 'GN_dogovor'));

        const contractAgreements = allAgreements.filter(a => a.GN_contract_id_FK === contract.GN_contract_id);
        setAgreements(contractAgreements);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Ошибка при загрузке данных';
        setAgreementsError(message);
        setContractError(message);
        setContractId(null);
        setContractInfo(null);
        setContractDraft(null);
      } finally {
        setAgreementsLoading(false);
        setContractLoading(false);
      }
    }

    void loadContractMetadata();
  }, [contractName]);

  function mapLookupOptions(rows: Row[], valueKey: string, labelKey: string): LookupOption[] {
    return rows.map((row) => ({
      value: String(row[valueKey] ?? ''),
      label: String(row[labelKey] ?? ''),
    }))
  }

  function displayLookupLabel(options: LookupOption[], value: unknown): string {
    const normalizedValue = String(value ?? '')
    return options.find((option) => option.value === normalizedValue)?.label ?? normalizedValue
  }

  function startEditContract(): void {
    if (!contractInfo) return
    setContractDraft({ ...contractInfo })
    setIsEditingContract(true)
    setContractSaveError(null)
  }

  function cancelContractEdit(): void {
    setIsEditingContract(false)
    setContractDraft(contractInfo)
    setContractSaveError(null)
  }

  function updateContractDraft(field: keyof ContractInfo, value: string): void {
    setContractDraft((prevDraft) => {
      if (!prevDraft) return prevDraft
      if (field === 'GN_contract_contractor_FK' || field === 'GN_contract_dogovor_FK') {
        return { ...prevDraft, [field]: Number(value) }
      }
      return { ...prevDraft, [field]: value }
    })
  }

  async function saveContractEdit(): Promise<void> {
    if (!contractInfo || !contractDraft) {
      setContractSaveError('Не удалось сохранить договор.');
      return;
    }

    setContractSaveLoading(true);
    setContractSaveError(null);

    try {
      const response = await fetch(`/api/gn/contracts/${contractInfo.GN_contract_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contractDraft),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Не удалось сохранить договор');
      }

      const updatedContract = (await response.json()) as ContractInfo;
      setContractInfo(updatedContract);
      setContractDraft(updatedContract);
      setIsEditingContract(false);
    } catch (err) {
      setContractSaveError(err instanceof Error ? err.message : 'Ошибка при сохранении договора');
    } finally {
      setContractSaveLoading(false);
    }
  }

  async function createAgreement(): Promise<void> {
    if (!contractId) {
      setCreateError('Не удалось определить договор для создания соглашения.');
      return;
    }

    if (!newAgreementNumber.trim() || !newAgreementDate.trim() || !newAgreementDescription.trim()) {
      setCreateError('Все поля формы обязательны.');
      return;
    }

    const amount = Number(newAgreementAmount);
    if (!Number.isFinite(amount)) {
      setCreateError('Сумма должна быть числом.');
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      const response = await fetch('/api/gn/contract-additional-agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId,
          number: newAgreementNumber.trim(),
          date: newAgreementDate,
          description: newAgreementDescription.trim(),
          amount,
          approvalStatus: newAgreementStatus,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Не удалось создать соглашение');
      }

      const createdAgreement = (await response.json()) as ContractAdditionalAgreement;
      setAgreements((prev) => [createdAgreement, ...prev]);
      setNewAgreementNumber('');
      setNewAgreementDate(new Date().toISOString().slice(0, 10));
      setNewAgreementDescription('');
      setNewAgreementAmount('0');
      setNewAgreementStatus('действующий');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Ошибка при создании соглашения');
    } finally {
      setCreateLoading(false);
    }
  }

  function startEditAgreement(agreement: ContractAdditionalAgreement): void {
    setEditingAgreementId(agreement.GN_additional_agreement_id);
    setEditAgreementNumber(agreement.GN_additional_agreement_number);
    setEditAgreementDate(agreement.GN_additional_agreement_date.slice(0, 10));
    setEditAgreementDescription(agreement.GN_additional_agreement_description);
    setEditAgreementAmount(String(agreement.GN_additional_agreement_amount));
    setEditError(null);
  }

  function cancelEditAgreement(): void {
    setEditingAgreementId(null);
    setEditAgreementNumber('');
    setEditAgreementDate(new Date().toISOString().slice(0, 10));
    setEditAgreementDescription('');
    setEditAgreementAmount('0');
    setEditError(null);
  }

  async function saveAgreementEdit(): Promise<void> {
    if (editingAgreementId == null || !contractId) {
      setEditError('Не удалось сохранить соглашение.');
      return;
    }

    if (!editAgreementNumber.trim() || !editAgreementDate.trim() || !editAgreementDescription.trim()) {
      setEditError('Все поля формы обязательны.');
      return;
    }

    const amount = Number(editAgreementAmount);
    if (!Number.isFinite(amount)) {
      setEditError('Сумма должна быть числом.');
      return;
    }

    setEditLoading(true);
    setEditError(null);

    try {
      const response = await fetch(`/api/gn/contract-additional-agreements/${editingAgreementId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId,
          number: editAgreementNumber.trim(),
          date: editAgreementDate,
          description: editAgreementDescription.trim(),
          amount,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Не удалось обновить соглашение');
      }

      const updatedAgreement = (await response.json()) as ContractAdditionalAgreement;
      setAgreements((prev) => prev.map((item) =>
        item.GN_additional_agreement_id === updatedAgreement.GN_additional_agreement_id
          ? updatedAgreement
          : item
      ));
      cancelEditAgreement();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Ошибка при обновлении соглашения');
    } finally {
      setEditLoading(false);
    }
  }

    const columns = ['Подразделение', 'Статья бюджета УС', 'Статья бюджета', 'Предмет договора'];

  return (
    <section className="contract-details">
      <div className="contract-details-header">
        <h2>Договор: {contractName}</h2>
        <button type="button" className="contract-close-btn" onClick={onBack}>
          Закрыть
        </button>
      </div>

      {loading && <p className="hint">Загрузка данных...</p>}
      {error && <p className="hint hint--error">Ошибка: {error}</p>}
      {!loading && !error && rows.length === 0 && <p className="hint">Нет строк для этого договора.</p>}

      {!loading && !error && rows.length > 0 && (
        <div className="guide-table-wrap">
          <table className="guide-table table-compact contract-details-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col}>{String(row[col] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="contract-details-count">Всего строк: {rows.length}</p>
        </div>
      )}

      {contractLoading && <p className="hint">Загрузка параметров договора...</p>}
      {contractError && <p className="hint hint--error">Ошибка: {contractError}</p>}
      {contractInfo && (
        <div className="contract-details-contract-meta">
          <h3>Параметры договора</h3>

          {!isEditingContract ? (
            <div className="contract-details-meta-preview">
              <div className="contract-details-meta-row">
                <strong>Контрагент:</strong> {displayLookupLabel(contractorOptions, contractInfo.GN_contract_contractor_FK)}
              </div>
              <div className="contract-details-meta-row">
                <strong>Статус:</strong> {contractInfo.GN_contract_approval_status || 'действующий'}
              </div>
              <div className="contract-details-meta-row">
                <strong>Состояние:</strong> {contractInfo.GN_contract_state}
              </div>

              <div className="contract-details-meta-row">
                <strong>Дата договора:</strong> {contractInfo.GN_contract_date}
              </div> 

              <div className="contract-details-meta-row">
                <strong>Дата начала действия</strong> {contractInfo.GN_contract_term_from}
              </div> 
              <div className="contract-details-meta-row">
                <strong>Дата окончания действия:</strong> {contractInfo.GN_contract_term_to}
              </div>

              <div className="contract-details-meta-row">
                <strong>Дата запуска в СЭД:</strong> {contractInfo.GN_contract_sed_launch_date}
              </div>
              <div className="contract-details-meta-row">
                <strong>Дата загрузки в АСЭЗ:</strong> {contractInfo.GN_contract_asez_load_date}
              </div>
              <button
                type="button"
                className="page-action-btn page-action-btn--secondary"
                onClick={startEditContract}
              >
                Редактировать параметры договора
              </button>
            </div>
          ) : (
            <div className="form-fields-compact">
              <div className="form-field form-field-compact">
                <label className="form-field-label" htmlFor="contract-dogovor">Договор</label>
                <input
                  id="contract-dogovor"
                  type="text"
                  value={contractInfo.GN_contract_name ?? contractName}
                  disabled
                />
              </div>
              <div className="form-field form-field-compact">
                <label className="form-field-label" htmlFor="contract-contractor">Контрагент</label>
                <select
                  id="contract-contractor"
                  value={String(contractDraft?.GN_contract_contractor_FK ?? '')}
                  onChange={(event) => updateContractDraft('GN_contract_contractor_FK', event.target.value)}
                >
                  <option value="">Выберите контрагента</option>
                  {contractorOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-field form-field-compact">
                <label className="form-field-label" htmlFor="contract-status">Статус</label>
                <select
                  id="contract-status"
                  value={contractDraft?.GN_contract_approval_status ?? 'действующий'}
                  onChange={(event) => updateContractDraft('GN_contract_approval_status', event.target.value)}
                >
                  <option value="действующий">действующий</option>
                  <option value="на согласовании">на согласовании</option>
                  <option value="не действующий">не действующий</option>
                </select>
              </div>
              <div className="form-field form-field-compact">
                <label className="form-field-label" htmlFor="contract-state">Состояние</label>
                <input
                  id="contract-state"
                  type="text"
                  value={contractDraft?.GN_contract_state ?? ''}
                  onChange={(event) => updateContractDraft('GN_contract_state', event.target.value)}
                />
              </div>
              <div className="form-field form-field-compact">
                <label className="form-field-label" htmlFor="contract-sed-launch-date">Дата запуска в СЭД</label>
                <input
                  id="contract-sed-launch-date"
                  type="date"
                  value={contractDraft?.GN_contract_sed_launch_date ?? ''}
                  onChange={(event) => updateContractDraft('GN_contract_sed_launch_date', event.target.value)}
                />
              </div>
              <div className="form-field form-field-compact">
                <label className="form-field-label" htmlFor="contract-asez-load-date">Дата загрузки в АСЭЗ</label>
                <input
                  id="contract-asez-load-date"
                  type="date"
                  value={contractDraft?.GN_contract_asez_load_date ?? ''}
                  onChange={(event) => updateContractDraft('GN_contract_asez_load_date', event.target.value)}
                />
              </div>
              <div className="form-actions-row-compact">
                <button
                  type="button"
                  className="form-submit-btn"
                  onClick={() => void saveContractEdit()}
                  disabled={contractSaveLoading}
                >
                  {contractSaveLoading ? 'Сохранение...' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  className="page-action-btn page-action-btn--secondary"
                  onClick={cancelContractEdit}
                  disabled={contractSaveLoading}
                >
                  Отмена
                </button>
              </div>
              {contractSaveError && <p className="hint hint--error">Ошибка: {contractSaveError}</p>}
            </div>
          )}
        </div>
      )}

      <h3>Дополнительные соглашения</h3>
      {!isAddingAgreement && (
        <button
          type="button"
          className="page-action-btn page-action-btn--success"
          onClick={() => setIsAddingAgreement(true)}
        >
          Добавить соглашение
        </button>
      )}
      {isAddingAgreement && (
        <div className="form-fields-compact">
          <div className="form-field form-field-compact">
            <label className="form-field-label" htmlFor="agreement-number">Номер</label>
            <input
              id="agreement-number"
              type="text"
              value={newAgreementNumber}
              onChange={(event) => setNewAgreementNumber(event.target.value)}
              placeholder="Например: ДС-005"
            />
          </div>
          <div className="form-field form-field-compact">
            <label className="form-field-label" htmlFor="agreement-date">Дата</label>
            <input
              id="agreement-date"
              type="date"
              value={newAgreementDate}
              onChange={(event) => setNewAgreementDate(event.target.value)}
            />
          </div>
          <div className="form-field form-field-compact">
            <label className="form-field-label" htmlFor="agreement-amount">Сумма</label>
            <input
              id="agreement-amount"
              type="number"
              step="0.01"
              value={newAgreementAmount}
              onChange={(event) => setNewAgreementAmount(event.target.value)}
              placeholder="0"
            />
          </div>
          <div className="form-field form-field-compact" style={{flex: '1 1 320px'}}>
            <label className="form-field-label" htmlFor="agreement-description">Описание</label>
            <input
              id="agreement-description"
              type="text"
              value={newAgreementDescription}
              onChange={(event) => setNewAgreementDescription(event.target.value)}
              placeholder="Краткое описание соглашения"
            />
          </div>
          <div className="form-actions-row-compact" style={{width: '100%'}}>
            <div style={{marginLeft: 'auto', display: 'flex', gap: 8}}>
              <button
                type="button"
                className="form-submit-btn"
                onClick={() => void createAgreement()}
                disabled={createLoading}
              >
                {createLoading ? 'Сохранение...' : 'Добавить'}
              </button>
              <button
                type="button"
                className="page-action-btn page-action-btn--danger"
                onClick={() => {
                  setIsAddingAgreement(false);
                  setNewAgreementNumber('');
                  setNewAgreementDate(new Date().toISOString().slice(0, 10));
                  setNewAgreementDescription('');
                  setNewAgreementAmount('0');
                  setNewAgreementStatus('действующий');
                  setCreateError(null);
                }}
              >
                Отмена
              </button>
            </div>
          </div>
          {createError && <p className="hint hint--error">Ошибка: {createError}</p>}
        </div>
      )}

      {editingAgreementId && (
        <div className="form-fields-compact" style={{alignItems: 'flex-start'}}>
          <h4 style={{width: '100%'}}>Редактирование соглашения</h4>
          <div className="form-field form-field-compact">
            <label className="form-field-label" htmlFor="edit-agreement-number">Номер</label>
            <input
              id="edit-agreement-number"
              type="text"
              value={editAgreementNumber}
              onChange={(event) => setEditAgreementNumber(event.target.value)}
            />
          </div>
          <div className="form-field form-field-compact">
            <label className="form-field-label" htmlFor="edit-agreement-date">Дата</label>
            <input
              id="edit-agreement-date"
              type="date"
              value={editAgreementDate}
              onChange={(event) => setEditAgreementDate(event.target.value)}
            />
          </div>
          <div className="form-field form-field-compact" style={{flex: '1 1 320px'}}>
            <label className="form-field-label" htmlFor="edit-agreement-description">Описание</label>
            <input
              id="edit-agreement-description"
              type="text"
              value={editAgreementDescription}
              onChange={(event) => setEditAgreementDescription(event.target.value)}
            />
          </div>
          <div className="form-field form-field-compact">
            <label className="form-field-label" htmlFor="edit-agreement-amount">Сумма</label>
            <input
              id="edit-agreement-amount"
              type="number"
              step="0.01"
              value={editAgreementAmount}
              onChange={(event) => setEditAgreementAmount(event.target.value)}
            />
          </div>
          <div className="form-actions-row-compact" style={{width: '100%'}}>
            <div style={{marginLeft: 'auto', display: 'flex', gap: 8}}>
              <button
                type="button"
                className="form-submit-btn"
                onClick={() => void saveAgreementEdit()}
                disabled={editLoading}
              >
                {editLoading ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                type="button"
                className="page-action-btn page-action-btn--secondary"
                onClick={cancelEditAgreement}
                disabled={editLoading}
              >
                Отмена
              </button>
            </div>
          </div>
          {editError && <p className="hint hint--error">Ошибка: {editError}</p>}
        </div>
      )}

      {agreementsLoading && <p className="hint">Загрузка дополнительных соглашений...</p>}
      {agreementsError && <p className="hint hint--error">Ошибка: {agreementsError}</p>}
      {!agreementsLoading && !agreementsError && agreements.length === 0 && <p className="hint">Нет дополнительных соглашений для этого договора.</p>}

      {!agreementsLoading && !agreementsError && agreements.length > 0 && (
        <div className="guide-table-wrap">
          <table className="guide-table table-compact">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Дата</th>
                <th>Описание</th>
                <th>Сумма</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {agreements.map((agreement) => (
                <tr key={agreement.GN_additional_agreement_id}>
                  <td>{agreement.GN_additional_agreement_number}</td>
                  <td>{new Date(agreement.GN_additional_agreement_date).toLocaleDateString('ru-RU')}</td>
                  <td>{agreement.GN_additional_agreement_description}</td>
                  <td>{agreement.GN_additional_agreement_amount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}</td>
                  <td>
                    <button
                      type="button"
                      className="page-action-btn page-action-btn--secondary"
                      onClick={() => startEditAgreement(agreement)}
                    >
                      Редактировать
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="contract-details-count">Всего дополнительных соглашений: {agreements.length}</p>
        </div>
      )}
    </section>
  );
}
