import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://platform:platform123@postgres:5432/platform_db";

console.log("🧠 Using DATABASE_URL:", connectionString);

export const pool = new Pool({
  connectionString,
  ssl: false,
});
