import { Fragment } from 'react';

type DepartmentSummary = {
  department: string;
  totalLimit: number;
  paoItems: Array<{ paoItem: string; totalLimit: number }>;
};

interface BudgetSummaryByDepartmentProps {
  summaryByDepartment: DepartmentSummary[];
  summaryTotalLimit: number;
}

const SUMMARY_NUMBER_FORMATTER = new Intl.NumberFormat('ru-RU');

export default function BudgetSummaryByDepartment({
  summaryByDepartment,
  summaryTotalLimit,
}: BudgetSummaryByDepartmentProps) {
  return (
    <table className="guide-table table-compact budget-summary-table">
      <thead>
        <tr>
          <th>Подразделение</th>
          <th>Сумма лимита</th>
        </tr>
      </thead>
      <tbody>
        {summaryByDepartment.map((item) => (
          <Fragment key={item.department}>
            <tr className="budget-summary-department-row">
              <td>{item.department}</td>
              <td>{SUMMARY_NUMBER_FORMATTER.format(item.totalLimit)}</td>
            </tr>
            {item.paoItems.map((pao) => (
              <tr key={`${item.department}-${pao.paoItem}`} className="budget-summary-detail-row">
                <td>↳ {pao.paoItem}</td>
                <td>{SUMMARY_NUMBER_FORMATTER.format(pao.totalLimit)}</td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
      <tfoot>
        <tr className="budget-summary-total-row">
          <td>Итого</td>
          <td>{SUMMARY_NUMBER_FORMATTER.format(summaryTotalLimit)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
