require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

async function seedSuperAdmin() {
  const username = process.env.ADMIN_DEFAULT_USER || 'admin';
  const password = process.env.ADMIN_DEFAULT_PASSWORD || 'adminpassword';
  const email = process.env.ADMIN_DEFAULT_EMAIL || 'admin@smartfactory.local';
  
  try {
    // Create a default company
    const companyResult = await pool.query(
      'INSERT INTO companies (name, email) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id',
      ['SmartFactory Admin', email]
    );
    const companyId = companyResult.rows[0].id;

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (company_id, username, email, password_hash, role, site_id) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (username) DO NOTHING',
      [companyId, username, email, hashedPassword, 'Super Admin', null]
    );
    console.log('Super Admin user created: username "admin", password "adminpassword"');
  } catch (err) {
    console.error('Error seeding admin', err);
  } finally {
    pool.end();
  }
}

seedSuperAdmin();
