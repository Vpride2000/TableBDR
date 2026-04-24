import { useEffect, useState } from 'react';
import './styles.css';
import { formatHttpError } from './utils/forecastUtils';
import type { ContractAdditionalAgreement } from './types';

// Страница просмотра деталей по конкретному договору.
// Загружает все строки BDR и фильтрует их по названию договора.
type Row = Record<string, unknown>;

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
    async function loadAgreements(): Promise<void> {
      setAgreementsLoading(true);
      setAgreementsError(null);

      try {
        // First get contract ID by name
        const contractsResponse = await fetch('/api/gn/contracts');
        if (!contractsResponse.ok) {
          throw new Error('Failed to fetch contracts');
        }
        const contracts = (await contractsResponse.json()) as Array<{
          GN_contract_id: number;
          GN_contract_name: string;
        }>;
        const contract = contracts.find(c => String(c.GN_contract_name ?? '') === contractName);
        if (!contract) {
          throw new Error('Contract not found');
        }

        setContractId(contract.GN_contract_id);

        // Then get agreements for this contract
        const agreementsResponse = await fetch('/api/gn/contract-additional-agreements');
        if (!agreementsResponse.ok) {
          throw new Error('Failed to fetch agreements');
        }
        const allAgreements = (await agreementsResponse.json()) as ContractAdditionalAgreement[];
        const contractAgreements = allAgreements.filter(a => a.GN_contract_id_FK === contract.GN_contract_id);

        setAgreements(contractAgreements);
      } catch (err) {
        setAgreementsError(err instanceof Error ? err.message : 'Ошибка при загрузке дополнительных соглашений');
        setContractId(null);
      } finally {
        setAgreementsLoading(false);
      }
    }

    void loadAgreements();
  }, [contractName]);

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

      <h3>Дополнительные соглашения</h3>
      <div className="form-fields-vertical" style={{ marginBottom: 18 }}>
        <div className="form-field">
          <label className="form-field-label" htmlFor="agreement-number">Номер</label>
          <input
            id="agreement-number"
            type="text"
            value={newAgreementNumber}
            onChange={(event) => setNewAgreementNumber(event.target.value)}
            placeholder="Например: ДС-005"
          />
        </div>
        <div className="form-field">
          <label className="form-field-label" htmlFor="agreement-date">Дата</label>
          <input
            id="agreement-date"
            type="date"
            value={newAgreementDate}
            onChange={(event) => setNewAgreementDate(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label className="form-field-label" htmlFor="agreement-description">Описание</label>
          <input
            id="agreement-description"
            type="text"
            value={newAgreementDescription}
            onChange={(event) => setNewAgreementDescription(event.target.value)}
            placeholder="Краткое описание соглашения"
          />
        </div>
        <div className="form-field">
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
        <div>
          <button
            type="button"
            className="form-submit-btn"
            onClick={() => void createAgreement()}
            disabled={createLoading}
          >
            {createLoading ? 'Сохранение...' : 'Добавить соглашение'}
          </button>
        </div>
        {createError && <p className="hint hint--error">Ошибка: {createError}</p>}
      </div>

      {editingAgreementId && (
        <div className="form-fields-vertical" style={{ marginBottom: 18, border: '1px solid #e5e7eb', padding: 16, borderRadius: 8 }}>
          <h4>Редактирование соглашения</h4>
          <div className="form-field">
            <label className="form-field-label" htmlFor="edit-agreement-number">Номер</label>
            <input
              id="edit-agreement-number"
              type="text"
              value={editAgreementNumber}
              onChange={(event) => setEditAgreementNumber(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-field-label" htmlFor="edit-agreement-date">Дата</label>
            <input
              id="edit-agreement-date"
              type="date"
              value={editAgreementDate}
              onChange={(event) => setEditAgreementDate(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-field-label" htmlFor="edit-agreement-description">Описание</label>
            <input
              id="edit-agreement-description"
              type="text"
              value={editAgreementDescription}
              onChange={(event) => setEditAgreementDescription(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-field-label" htmlFor="edit-agreement-amount">Сумма</label>
            <input
              id="edit-agreement-amount"
              type="number"
              step="0.01"
              value={editAgreementAmount}
              onChange={(event) => setEditAgreementAmount(event.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="form-submit-btn"
              onClick={() => void saveAgreementEdit()}
              disabled={editLoading}
            >
              {editLoading ? 'Сохранение...' : 'Сохранить изменения'}
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
