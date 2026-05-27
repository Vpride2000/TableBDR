import { Client } from 'pg';
export declare function createDbClient(): Promise<Client>;
export declare function ensureDatabaseTables(client: Client): Promise<void>;
export declare function toFiniteNumber(value: unknown, fieldLabel: string): number;
export declare function buildFallbackCalculationLine(quantity: number, limit: number, unitLimit: number): import('./config.js').LimitCalculationResponseLine;
//# sourceMappingURL=db.d.ts.map