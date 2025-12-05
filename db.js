// db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,      // Railway Host
  user: process.env.DB_USER,      // root
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,  // railway
  port: process.env.DB_PORT,      // << IMPORTANT ( Railway port )
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
