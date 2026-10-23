const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'lenser_system',
  password: '***REMOVED***',
  port: 5432,
});

module.exports = pool;
