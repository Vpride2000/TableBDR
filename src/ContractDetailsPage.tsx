import { useEffect, useState } from 'react';
import './styles.css';

type Row = Record<string, unknown>;

interface ContractDetailsPageProps {
  contractName: string;
  onBack: () => void;
}

export default function ContractDetailsPage({ contractName, onBack }: ContractDetailsPageProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadContractRows(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/gn/bdr');
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || `HTTP ${response.status}`);
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
    </section>
  );
}
