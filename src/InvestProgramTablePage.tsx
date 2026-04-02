import './styles.css'

const INVEST_TABLE_COLUMNS = [
  'код ПЭО',
  'Наименование',
  'Кол-во',
  'ОКДП ТКО для ИС ПРИТ',
  'поставщик',
  'ПЗП',
  'отчет агента',
  'АП',
  'Спецификация',
  'Код МТР',
  'Огрузочный реквизит',
  'ПФ/НПФ',
  'Статус',
  'оплата',
  'СЭД СПЕЦ',
  'СЭД отчет агента',
  'Состояние',
  'в бюджете',
  'реальная цена без НДС за шт',
  'реальная сумма без НДС + агентские цена без НДС',
  'Сумма без НДС',
  'Ввод в эксплуатацию',
  'Учёт ИТ',
]

export default function InvestProgramTablePage() {
  return (
    <section className="guide invest-program-section">
      <div className="guide-section invest-program-content">
        <h2>Инвест.программа: таблица</h2>

        <div className="guide-table-wrap invest-program-table-wrap">
          <table className="guide-table table-compact invest-program-table-min">
            <thead>
              <tr>
                {INVEST_TABLE_COLUMNS.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {INVEST_TABLE_COLUMNS.map((column) => (
                  <td key={column}>-</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}