// Компонент матрицы сводки по статьям бюджета и подразделениям.
// Отображает перекрестную таблицу лимитов в разрезе статьи Бюджета и подразделения.
type BudgetItemDepartmentSummaryRow = {
  budgetItem: string;
  byDepartment: Record<string, number>;
  total: number;
};

interface BudgetSummaryByBudgetItemDepartmentProps {
  departments: string[];
  rows: BudgetItemDepartmentSummaryRow[];
  totalsByDepartment: Record<string, number>;
  total: number;
}

const SUMMARY_NUMBER_FORMATTER = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function BudgetSummaryByBudgetItemDepartment({
  departments,
  rows,
  totalsByDepartment,
  total,
}: BudgetSummaryByBudgetItemDepartmentProps) {
  return (
    <table className="guide-table table-compact forecast-pivot-table budget-summary-table budget-summary-matrix-table">
      <thead>
        <tr>
          <th>Статья бюджета</th>
          {departments.map((department) => (
            <th key={department}>{department}</th>
          ))}
          <th className="number-cell forecast-total-col">Итого</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.budgetItem}>
            <td>{row.budgetItem}</td>
            {departments.map((department) => (
              <td key={`${row.budgetItem}-${department}`} className="number-cell">
                {SUMMARY_NUMBER_FORMATTER.format(row.byDepartment[department] ?? 0)}
              </td>
            ))}
            <td className="number-cell forecast-total-col">{SUMMARY_NUMBER_FORMATTER.format(row.total)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="budget-summary-total-row">
          <td>Итого</td>
          {departments.map((department) => (
            <td key={`pivot-total-${department}`} className="number-cell">
              {SUMMARY_NUMBER_FORMATTER.format(totalsByDepartment[department] ?? 0)}
            </td>
          ))}
          <td className="number-cell forecast-total-col">{SUMMARY_NUMBER_FORMATTER.format(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
