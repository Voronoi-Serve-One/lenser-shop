const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function migrate() {
  try {
    const schemaSql = fs.readFileSync(
      path.join(__dirname, '..', 'schema.sql'),
      'utf8',
    );
    await pool.query(schemaSql);
    console.log('Shop tables are ready');
  } catch (error) {
    console.error('Shop migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
