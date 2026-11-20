export type DashboardEquipmentAccumulator = { quantity: number; cost: number }

export function addDashboardEquipment(
  equipment: Map<string, DashboardEquipmentAccumulator>,
  type: string,
  quantity: number,
  cost: number,
): void {
  const entry = equipment.get(type) ?? { quantity: 0, cost: 0 }
  entry.quantity += quantity
  entry.cost += cost
  equipment.set(type, entry)
}
