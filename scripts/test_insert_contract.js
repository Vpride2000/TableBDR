import { Client } from 'pg'

(async ()=>{
  const client = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'postgres',
  })

  try {
    await client.connect()
    const res = await client.query(
      `INSERT INTO "GN_contracts" (
         "GN_contract_contractor_FK",
         "GN_contract_dogovor_FK",
         "GN_contract_sed_launch_date",
         "GN_contract_asez_load_date",
         "GN_contract_state",
         "GN_contract_status_updated_at",
         "GN_contract_approval_status"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [null, 1, '2026-06-02', '2026-06-02', 'test', '2026-06-02', 'на согласовании']
    )
    console.log('Inserted:', res.rows[0])
  } catch (e) {
    console.error('DB ERROR:', e.stack || e)
  } finally {
    await client.end()
  }
})()
