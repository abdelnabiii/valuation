import "server-only";
import { createDb, type DB } from "@valuation/db";

const g = globalThis as unknown as { __db?: DB };
export function db(): DB {
  if (!g.__db) g.__db = createDb();
  return g.__db;
}
export * from "@valuation/db/schema";
