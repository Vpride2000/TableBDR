import 'dotenv/config';
import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

async function initializeDatabase(): Promise<void> {
  const client = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'pgpwd4habr',
    database: process.env.PGDATABASE || 'postgres',
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Read init-db.sql file
    const sqlPath = join(process.cwd(), 'server', 'init-db.sql');
    const sql = readFileSync(sqlPath, 'utf-8');

    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0);

    for (const statement of statements) {
      try {
        await client.query(statement);
        console.log('✓ Executed statement');
      } catch (err) {
        console.error('Error executing statement:', err);
      }
    }

    console.log('✅ Database initialized successfully');
  } catch (err) {
    console.error('❌ Database initialization failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

initializeDatabase();
