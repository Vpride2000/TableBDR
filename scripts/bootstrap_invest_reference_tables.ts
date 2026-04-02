import 'dotenv/config';
import { Client } from 'pg';

interface ReferenceTableDefinition {
  tableName: string;
  idColumn: string;
  valueColumn: string;
  seedValues: string[];
}

const TABLES: ReferenceTableDefinition[] = [
  {
    tableName: 'GN_invest_okdp_tko_is_prit',
    idColumn: 'GN_invest_okdp_tko_is_prit_id',
    valueColumn: 'GN_invest_okdp_tko_is_prit',
    seedValues: [
      '3531100000000',
      '3531200000000',
      '3531300000000',
      '3531400000000',
      '3531500000000',
    ],
  },
  {
    tableName: 'GN_invest_ogruz_rekvizit',
    idColumn: 'GN_invest_ogruz_rekvizit_id',
    valueColumn: 'GN_invest_ogruz_rekvizit',
    seedValues: [
      'Реквизит А',
      'Реквизит Б',
      'Реквизит В',
      'Реквизит Г',
      'Реквизит Д',
    ],
  },
];

async function createDbClient(): Promise<Client> {
  const client = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'pgpwd4habr',
    database: process.env.PGDATABASE || 'postgres',
  });

  await client.connect();
  return client;
}

async function bootstrapTable(client: Client, definition: ReferenceTableDefinition): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${definition.tableName}" (
      "${definition.idColumn}" SERIAL NOT NULL UNIQUE,
      "${definition.valueColumn}" TEXT NOT NULL,
      PRIMARY KEY("${definition.idColumn}")
    )
  `);

  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM "${definition.tableName}"`
  );

  if (Number(result.rows[0]?.count ?? '0') > 0) {
    return;
  }

  for (const value of definition.seedValues) {
    await client.query(
      `INSERT INTO "${definition.tableName}" ("${definition.valueColumn}") VALUES ($1)`,
      [value]
    );
  }
}

async function main(): Promise<void> {
  const client = await createDbClient();

  try {
    for (const definition of TABLES) {
      await bootstrapTable(client, definition);
    }

    for (const definition of TABLES) {
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "${definition.tableName}"`
      );

      console.log(`${definition.tableName}: ${result.rows[0]?.count ?? '0'} rows`);
    }

    console.log('✅ Invest reference tables are ready');
  } catch (err) {
    console.error('❌ Failed to bootstrap invest reference tables');
    console.error(err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();