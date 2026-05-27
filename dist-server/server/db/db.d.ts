import { Client } from 'pg';
export declare function createDbClient(): Promise<Client>;
export declare function ensureInvestReferenceTables(client: Client): Promise<void>;
export declare function ensureContractsTable(client: Client): Promise<void>;
export declare function ensureInvestProgramTable(client: Client): Promise<void>;
export declare function ensureContractAdditionalAgreementsTable(client: Client): Promise<void>;
export declare function ensureLimitCalculationTable(client: Client): Promise<void>;
export declare function ensureForecastMonthlyTable(client: Client): Promise<void>;
export declare function toFiniteNumber(value: unknown, fieldLabel: string): number;
export declare function buildFallbackCalculationLine(quantity: number, limit: number, unitLimit: number): import('../config/config.js').LimitCalculationResponseLine;
//# sourceMappingURL=db.d.ts.map