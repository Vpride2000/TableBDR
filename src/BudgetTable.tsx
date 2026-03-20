import { useEffect, useMemo, useState } from 'react';
import './styles.css';

export type BudgetRow = {
  id: number;
  service_name: string;
  category: string;
  monthly_cost: number;
  consumption: string;
  contract_date: string;
  renewal_date: string;
  provider: string;
  status: string;
  discount_percent: number;
  notes: string;
};

export default function BudgetTable() {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/budget')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: BudgetRow[]) => setRows(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => {
    const result: BudgetRow[][] = [];
    for (let i = 0; i < rows.length; i += 2) {
      result.push(rows.slice(i, i + 2));
    }
    return result;
  }, [rows]);

  function toggleGroup(index: number) {
    setExpandedGroup((current) => (current === index ? null : index));
  }

  return (
    <section className="budget">
      <h1>Бюджет услуг связи</h1>

      {loading && <p className="hint">Загрузка данных...</p>}
      {error && (
        <p className="hint hint--error">
          Не удалось получить данные: <em>{error}</em>
        </p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="hint">В базе нет данных. Запустите сервер ещё раз.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <table className="budget-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Сервис</th>
              <th>Категория</th>
              <th>Стоимость (₽)</th>
              <th>Потребление</th>
              <th>Дата контракта</th>
              <th>Продление</th>
              <th>Провайдер</th>
              <th>Статус</th>
              <th>Скидка %</th>
            </tr>
          </thead>
          {groups.map((group, groupIndex) => {
            const isExpanded = expandedGroup === groupIndex;
            const [firstRow, secondRow] = group;
            return (
              <tbody key={groupIndex}>
                <tr
                  className="budget-row budget-row--toggle"
                  onClick={() => toggleGroup(groupIndex)}
                >
                  <td data-label="ID">{firstRow.id}</td>
                  <td data-label="Сервис">{firstRow.service_name}</td>
                  <td data-label="Категория">{firstRow.category}</td>
                  <td data-label="Стоимость">{firstRow.monthly_cost}</td>
                  <td data-label="Потребление">{firstRow.consumption}</td>
                  <td data-label="Дата контракта">{firstRow.contract_date}</td>
                  <td data-label="Продление">{firstRow.renewal_date}</td>
                  <td data-label="Провайдер">{firstRow.provider}</td>
                  <td data-label="Статус">
                    <span
                      className={`status status--${firstRow.status.toLowerCase()}`}
                    >
                      {firstRow.status}
                    </span>
                  </td>
                  <td data-label="Скидка">
                    <span className="discount">{firstRow.discount_percent}%</span>
                    <button
                      className="budget-row__toggle"
                      type="button"
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? '▲' : '▼'}
                    </button>
                  </td>
                </tr>
                {isExpanded && secondRow && (
                  <tr className="budget-row budget-row--detail">
                    <td data-label="ID">{secondRow.id}</td>
                    <td data-label="Сервис">{secondRow.service_name}</td>
                    <td data-label="Категория">{secondRow.category}</td>
                    <td data-label="Стоимость">{secondRow.monthly_cost}</td>
                    <td data-label="Потребление">{secondRow.consumption}</td>
                    <td data-label="Дата контракта">{secondRow.contract_date}</td>
                    <td data-label="Продление">{secondRow.renewal_date}</td>
                    <td data-label="Провайдер">{secondRow.provider}</td>
                    <td data-label="Статус">
                      <span
                        className={`status status--${secondRow.status.toLowerCase()}`}
                      >
                        {secondRow.status}
                      </span>
                    </td>
                    <td data-label="Скидка">
                      <span className="discount">{secondRow.discount_percent}%</span>
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}

        </table>
      )}
    </section>
  );
}
