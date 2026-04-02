import './styles.css'

const INVEST_PROGRAM_STAGES = [
  {
    title: 'Инициатива',
    description: 'Формирование заявки и обоснования проекта.',
  },
  {
    title: 'Экспертиза',
    description: 'Техническая и финансовая проверка параметров.',
  },
  {
    title: 'Реализация',
    description: 'Исполнение работ и контроль освоения лимита.',
  },
]

export default function InvestProgramPage() {
  return (
    <section className="guide invest-program-section">
      <div className="guide-section invest-program-content">
        <h2>Инвест.программа</h2>
        <p className="hint">
          Раздел для планирования инвестиционных проектов: лимиты, сроки и статус исполнения.
        </p>

        <div className="invest-program-grid">
          {INVEST_PROGRAM_STAGES.map((stage) => (
            <article key={stage.title} className="invest-program-card">
              <h3>{stage.title}</h3>
              <p>{stage.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}