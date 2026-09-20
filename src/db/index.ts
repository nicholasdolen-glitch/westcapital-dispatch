import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

const DB_URL = process.env.DATABASE_URL ?? "file:./dispatch.db";

type Db = LibSQLDatabase<typeof schema>;

// Survive Next.js dev HMR without leaking connections.
const g = globalThis as unknown as { __dispatchDb?: Db; __dispatchClient?: Client };

function make(): Db {
  const client = createClient({ url: DB_URL });
  g.__dispatchClient = client;
  return drizzle(client, { schema });
}

export const db: Db = g.__dispatchDb ?? (g.__dispatchDb = make());
export { schema };
