const mysql = require('mysql2/promise');

function getDatabaseConfig() {
  const config = {
    host: process.env.DB_HOST || '',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
  };

  const missing = Object.entries({
    DB_HOST: config.host,
    DB_USER: config.user,
    DB_NAME: config.database,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Missing database configuration: ${missing.join(', ')}`);
  }

  return config;
}

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...getDatabaseConfig(),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  return pool;
}

module.exports = {
  getDatabaseConfig,
  getPool,
};