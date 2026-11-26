import { useEffect, useState } from 'react';
import { formatHttpError } from '../utils/httpUtils';
import { fetchReferences } from '../utils/referenceRequests';
import type { ContractAdditionalAgreement } from '../types/types';
import { personalAccountOptions } from '../../shared/personalAccounts';
import { parseFiniteNumericValue as parseBudgetAmount } from '../utils/numericValues';
import { displayLookupLabel, mapLookupOptions, type LookupOption } from '../utils/lookupOptions';
import { formatDateDisplay, normalizeDateValue } from './contractDates';

// Страница просмотра деталей по конкретному договору.
type Row = Record<string, unknown>;
type DogovorMetadata = { date: string; signer: string; personalAccount: string }
const CONTRACT_CONTROL_UPDATED_KEY = 'contracts-control-updated'
const BDR_UPDATED_EVENT_KEY = 'bdr:last-update'
const BDR_CURRENCY_FORMATTER = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const CONTRACT_MONTH_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function formatContractMonth(value: string): string {
  const month = value.slice(0, 7)
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ? CONTRACT_MONTH_FORMATTER.format(new Date(`${month}-01T00:00:00Z`))
    : ''
}

function getContractTermMonths(fromValue: string, toValue: string): number | null {
  const from = fromValue.slice(0, 10)
  const to = toValue.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null

  const [fromYear, fromMonth] = from.split('-').map(Number)
  const [toYear, toMonth] = to.split('-').map(Number)
  if (fromMonth < 1 || fromMonth > 12 || toMonth < 1 || toMonth > 12) return null

  return Math.abs((toYear - fromYear) * 12 + toMonth - fromMonth) + 1
}

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
  GN_contract_side?: string
  GN_contract_asez_number?: string
  GN_contract_limit?: number | string | null
  GN_contract_remaining_limit?: number | string | null
  GN_contract_vat?: string
  GN_contract_fact?: number | string | null
  GN_contract_fact_date?: string | null
  GN_contract_basis?: string
}

interface ContractDetailsPageProps {
  contractId: number;
}

