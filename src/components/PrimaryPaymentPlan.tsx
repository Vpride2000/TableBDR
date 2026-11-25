import ExcelActionToolbar from './ExcelActionToolbar'
import { primaryBdrProgress } from '../utils/primaryBdr'

export const PAYMENT_PLAN_HEADERS = ['№', 'Контрагент', 'Предмет договора', 'Договор и дата', 'Номер документа', 'Сумма с НДС', 'Условие расчета']
const CELL_STYLE = { border: '1px solid #000', padding: '8px 10px' }
const HEADER_STYLE = {
  ...CELL_STYLE,
  backgroundColor: '#d9d9d9',
  color: '#000',
  fontSize: '0.9rem',
  fontWeight: 700,
  letterSpacing: 'normal',
  textAlign: 'center' as const,
  textTransform: 'none' as const,
}
const SPACER_STYLE = { border: 'none', height: '22px', padding: 0 }

export type PaymentPlanRow = {
  id: number | null
  contractor: string
  contractSubject: string
  contract: string
  calculation: string
  amount: number | string | null | undefined
}

export function formatBdr26Corr(amount: number | null): string {
  return amount === null ? '' : amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function PrimaryPaymentPlan({
  monthLabel,
  amounts,
  error,
  onExport,
  onClose,
}: {
  monthLabel: string
  amounts: PaymentPlanRow[]
  error: string | null
  onExport: () => void
  onClose: () => void
}): React.ReactElement {
  return (
    <section className="page-section">
      <h2>План платежей: {monthLabel}</h2>
      <ExcelActionToolbar onExport={onExport} showUpload={false} />
      {error && <p className="hint hint--error" role="alert">{error}</p>}
      <p className="hint">Исходные суммы отображаемых строк. Правила формирования плана платежей ещё не определены.</p>
      <div className="guide-table-wrap">
        <table className="guide-table table-compact">
          <thead>
            {Array.from({ length: 3 }, (_, index) => (
              <tr key={`top-spacer-${index}`} aria-hidden="true">
                <td colSpan={PAYMENT_PLAN_HEADERS.length} style={SPACER_STYLE} />
              </tr>
            ))}
            <tr>
              <td colSpan={PAYMENT_PLAN_HEADERS.length} style={{ ...CELL_STYLE, fontSize: '1rem', fontWeight: 700, textAlign: 'center' }}>
                Справка о планируемых расчетах
              </td>
            </tr>
            {Array.from({ length: 5 }, (_, index) => (
              <tr key={`bottom-spacer-${index}`} aria-hidden="true">
                <td colSpan={PAYMENT_PLAN_HEADERS.length} style={SPACER_STYLE} />
              </tr>
            ))}
            <tr>{PAYMENT_PLAN_HEADERS.map((header) => <th key={header} scope="col" style={HEADER_STYLE}>{header}</th>)}</tr>
            <tr>
              {PAYMENT_PLAN_HEADERS.map((_, index) => (
                <td key={`column-number-${index}`} style={HEADER_STYLE}>{index + 1}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {amounts.map(({ id, contractor, contractSubject, contract, amount, calculation }, index) => (
              <tr key={id ?? 'new'}>
                <td style={CELL_STYLE}>{index + 1}</td>
                <td style={CELL_STYLE}>{contractor}</td>
                <td style={CELL_STYLE}>{contractSubject}</td>
                <td style={CELL_STYLE}>{contract}</td>
                <td style={CELL_STYLE} />
                <td style={{ ...CELL_STYLE, textAlign: 'right' }}>
                  {amount == null || amount === '' ? '' : formatBdr26Corr(primaryBdrProgress(null, [amount]).total) || 'Некорректная сумма'}
                </td>
                <td style={CELL_STYLE}>{calculation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Итого: {formatBdr26Corr(primaryBdrProgress(null, amounts.map((item) => item.amount)).total) || 'Некорректная сумма'}</p>
      <button type="button" className="page-action-btn page-action-btn--secondary" onClick={onClose}>Закрыть</button>
    </section>
  )
}
