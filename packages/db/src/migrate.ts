import { config } from "dotenv";
config({ path: new URL("../../../.env", import.meta.url).pathname });
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { createDb } from "./index";

const db = createDb();
await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
console.log("migrations applied");
process.exit(0);
