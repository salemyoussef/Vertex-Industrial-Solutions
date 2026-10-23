require('dotenv').config();
const pool = require('./db');

async function test() {
  const comp = await pool.query('SELECT * FROM companies');
  console.log('Companies:', comp.rows);
  const users = await pool.query('SELECT * FROM users');
  console.log('Users:', users.rows);
  pool.end();
}
test();
