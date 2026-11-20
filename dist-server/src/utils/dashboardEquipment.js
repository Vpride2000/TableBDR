export function addDashboardEquipment(equipment, type, quantity, cost) {
    const entry = equipment.get(type) ?? { quantity: 0, cost: 0 };
    entry.quantity += quantity;
    entry.cost += cost;
    equipment.set(type, entry);
}
//# sourceMappingURL=dashboardEquipment.js.map