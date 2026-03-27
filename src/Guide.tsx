import { useEffect, useState } from 'react';
import './styles.css';

type Row = Record<string, unknown>;

interface TableSection {
  title: string;
  endpoint: string;
  data: Row[];
  loading: boolean;
  error: string | null;
}

const TABLE_DEFS: { title: string; endpoint: string }[] = [
  { title: 'GN_department — Подразделения',            endpoint: '/api/gn/departments'      },
  { title: 'GN_budget_network_item — Статьи бюджета', endpoint: '/api/gn/budget-items'     },
  { title: 'PAO__budget_network_item — Статьи бюджета УС', endpoint: '/api/gn/pao-budget-items' },
  { title: 'GN_contractor — Контрагенты',              endpoint: '/api/gn/contractors'      },
  { title: 'GN_dogovor — Договора',                    endpoint: '/api/gn/dogovors'         },
  { title: 'GN_departament_object — Объекты',          endpoint: '/api/gn/objects'          },
];

function DataTable({ section }: { section: TableSection }) {
  if (section.loading) return <p className="hint">Загрузка...</p>;
  if (section.error)   return <p className="hint hint--error">Ошибка: {section.error}</p>;
  if (section.data.length === 0) return <p className="hint">Нет данных.</p>;

  const columns = Object.keys(section.data[0]);
  return (
    <div className="guide-table-wrap">
      <table className="guide-table">
        <thead>
          <tr>
            {columns.map((col) => <th key={col}>{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {section.data.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => <td key={col}>{String(row[col] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Guide() {
  const [sections, setSections] = useState<TableSection[]>(
    TABLE_DEFS.map((def) => ({ ...def, data: [], loading: true, error: null }))
  );

  useEffect(() => {
    TABLE_DEFS.forEach((def, idx) => {
      fetch(def.endpoint)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<Row[]>;
        })
        .then((data) => {
          setSections((prev) =>
            prev.map((s, i) => (i === idx ? { ...s, data, loading: false } : s))
          );
        })
        .catch((err: Error) => {
          setSections((prev) =>
            prev.map((s, i) => (i === idx ? { ...s, error: err.message, loading: false } : s))
          );
        });
    });
  }, []);

  return (
    <section className="guide">
      <h1>Справочник</h1>
      {sections.map((section) => (
        <div key={section.endpoint} className="guide-section">
          <h2>{section.title}</h2>
          <DataTable section={section} />
        </div>
      ))}
    </section>
  );
}

