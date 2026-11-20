export type DashboardServiceAccumulator = {
    contractorsContracts: Set<string>;
    cost: number;
};
export declare function addDashboardServiceCost(services: Map<string, DashboardServiceAccumulator>, service: string, contractorContract: string, cost: number): void;
//# sourceMappingURL=dashboardServices.d.ts.map