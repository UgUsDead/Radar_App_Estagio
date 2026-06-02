import { Pool } from "pg";
import { config } from "../config.js";

export function createPgPool(): Pool {
  return new Pool({
    connectionString: config.db.databaseUrl,
    max: 15
  });
}
