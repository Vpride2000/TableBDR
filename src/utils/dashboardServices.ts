export type DashboardServiceAccumulator = {
  contractorsContracts: Set<string>
  cost: number
}

export function addDashboardServiceCost(
  services: Map<string, DashboardServiceAccumulator>,
  service: string,
  contractorContract: string,
  cost: number,
): void {
  const entry = services.get(service) ?? { contractorsContracts: new Set<string>(), cost: 0 }
  entry.contractorsContracts.add(contractorContract)
  entry.cost += cost
  services.set(service, entry)
}
