export function formatBudgetDepartment(department: unknown, expenseDepartment: unknown): string {
  const name = String(department ?? '').trim();
  const expense = String(expenseDepartment ?? '').trim();
  return expense ? `${name}${name ? ' ' : ''}(${expense})` : name;
}
