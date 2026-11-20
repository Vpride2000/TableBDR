export function addDashboardServiceCost(services, service, contractorContract, cost) {
    const entry = services.get(service) ?? { contractorsContracts: new Set(), cost: 0 };
    entry.contractorsContracts.add(contractorContract);
    entry.cost += cost;
    services.set(service, entry);
}
//# sourceMappingURL=dashboardServices.js.map