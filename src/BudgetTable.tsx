import { useEffect, useState } from 'react';
import './styles.css';

type Row = Record<string, unknown>;

export default function BudgetTable() {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/gn/bdr')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Row[]>;
      })
      .then((rows) => setData(rows))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  return (
    <section className="budget">
      <h1>Бюджет услуг связи</h1>

      {loading && <p className="hint">Загрузка данных...</p>}
      {error && <p className="hint hint--error">Ошибка: {error}</p>}
      {!loading && !error && data.length === 0 && <p className="hint">Нет данных.</p>}

      {!loading && !error && data.length > 0 && (
        <div className="guide-table-wrap">
          <table className="guide-table table-compact">
            <thead>
              <tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  {columns.map((col) => <td key={col}>{String(row[col] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
