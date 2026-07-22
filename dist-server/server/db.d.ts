import { Client } from 'pg';
export declare function createDbClient(): Promise<Client>;
export declare function ensureDatabaseTables(client: Client): Promise<void>;
export declare function ensureContractColumns(client: Client): Promise<void>;
export declare function toFiniteNumber(value: unknown, fieldLabel: string): number;
export declare function buildFallbackCalculationLine(quantity: number, limit: number, unitLimit: number): import('./config.js').LimitCalculationResponseLine;
export declare function ensureSatellitesXmlTable(client: Client): Promise<void>;
export declare function ensureSatelliteGtNumbersTable(client: Client): Promise<void>;
export declare function ensureSatelliteColumns(client: Client): Promise<void>;
export declare function ensureCellularTables(client: Client): Promise<void>;
export declare function bootstrapCellularFromXlsx(client: Client, projectRoot: string): Promise<void>;
//# sourceMappingURL=db.d.ts.map