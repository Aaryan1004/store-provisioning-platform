import { Pool } from "pg";

export const pool = new Pool({
  host: process.env.DB_HOST || "postgres",
  port: 5432,
  user: process.env.DB_USER || "platform",
  password: process.env.DB_PASSWORD || "platform123",
  database: process.env.DB_NAME || "platform_db",
});
