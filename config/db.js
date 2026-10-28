const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'lenser_system',
  password: process.env.PGPASSWORD,
  port: Number(process.env.PGPORT) || 5432,
});

module.exports = pool;