export default function ContractDetailsPage({ contractId }: ContractDetailsPageProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agreements, setAgreements] = useState<ContractAdditionalAgreement[]>([]);
  const [agreementsLoading, setAgreementsLoading] = useState(true);
  const [agreementsError, setAgreementsError] = useState<string | null>(null);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [contractLoading, setContractLoading] = useState(true);
  const [contractError, setContractError] = useState<string | null>(null);
  const [contractorOptions, setContractorOptions] = useState<LookupOption[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<LookupOption[]>([]);
  const [dogovorMetadata, setDogovorMetadata] = useState<DogovorMetadata>({ date: '', signer: '', personalAccount: '' });
  const [contractDraft, setContractDraft] = useState<ContractInfo | null>(null);
  const [isEditingContract, setIsEditingContract] = useState(false);
  const [contractSaveLoading, setContractSaveLoading] = useState(false);
  const [contractSaveError, setContractSaveError] = useState<string | null>(null);
  const [contractControlMessage, setContractControlMessage] = useState<string | null>(null);
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
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isAddingAgreement, setIsAddingAgreement] = useState(false);
  const [isDeleteAgreement, setIsDeleteAgreement] = useState(false);
  const [bdrSavingId, setBdrSavingId] = useState<number | null>(null);
  const [accountSaveError, setAccountSaveError] = useState<string | null>(null);
  const [expenseDepartmentSaveError, setExpenseDepartmentSaveError] = useState<string | null>(null);
  const dogovorId = contractInfo?.GN_contract_dogovor_FK;

  useEffect(() => {
    if (!dogovorId) return;
    let active = true;
    async function loadContractRows(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/gn/bdr?dogovorId=${dogovorId}`);
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || formatHttpError(response.status));
        }

        const contractRows = (await response.json()) as Row[];
        if (active) setRows(contractRows);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Ошибка при загрузке данных');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadContractRows();
    function onStorage(event: StorageEvent): void {
      if (event.key === BDR_UPDATED_EVENT_KEY) void loadContractRows();
    }
    window.addEventListener('storage', onStorage);
    return () => {
      active = false;
      window.removeEventListener('storage', onStorage);
    };
  }, [dogovorId]);

  useEffect(() => {
    async function loadContractMetadata(): Promise<void> {
      setAgreementsLoading(true);
      setAgreementsError(null);
      setContractLoading(true);
      setContractError(null);
      setDogovorMetadata({ date: '', signer: '', personalAccount: '' });

      try {
        const [contractsResponse, contractorsResponse, dogovorsResponse, departmentsResponse, agreementsResponse] = await Promise.all([
          fetch('/api/gn/contracts'),
          ...fetchReferences('contractors', 'dogovors', 'departments'),
          fetch('/api/gn/contract-additional-agreements'),
        ]);

        if (!contractsResponse.ok) throw new Error('Failed to fetch contracts');
        if (!contractorsResponse.ok) throw new Error('Failed to fetch contractors');
        if (!dogovorsResponse.ok) throw new Error('Failed to fetch dogovors');
        if (!departmentsResponse.ok) throw new Error('Failed to fetch departments');
        if (!agreementsResponse.ok) throw new Error('Failed to fetch agreements');

        const contracts = (await contractsResponse.json()) as ContractInfo[];
        const contractors = (await contractorsResponse.json()) as Row[];
        const dogovors = (await dogovorsResponse.json()) as Row[];
        const departments = (await departmentsResponse.json()) as Row[];
        const allAgreements = (await agreementsResponse.json()) as ContractAdditionalAgreement[];

        const contract = contracts.find(c => c.GN_contract_id === contractId);
        
        if (!contract) {
          throw new Error('Contract not found');
        }

        setContractInfo(contract);
        setContractDraft(contract);
        setContractorOptions(mapLookupOptions(contractors, 'GN_c_id', 'GN_contarctor'));
        setDepartmentOptions(mapLookupOptions(departments, 'GN_Dep_id', 'GN_department'));
        const dogovor = dogovors.find((row) => Number(row.GN_dgv_id) === contract.GN_contract_dogovor_FK);
        const signer = departments.find((row) => Number(row.GN_Dep_id) === Number(dogovor?.GN_dogovor_signer_FK));
        setDogovorMetadata({
          date: String(dogovor?.GN_dogovor_date ?? ''),
          signer: String(signer?.GN_department ?? ''),
          personalAccount: String(dogovor?.GN_dogovor_personal_account ?? ''),
        });
        const contractAgreements = allAgreements.filter(a => a.GN_contract_id_FK === contract.GN_contract_id);
        setAgreements(contractAgreements);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Ошибка при загрузке данных';
        setAgreementsError(message);
        setContractError(message);
        setContractInfo(null);
        setContractDraft(null);
      } finally {
        setAgreementsLoading(false);
        setContractLoading(false);
      }
    }

    void loadContractMetadata();
  }, [contractId]);

  function normalizeDateValueWithFallback(value: unknown): string {
    const normalized = normalizeDateValue(value)
    if (normalized === '') {
      // Если дата пуста, заполняем текущей датой
      return new Date().toISOString().slice(0, 10)
    }
    return normalized
  }

  function startEditContract(): void {
    if (!contractInfo) return
    setContractDraft({
      ...contractInfo,
      GN_contract_date: normalizeDateValueWithFallback(contractInfo.GN_contract_date),
      GN_contract_term_from: normalizeDateValueWithFallback(contractInfo.GN_contract_term_from),
      GN_contract_term_to: normalizeDateValueWithFallback(contractInfo.GN_contract_term_to),
      GN_contract_sed_launch_date: normalizeDateValue(contractInfo.GN_contract_sed_launch_date),
      GN_contract_asez_load_date: normalizeDateValue(contractInfo.GN_contract_asez_load_date),
    })
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

  async function updateContractControlStatus(isOnControl: boolean): Promise<void> {
    if (!contractInfo) return;
    const approvalStatus = isOnControl ? 'действующий' : 'снят с контроля';
    const action = isOnControl ? 'Вернуть на контроль' : 'Убрать с контроля';
    if (!window.confirm(`${action} договор «${contractInfo.GN_contract_name || ''}»?`)) return;
    setContractSaveLoading(true);
    setContractSaveError(null);
    setContractControlMessage(null);

    try {
      const updatedDraft = {
        ...contractInfo,
        GN_contract_approval_status: approvalStatus,
        GN_contract_status_updated_at: new Date().toISOString().slice(0, 10),
      };
      const response = await fetch(`/api/gn/contracts/${contractInfo.GN_contract_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDraft),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || formatHttpError(response.status));
      }

      const updatedContract = (await response.json()) as ContractInfo;
      setContractInfo(updatedContract);
      setContractDraft(updatedContract);
      setContractControlMessage(isOnControl ? 'Договор возвращён на контроль.' : 'Договор убран с контроля.');
      localStorage.setItem(CONTRACT_CONTROL_UPDATED_KEY, String(Date.now()));
    } catch (err) {
      setContractSaveError(err instanceof Error ? err.message : `Не удалось выполнить действие: ${action.toLocaleLowerCase('ru')}`);
    } finally {
      setContractSaveLoading(false);
    }
  }

  async function saveContractEdit(): Promise<void> {
    if (!contractInfo || !contractDraft) {
      setContractSaveError('Не удалось сохранить договор.');
      return;
    }
    setContractSaveLoading(true);
    setContractSaveError(null);

    try {
      // Обновляем дату последнего обновления статуса
      const currentDate = new Date().toISOString().slice(0, 10);
      const updatedDraft = { ...contractDraft, GN_contract_status_updated_at: currentDate };

      const response = await fetch(`/api/gn/contracts/${contractInfo.GN_contract_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDraft),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Не удалось сохранить договор');
      }

      const updatedContract = (await response.json()) as ContractInfo;
      
      setContractInfo(updatedContract);
      setContractDraft(updatedContract);
      setIsEditingContract(false);
      localStorage.setItem(CONTRACT_CONTROL_UPDATED_KEY, String(Date.now()));
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
      
      // Обновляем дату последнего обновления статуса контракта
      if (contractInfo) {
        const currentDate = new Date().toISOString().slice(0, 10);
        const updatedContract = { ...contractInfo, GN_contract_status_updated_at: currentDate };
        const updateResponse = await fetch(`/api/gn/contracts/${contractInfo.GN_contract_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedContract),
        });
        
        if (updateResponse.ok) {
          const refreshedContract = (await updateResponse.json()) as ContractInfo;
          setContractInfo(refreshedContract);
        }
      }
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
      
      // Обновляем дату последнего обновления статуса контракта
      if (contractInfo) {
        const currentDate = new Date().toISOString().slice(0, 10);
        const updatedContract = { ...contractInfo, GN_contract_status_updated_at: currentDate };
        const updateResponse = await fetch(`/api/gn/contracts/${contractInfo.GN_contract_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedContract),
        });
        
        if (updateResponse.ok) {
          const refreshedContract = (await updateResponse.json()) as ContractInfo;
          setContractInfo(refreshedContract);
        }
      }
      
      cancelEditAgreement();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Ошибка при обновлении соглашения');
    } finally {
      setEditLoading(false);
    }
  }

  async function deleteAgreement(): Promise<void> {
    if (editingAgreementId == null) {
      setEditError('Не удалось удалить соглашение.');
      return;
    }

    setIsDeleteAgreement(true);
    setEditError(null);

    try {
      const response = await fetch(`/api/gn/contract-additional-agreements/${editingAgreementId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Не удалось удалить соглашение');
      }

      setAgreements((prev) => prev.filter((item) =>
        item.GN_additional_agreement_id !== editingAgreementId
      ));

      // Обновляем дату последнего обновления статуса контракта
      if (contractInfo) {
        const currentDate = new Date().toISOString().slice(0, 10);
        const updatedContract = { ...contractInfo, GN_contract_status_updated_at: currentDate };
        const updateResponse = await fetch(`/api/gn/contracts/${contractInfo.GN_contract_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedContract),
        });

        if (updateResponse.ok) {
          const refreshedContract = (await updateResponse.json()) as ContractInfo;
          setContractInfo(refreshedContract);
        }
      }

      cancelEditAgreement();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Ошибка при удалении соглашения');
    } finally {
      setIsDeleteAgreement(false);
    }
  }

  async function savePersonalAccount(rowId: number, personalAccount: string): Promise<void> {
    if (!dogovorId) return;
    setBdrSavingId(rowId);
    setAccountSaveError(null);
    try {
      const response = await fetch(`/api/gn/bdr/${rowId}/personal-account`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: dogovorId, personalAccount }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || formatHttpError(response.status));
      }
      const updatedRow = (await response.json()) as Row;
      setRows((previous) => previous.map((row) => Number(row.GN_bdr_ID) === rowId ? updatedRow : row));
      localStorage.setItem(BDR_UPDATED_EVENT_KEY, String(Date.now()));
    } catch (err) {
      setAccountSaveError(err instanceof Error ? err.message : 'Не удалось сохранить лицевой счёт');
    } finally {
      setBdrSavingId(null);
    }
  }

  async function saveExpenseDepartment(rowId: number, departmentId: string): Promise<void> {
    if (!dogovorId) return;
    setBdrSavingId(rowId);
    setExpenseDepartmentSaveError(null);
    try {
      const response = await fetch(`/api/gn/bdr/${rowId}/expense-department`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: dogovorId, departmentId: departmentId ? Number(departmentId) : null }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || formatHttpError(response.status));
      }
      const updatedRow = (await response.json()) as Row;
      setRows((previous) => previous.map((row) => Number(row.GN_bdr_ID) === rowId ? updatedRow : row));
      localStorage.setItem(BDR_UPDATED_EVENT_KEY, String(Date.now()));
    } catch (err) {
      setExpenseDepartmentSaveError(err instanceof Error ? err.message : 'Не удалось сохранить подразделение расходов');
    } finally {
      setBdrSavingId(null);
    }
  }

  const columns = ['Подразделение', 'Объект', 'Лицевой счет', 'На кого расходы', 'Статья бюджета УС', 'Статья бюджета', 'БДР26корр'];
  const contractRows = rows;
  const accountOptions = personalAccountOptions(dogovorMetadata.personalAccount);
  const personalAccountSummary = dogovorMetadata.personalAccount.split(/\r?\n/).filter(Boolean).join(', ');
  const contractTermMonths = getContractTermMonths(
    contractInfo?.GN_contract_term_from ?? '',
    contractInfo?.GN_contract_term_to ?? '',
  );
  const remainingContractLimit = contractInfo?.GN_contract_remaining_limit == null || contractInfo.GN_contract_remaining_limit === ''
    ? null
    : Number(contractInfo.GN_contract_remaining_limit);
  const totalBdr26Corr = contractRows.reduce((total, row) => total + parseBudgetAmount(row['БДР26корр']), 0);

  return (
    <section className="contract-details">
      <div className="contract-details-header">
        <div className="contract-details-summary">
          <h2>
            Договор <strong>{contractInfo?.GN_contract_name || 'Загрузка...'}</strong>
            {contractInfo && (
              <>
                {' '}от <strong>{dogovorMetadata.date ? formatDateDisplay(dogovorMetadata.date) : '—'}</strong>
                {' '}с <strong>{displayLookupLabel(contractorOptions, contractInfo.GN_contract_contractor_FK)}</strong>
                , подписал <strong>{dogovorMetadata.signer || '—'}</strong>
                , лицевые счета <strong>{personalAccountSummary || '—'}</strong>.
              </>
            )}
          </h2>
        </div>
      </div>

      {contractLoading && <p className="hint">Загрузка параметров договора...</p>}
      {contractError && <p className="hint hint--error">Ошибка: {contractError}</p>}
      {contractInfo && (
        <div className="contract-details-contract-meta">
          <h3>
            Параметры договора{' '}
            {!isEditingContract && (
              <button
                type="button"
                className="page-text-link"
                style={{ textTransform: 'none' }}
                aria-label="Редактировать параметры договора"
                onClick={startEditContract}
              >
                (ред)
              </button>
            )}
            {' '}
            <label className="page-text-link" style={{ textTransform: 'none' }}>
              <input
                type="checkbox"
                checked={contractInfo.GN_contract_approval_status !== 'снят с контроля'}
                disabled={contractSaveLoading}
                onChange={(event) => void updateContractControlStatus(event.target.checked)}
              />
              {' '}На контроле
            </label>
          </h3>

          {!isEditingContract ? (
            <div className="contract-details-meta-preview">
              <div className="contract-details-meta-row">
                <strong>Статус:</strong> {contractInfo.GN_contract_approval_status || 'действующий'}
              </div>
              <div className="contract-details-meta-row">
                Срок действия с <strong>{contractInfo.GN_contract_term_from ? formatDateDisplay(contractInfo.GN_contract_term_from) : '—'}</strong>
                {' '}по <strong>{contractInfo.GN_contract_term_to ? formatDateDisplay(contractInfo.GN_contract_term_to) : '—'}</strong>
                {contractTermMonths !== null && <> (<strong>{contractTermMonths} мес.</strong>)</>}.
              </div>

              <div className="contract-details-meta-row">
                <strong>Лимит договора:</strong>{' '}
                <strong>{contractInfo.GN_contract_limit === null || contractInfo.GN_contract_limit === undefined || contractInfo.GN_contract_limit === ''
                  ? '—'
                  : BDR_CURRENCY_FORMATTER.format(Number(contractInfo.GN_contract_limit))}</strong>
                {'; в бюджете на год '}
                <strong>{BDR_CURRENCY_FORMATTER.format(totalBdr26Corr)}</strong>
              </div>
              <div className="contract-details-meta-row">
                <strong>Факт</strong>
                {contractInfo.GN_contract_fact_date && ` (${formatContractMonth(contractInfo.GN_contract_fact_date)})`}
                : <strong>{contractInfo.GN_contract_fact === null || contractInfo.GN_contract_fact === undefined || contractInfo.GN_contract_fact === ''
                  ? '—'
                  : BDR_CURRENCY_FORMATTER.format(Number(contractInfo.GN_contract_fact))}</strong>
                {', остаток лимита '}
                <strong>{remainingContractLimit === null ? '—' : BDR_CURRENCY_FORMATTER.format(remainingContractLimit)}</strong>
              </div>
              <div className="contract-details-meta-row">
                <strong>Используемый НДС:</strong> {contractInfo.GN_contract_vat || '22%'}
              </div>
              <div className="contract-details-meta-row">
                <strong>Основание заключения:</strong> {contractInfo.GN_contract_basis || '17.1.9'}
                {` (Номер АСЭЗ: ${contractInfo.GN_contract_asez_number || '—'})`}
              </div>
              {contractControlMessage && <p className="hint">{contractControlMessage}</p>}
              {contractSaveError && <p className="hint hint--error">{contractSaveError}</p>}
            </div>
          ) : (
            <div className="form-fields-vertical contract-details-edit-form">
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
                  <option value="снят с контроля">снят с контроля</option>
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
                <label className="form-field-label" htmlFor="contract-term-from">Дата начала действия</label>
                <input
                  id="contract-term-from"
                  type="date"
                  value={contractDraft?.GN_contract_term_from ?? ''}
                  onChange={(event) => updateContractDraft('GN_contract_term_from', event.target.value)}
                />
              </div>
              <div className="form-field form-field-compact">
                <label className="form-field-label" htmlFor="contract-term-to">Дата окончания действия</label>
                <input
                  id="contract-term-to"
                  type="date"
                  value={contractDraft?.GN_contract_term_to ?? ''}
                  onChange={(event) => updateContractDraft('GN_contract_term_to', event.target.value)}
                />
              </div>
              <div className="form-field form-field-compact">
                <label className="form-field-label" htmlFor="contract-asez-number">Номер АСЭЗ</label>
                <input
                  id="contract-asez-number"
                  type="text"
                  value={contractDraft?.GN_contract_asez_number ?? ''}
                  onChange={(event) => updateContractDraft('GN_contract_asez_number', event.target.value)}
                />
              </div>
              <div className="form-field form-field-compact">
                <label className="form-field-label" htmlFor="contract-limit">Лимит договора, руб.</label>
                <input
                  id="contract-limit"
                  type="number"
                  step="0.01"
                  value={contractDraft?.GN_contract_limit ?? ''}
                  onChange={(event) => updateContractDraft('GN_contract_limit', event.target.value)}
                />
              </div>
              <div className="form-field form-field-compact">
                <label className="form-field-label" htmlFor="contract-vat">Используемый НДС</label>
                <select
                  id="contract-vat"
                  value={contractDraft?.GN_contract_vat ?? '22%'}
                  onChange={(event) => updateContractDraft('GN_contract_vat', event.target.value)}
                >
                  <option value="22%">22%</option>
                  <option value="без НДС">без НДС</option>
                  <option value="смешанный">смешанный</option>
                </select>
              </div>
              <div className="form-field form-field-compact">
                <label className="form-field-label" htmlFor="contract-fact">Факт, руб.</label>
                <input
                  id="contract-fact"
                  type="number"
                  step="0.01"
                  value={contractDraft?.GN_contract_fact ?? ''}
                  onChange={(event) => updateContractDraft('GN_contract_fact', event.target.value)}
                />
              </div>
              <div className="form-field form-field-compact">
                <label className="form-field-label" htmlFor="contract-fact-date">Месяц факта</label>
                <input
                  id="contract-fact-date"
                  type="month"
                  value={contractDraft?.GN_contract_fact_date?.slice(0, 7) ?? ''}
                  onChange={(event) => updateContractDraft('GN_contract_fact_date', event.target.value)}
                />
              </div>
              <div className="form-field form-field-compact">
                <label className="form-field-label" htmlFor="contract-basis">Основание заключения</label>
                <select
                  id="contract-basis"
                  value={contractDraft?.GN_contract_basis ?? '17.1.9'}
                  onChange={(event) => updateContractDraft('GN_contract_basis', event.target.value)}
                >
                  <option value="17.1.9">17.1.9</option>
                  <option value="ВЗЛ">ВЗЛ</option>
                  <option value="прочее">прочее</option>
                </select>
              </div>
              <p className="hint">Лицевой счет и подразделение расходов сохраняются сразу при выборе; отмена редактирования договора их не отменяет.</p>
              <div className="form-actions-row-compact">
                <button
                  type="button"
                  className="form-submit-btn"
                  onClick={() => void saveContractEdit()}
                  disabled={contractSaveLoading || bdrSavingId !== null}
                >
                  {contractSaveLoading ? 'Сохранение...' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  className="page-action-btn page-action-btn--secondary"
                  onClick={cancelContractEdit}
                  disabled={contractSaveLoading || bdrSavingId !== null}
                >
                  Отмена
                </button>
              </div>
              {contractSaveError && <p className="hint hint--error">Ошибка: {contractSaveError}</p>}
            </div>
          )}
        </div>
      )}

      {loading && !contractError && <p className="hint">Загрузка данных...</p>}
      {error && <p className="hint hint--error">Ошибка: {error}</p>}
      {!loading && !error && contractRows.length === 0 && <p className="hint">Нет строк для этого договора.</p>}

      {!loading && !error && contractRows.length > 0 && (
        <div className="guide-table-wrap">
          <table className="guide-table table-compact contract-details-table">
            <thead>
              <tr>
                <th>№</th>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contractRows.map((row, rowIndex) => (
                  <tr key={Number(row.GN_bdr_ID)}>
                    <td>{rowIndex + 1}</td>
                    {columns.map((col) => (
                      <td key={col}>
                        {isEditingContract && col === 'Лицевой счет' ? (
                          <select
                            aria-label={`Лицевой счет строки ${row.GN_bdr_ID}`}
                            value={String(row[col] ?? '')}
                            disabled={bdrSavingId !== null || contractSaveLoading}
                            onChange={(event) => void savePersonalAccount(Number(row.GN_bdr_ID), event.target.value)}
                          >
                            <option value="">Не выбран</option>
                            {String(row[col] ?? '') && !accountOptions.includes(String(row[col])) && (
                              <option value={String(row[col])}>{String(row[col])} (нет в договоре)</option>
                            )}
                            {accountOptions.map((account) => <option key={account} value={account}>{account}</option>)}
                          </select>
                        ) : isEditingContract && col === 'На кого расходы' ? (
                          <select
                            aria-label={`На кого расходы строки ${row.GN_bdr_ID}`}
                            value={String(row['На кого расходы ID'] ?? '')}
                            disabled={bdrSavingId !== null || contractSaveLoading}
                            onChange={(event) => void saveExpenseDepartment(Number(row.GN_bdr_ID), event.target.value)}
                          >
                            <option value="">Не выбрано</option>
                            {departmentOptions.map((department) => (
                              <option key={department.value} value={department.value}>{department.label}</option>
                            ))}
                          </select>
                        ) : col === 'БДР26корр'
                          ? BDR_CURRENCY_FORMATTER.format(parseBudgetAmount(row[col]))
                          : String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={columns.length}>Итого БДР26корр</td>
                <td>{BDR_CURRENCY_FORMATTER.format(totalBdr26Corr)}</td>
              </tr>
            </tfoot>
          </table>
          {accountSaveError && <p className="hint hint--error">Ошибка сохранения лицевого счёта: {accountSaveError}</p>}
          {expenseDepartmentSaveError && <p className="hint hint--error">Ошибка сохранения подразделения расходов: {expenseDepartmentSaveError}</p>}
        </div>
      )}

      <div className="contract-agreements-heading">
        <h3>Дополнительные соглашения</h3>
        {!isAddingAgreement && (
          <button
            type="button"
            className="contract-agreements-add"
            aria-label="Добавить соглашение"
            title="Добавить соглашение"
            onClick={() => setIsAddingAgreement(true)}
          >
            +
          </button>
        )}
      </div>
      {isAddingAgreement && (
        <div className="form-fields-compact contract-agreement-create-form">
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
          <div className="form-field form-field-compact contract-agreement-description">
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
                disabled={editLoading || isDeleteAgreement}
              >
                {editLoading ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                type="button"
                className="page-action-btn page-action-btn--secondary"
                onClick={cancelEditAgreement}
                disabled={editLoading || isDeleteAgreement}
              >
                Отмена
              </button>
              <button
                type="button"
                className="page-action-btn page-action-btn--danger"
                onClick={() => void deleteAgreement()}
                disabled={editLoading || isDeleteAgreement}
              >
                {isDeleteAgreement ? 'Удаление...' : 'Удалить'}
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
                  <td>{formatDateDisplay(agreement.GN_additional_agreement_date)}</td>
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
