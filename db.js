const fs = require('fs');
const mysql = require('mysql2/promise');

function buildSslConfig() {
  if (process.env.DB_SSL !== 'true') return undefined;
  const ssl = { rejectUnauthorized: true };
  const caPath = process.env.DB_SSL_CA;
  const caPem = process.env.DB_CA_CERT;
  if (caPath && fs.existsSync(caPath)) {
    ssl.ca = fs.readFileSync(caPath);
  } else if (caPem) {
    ssl.ca = caPem.replace(/\\n/g, '\n');
  }
  return ssl;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'maqsis_simple',
  ssl: buildSslConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true
});

module.exports = { pool };
