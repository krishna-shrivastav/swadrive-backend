const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.postgresql://postgres:swadrive@123@db.vquvwrrzdbvxjxnkqyih.supabase.co:5432/postgres,
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;
