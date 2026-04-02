import 'dotenv/config';
import { Client } from 'pg';

interface ContractRowSeed {
  contractorId: number;
  dogovorId: number;
  sedLaunchDate: string;
  asezLoadDate: string;
  state: string;
  statusUpdatedAt: string;
}

const SEEDS: ContractRowSeed[] = [
  { contractorId: 1, dogovorId: 1, sedLaunchDate: '2026-01-10', asezLoadDate: '2026-01-12', state: 'Запущен', statusUpdatedAt: '2026-01-13' },
  { contractorId: 2, dogovorId: 2, sedLaunchDate: '2026-01-15', asezLoadDate: '2026-01-16', state: 'В работе', statusUpdatedAt: '2026-01-17' },
  { contractorId: 3, dogovorId: 3, sedLaunchDate: '2026-01-20', asezLoadDate: '2026-01-22', state: 'Проверка', statusUpdatedAt: '2026-01-23' },
  { contractorId: 4, dogovorId: 4, sedLaunchDate: '2026-01-25', asezLoadDate: '2026-01-27', state: 'Согласование', statusUpdatedAt: '2026-01-28' },
  { contractorId: 5, dogovorId: 5, sedLaunchDate: '2026-02-01', asezLoadDate: '2026-02-03', state: 'Завершен', statusUpdatedAt: '2026-02-04' },
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

async function main(): Promise<void> {
  const client = await createDbClient();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "GN_contracts" (
        "GN_contract_id" SERIAL NOT NULL UNIQUE,
        "GN_contract_contractor_FK" INTEGER NOT NULL REFERENCES "GN_contractor"("GN_c_id") ON DELETE NO ACTION,
        "GN_contract_dogovor_FK" INTEGER NOT NULL REFERENCES "GN_dogovor"("GN_dgv_id") ON DELETE NO ACTION,
        "GN_contract_sed_launch_date" DATE NOT NULL,
        "GN_contract_asez_load_date" DATE NOT NULL,
        "GN_contract_state" TEXT NOT NULL,
        "GN_contract_status_updated_at" DATE NOT NULL,
        PRIMARY KEY("GN_contract_id")
      )
    `);

    const countResult = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "GN_contracts"`);
    if (Number(countResult.rows[0]?.count ?? '0') === 0) {
      for (const seed of SEEDS) {
        await client.query(
          `INSERT INTO "GN_contracts" (
             "GN_contract_contractor_FK",
             "GN_contract_dogovor_FK",
             "GN_contract_sed_launch_date",
             "GN_contract_asez_load_date",
             "GN_contract_state",
             "GN_contract_status_updated_at"
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [seed.contractorId, seed.dogovorId, seed.sedLaunchDate, seed.asezLoadDate, seed.state, seed.statusUpdatedAt]
        );
      }
    }

    const verify = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "GN_contracts"`);
    console.log(`GN_contracts: ${verify.rows[0]?.count ?? '0'} rows`);
    console.log('✅ Contracts table is ready');
  } catch (err) {
    console.error('❌ Failed to bootstrap contracts table');
    console.error(err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();