require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');

const { getDatabaseConfig } = require('./db');

const migrationsDir = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(connection) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      checksum CHAR(64) NOT NULL,
      executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function getChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function getMigrationFiles() {
  const names = await fs.readdir(migrationsDir);

  return names
    .filter((name) => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right, 'en'));
}

async function applyMigrations() {
  const connection = await mysql.createConnection({
    ...getDatabaseConfig(),
    multipleStatements: true,
  });

  try {
    await ensureMigrationsTable(connection);

    const [appliedRows] = await connection.execute(
      'SELECT name, checksum FROM schema_migrations ORDER BY name ASC'
    );
    const appliedByName = new Map(appliedRows.map((row) => [row.name, row.checksum]));
    const migrationFiles = await getMigrationFiles();
    let appliedCount = 0;

    for (const fileName of migrationFiles) {
      const filePath = path.join(migrationsDir, fileName);
      const sql = await fs.readFile(filePath, 'utf-8');
      const checksum = getChecksum(sql);
      const existingChecksum = appliedByName.get(fileName);

      if (existingChecksum && existingChecksum !== checksum) {
        throw new Error(
          `Migration ${fileName} was already applied but its contents changed. Create a new migration file instead of editing an applied one.`
        );
      }

      if (existingChecksum) {
        continue;
      }

      await connection.query(sql);
      await connection.execute(
        'INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)',
        [fileName, checksum]
      );
      appliedCount += 1;
    }

    return appliedCount;
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  applyMigrations()
    .then((count) => {
      console.log(`Applied ${count} migration(s).`);
    })
    .catch((error) => {
      console.error('Migration failed.', error);
      process.exit(1);
    });
}

module.exports = {
  applyMigrations,
};