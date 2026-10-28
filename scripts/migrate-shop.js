const fs = require('fs');
const path = require('path');
const { Client, escapeIdentifier } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const database = process.env.PGDATABASE || 'lenser_system';
const connection = {
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  password: process.env.PGPASSWORD,
  port: Number(process.env.PGPORT) || 5432,
};

async function ensureDatabase() {
  if (database === 'postgres') return;

  const client = new Client({ ...connection, database: 'postgres' });
  await client.connect();

  try {
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [database],
    );

    if (rowCount === 0) {
      await client.query(`CREATE DATABASE ${escapeIdentifier(database)}`);
      console.log(`Created database ${database}`);
    } else {
      console.log(`Database ${database} already exists`);
    }
  } finally {
    await client.end();
  }
}

async function migrate() {
  let pool;
  try {
    await ensureDatabase();
    pool = require('../config/db');

    const schemaSql = fs.readFileSync(
      path.join(__dirname, '..', 'schema.sql'),
      'utf8',
    );
    await pool.query(schemaSql);
    console.log('Shop tables are ready');
  } catch (error) {
    console.error('Shop migration failed:', error);
    if (String(error.message).includes('permission denied to create database')) {
      console.error(
        `The PostgreSQL role "${connection.user}" cannot create databases. Create it manually, then rerun npm run migrate:shop:\n  createdb -h ${connection.host} -p ${connection.port} -U ${connection.user} ${database}`,
      );
    }
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
  }
}

migrate();
