type PaoItemSummary = {
  paoItem: string;
  totalLimit: number;
};

interface BudgetSummaryByPaoItemProps {
  summaryByPaoItem: PaoItemSummary[];
  summaryPaoTotalLimit: number;
}

const SUMMARY_NUMBER_FORMATTER = new Intl.NumberFormat('ru-RU');

export default function BudgetSummaryByPaoItem({
  summaryByPaoItem,
  summaryPaoTotalLimit,
}: BudgetSummaryByPaoItemProps) {
  return (
    <table className="guide-table table-compact budget-summary-table">
      <thead>
        <tr>
          <th>Статья бюджета УС</th>
          <th>Сумма лимита</th>
        </tr>
      </thead>
      <tbody>
        {summaryByPaoItem.map((item) => (
          <tr key={item.paoItem} className="budget-summary-department-row">
            <td>{item.paoItem}</td>
            <td>{SUMMARY_NUMBER_FORMATTER.format(item.totalLimit)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="budget-summary-total-row">
          <td>Итого</td>
          <td>{SUMMARY_NUMBER_FORMATTER.format(summaryPaoTotalLimit)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
