// Компонент простого свода: какой статье бюджета соответствуют договоры (или наоборот).
// Показывает группировку без суммирования лимитов — только перечень соответствий.
type GroupedMappingItem = {
  label: string;
  items: string[];
};

interface BudgetSummaryByContractPaoItemProps {
  groupHeader: string;
  itemsHeader: string;
  groups: GroupedMappingItem[];
}

export default function BudgetSummaryByContractPaoItem({
  groupHeader,
  itemsHeader,
  groups,
}: BudgetSummaryByContractPaoItemProps) {
  return (
    <table className="guide-table table-compact budget-summary-table">
      <thead>
        <tr>
          <th>{groupHeader}</th>
          <th>{itemsHeader}</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <tr key={group.label}>
            <td>{group.label}</td>
            <td>
              <ul className="budget-summary-mapping-list">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
