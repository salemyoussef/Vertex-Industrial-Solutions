require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

async function runMigration() {
  try {
    await client.connect();
    
    console.log('Dropping existing tables to reset database for SaaS architecture...');
    await client.query(`DROP TABLE IF EXISTS telemetry CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS audit_logs CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS devices CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS users CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS zones CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS companies CASCADE;`);

    console.log('Creating new schema...');
    await client.query(`
      CREATE TABLE companies (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          subscription_status VARCHAR(50) DEFAULT 'Active',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          username VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role VARCHAR(50) NOT NULL CHECK (role IN ('Super Admin', 'Manager', 'Engineer')),
          site_id INTEGER,
          latitude DOUBLE PRECISION,
          longitude DOUBLE PRECISION,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE audit_logs (
          log_id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          action_type VARCHAR(255) NOT NULL,
          target_id INTEGER,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          details JSONB
      );
    `);

    await client.query(`
      CREATE TABLE zones (
          id INTEGER PRIMARY KEY,
          name VARCHAR(255) NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE devices (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          mqtt_topic_base VARCHAR(255) UNIQUE NOT NULL,
          zone_id INTEGER,
          site_id INTEGER,
          creator_id INTEGER,
          allow_all_edit BOOLEAN DEFAULT false,
          mqtt_username VARCHAR(255) UNIQUE NOT NULL,
          mqtt_password TEXT NOT NULL,
          ui_configuration JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE telemetry (
          time TIMESTAMP WITH TIME ZONE NOT NULL,
          device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
          feature VARCHAR(255) NOT NULL,
          value DOUBLE PRECISION NOT NULL
      );
    `);

    // Turn telemetry into a TimescaleDB hypertable
    await client.query(`CREATE EXTENSION IF NOT EXISTS timescaledb;`);
    await client.query(`SELECT create_hypertable('telemetry', 'time', if_not_exists => TRUE);`);

    await client.query(`CREATE INDEX idx_users_company_id ON users(company_id);`);
    await client.query(`CREATE INDEX idx_users_role ON users(role);`);
    await client.query(`CREATE INDEX idx_audit_logs_company_id ON audit_logs(company_id);`);
    await client.query(`CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);`);
    await client.query(`CREATE INDEX idx_devices_company_id ON devices(company_id);`);
    await client.query(`CREATE INDEX idx_telemetry_device_time ON telemetry(device_id, time DESC);`);

    console.log('Migration executed successfully');
  } catch (err) {
    console.error('Migration failed', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

runMigration();

