const mysql = require('mysql2');
require('dotenv').config();

// Create a connection pool for better performance
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'qu47vi.h.filess.io',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'po_tracking_numberlaid',
    password: process.env.DB_PASSWORD || 'a1e653585880b8af3ea21d9b1a78d57e20368776',
    database: process.env.DB_NAME || 'po_tracking_numberlaid',
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false } // ✅ Important for Filess.io (requires SSL)
});

// Promisify for async/await usage
const promisePool = pool.promise();

module.exports = promisePool;
