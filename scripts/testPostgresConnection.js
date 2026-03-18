#!/usr/bin/env node

// Simple script to verify connectivity to a local PostgreSQL server.
// Usage: node scripts/testPostgresConnection.js

require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'pgpwd4habr',
    database: process.env.PGDATABASE || 'postgres',
  });

  try {
    await client.connect();
    const res = await client.query('SELECT version()');
    console.log('✅ Connected to PostgreSQL successfully');
    console.log('Server version:', res.rows[0].version);
  } catch (err) {
    console.error('❌ Failed to connect to PostgreSQL:');
    console.error(err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
