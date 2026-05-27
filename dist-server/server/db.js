import { Client } from 'pg';
// Создает подключение к базе PostgreSQL по переменным окружения.
export async function createDbClient() {
    const client = new Client({
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'postgres',
    });
    await client.connect();
    return client;
}
export async function ensureDatabaseTables(client) {
    const requiredTables = [
        'GN_invest_okdp_tko_is_prit',
        'GN_invest_ogruz_rekvizit',
        'GN_contracts',
        'GN_invest_program',
        'GN_contract_additional_agreements',
        'GN_bdr_limit_calculation',
        'GN_bdr_monthly_forecast',
    ];
    const result = await client.query(`SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])`, [requiredTables]);
    const existingTables = new Set(result.rows.map((row) => row.table_name));
    const missingTables = requiredTables.filter((tableName) => !existingTables.has(tableName));
    if (missingTables.length > 0) {
        throw new Error(`Required database tables are missing: ${missingTables.join(', ')}`);
    }
}
// Приводит входное значение к конечному числу или выбрасывает ошибку для некорректных полей.
export function toFiniteNumber(value, fieldLabel) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid ${fieldLabel}`);
    }
    return parsed;
}
export function buildFallbackCalculationLine(quantity, limit, unitLimit) {
    if (quantity === 0) {
        return { lineOrder: 1, quantity: 0, tariff: 0, note: '' };
    }
    return {
        lineOrder: 1,
        quantity,
        tariff: (limit - unitLimit) / quantity,
        note: '',
    };
}
//# sourceMappingURL=db.js.map