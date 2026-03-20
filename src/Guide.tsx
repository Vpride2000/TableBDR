import { useEffect, useState } from 'react';
import './styles.css';

type GuideRow = {
  order_id: number;
  order_date: string;
  amount: number;
  order_status: string;
  customer_id: number;
  customer_name: string;
  email: string;
  phone: string;
  address: string;
};

export default function Guide() {
  const [rows, setRows] = useState<GuideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<GuideRow>>({});
  const [newRow, setNewRow] = useState<Partial<GuideRow>>({
    order_date: '',
    amount: 0,
    order_status: '',
    customer_name: '',
    email: '',
    phone: '',
    address: '',
  });

  async function fetchGuide() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/guide-data');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: GuideRow[] = await response.json();
      setRows(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchGuide();
  }, []);

  function startEditing(row: GuideRow) {
    setEditingId(row.order_id);
    setEditData({ ...row });
  }

  function cancelEditing() {
    setEditingId(null);
    setEditData({});
  }

  function updateField<K extends keyof GuideRow>(field: K, value: GuideRow[K]) {
    setEditData((prev) => ({ ...prev, [field]: value }));
  }

  function updateNewField<K extends keyof GuideRow>(field: K, value: GuideRow[K]) {
    setNewRow((prev) => ({ ...prev, [field]: value }));
  }

  async function addRow() {
    if (
      !newRow.order_date ||
      newRow.amount == null ||
      !newRow.order_status ||
      !newRow.customer_name ||
      !newRow.email
    ) {
      setError('Пожалуйста, заполните обязательные поля.');
      return;
    }

    const payload = {
      order_date: newRow.order_date,
      amount: Number(newRow.amount),
      order_status: newRow.order_status,
      customer_name: newRow.customer_name,
      email: newRow.email,
      phone: newRow.phone || '',
      address: newRow.address || '',
    };

    try {
      const response = await fetch('/api/guide-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await fetchGuide();
      setNewRow({
        order_date: '',
        amount: 0,
        order_status: '',
        customer_name: '',
        email: '',
        phone: '',
        address: '',
      });
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveRow(orderId: number) {
    if (!editData || editingId !== orderId) return;

    const payload = {
      order_date: editData.order_date,
      amount: Number(editData.amount),
      order_status: editData.order_status,
      customer_id: editData.customer_id,
      customer_name: editData.customer_name,
      email: editData.email,
      phone: editData.phone,
      address: editData.address,
    };

    try {
      const response = await fetch(`/api/guide-data/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await fetchGuide();
      setEditingId(null);
      setEditData({});
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="guide">
      <h1>Справочник заказов</h1>

      <div className="guide-new-row">
        <h2>Добавить новую запись</h2>
        <div className="guide-new-row-fields">
          <input
            type="date"
            value={newRow.order_date}
            onChange={(e) => updateNewField('order_date', e.target.value)}
            placeholder="Дата заказа"
          />
          <input
            type="number"
            value={newRow.amount}
            onChange={(e) => updateNewField('amount', Number(e.target.value))}
            placeholder="Сумма"
          />
          <input
            type="text"
            value={newRow.order_status}
            onChange={(e) => updateNewField('order_status', e.target.value)}
            placeholder="Статус"
          />
          <input
            type="text"
            value={newRow.customer_name}
            onChange={(e) => updateNewField('customer_name', e.target.value)}
            placeholder="Имя клиента"
          />
          <input
            type="email"
            value={newRow.email}
            onChange={(e) => updateNewField('email', e.target.value)}
            placeholder="Email"
          />
          <input
            type="text"
            value={newRow.phone}
            onChange={(e) => updateNewField('phone', e.target.value)}
            placeholder="Телефон"
          />
          <input
            type="text"
            value={newRow.address}
            onChange={(e) => updateNewField('address', e.target.value)}
            placeholder="Адрес"
          />
          <button type="button" onClick={() => void addRow()}>
            Добавить
          </button>
        </div>
      </div>

      {loading && <p className="hint">Загрузка...</p>}
      {error && <p className="hint hint--error">Ошибка: {error}</p>}

      {!loading && !error && rows.length === 0 && <p className="hint">Нет данных.</p>}

      {!loading && !error && rows.length > 0 && (
        <div className="guide-table-wrap">
          <table className="guide-table">
            <thead>
              <tr>
                <th>ID заказа</th>
                <th>Дата заказа</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>ID клиента</th>
                <th>Имя клиента</th>
                <th>Email</th>
                <th>Телефон</th>
                <th>Адрес</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isEditing = editingId === row.order_id;
                const activeRow = isEditing ? (editData as GuideRow) : row;
                return (
                  <tr key={row.order_id} className={isEditing ? 'editing' : ''}>
                    <td>{row.order_id}</td>
                    <td>
                      {isEditing ? (
                        <input
                          type="date"
                          value={activeRow.order_date}
                          onChange={(e) => updateField('order_date', e.target.value)}
                        />
                      ) : (
                        row.order_date
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="number"
                          value={activeRow.amount}
                          onChange={(e) => updateField('amount', Number(e.target.value))}
                        />
                      ) : (
                        row.amount
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={activeRow.order_status}
                          onChange={(e) => updateField('order_status', e.target.value)}
                        />
                      ) : (
                        row.order_status
                      )}
                    </td>
                    <td>{row.customer_id}</td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={activeRow.customer_name}
                          onChange={(e) => updateField('customer_name', e.target.value)}
                        />
                      ) : (
                        row.customer_name
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="email"
                          value={activeRow.email}
                          onChange={(e) => updateField('email', e.target.value)}
                        />
                      ) : (
                        row.email
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={activeRow.phone}
                          onChange={(e) => updateField('phone', e.target.value)}
                        />
                      ) : (
                        row.phone
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={activeRow.address}
                          onChange={(e) => updateField('address', e.target.value)}
                        />
                      ) : (
                        row.address
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <>
                          <button onClick={() => void saveRow(row.order_id)}>Сохранить</button>
                          <button onClick={cancelEditing}>Отмена</button>
                        </>
                      ) : (
                        <button onClick={() => startEditing(row)}>Редактировать</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
