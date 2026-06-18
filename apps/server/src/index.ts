import { getConfig } from "./config.js";
import { createDb } from "./db.js";
import { buildApp } from "./app.js";

const config = getConfig();
const db = createDb(config.databaseUrl, { dataDir: config.dataDir });
const app = buildApp(db, config);

const close = async () => {
  await app.close();
  db.close();
};

process.on("SIGINT", () => void close().then(() => process.exit(0)));
process.on("SIGTERM", () => void close().then(() => process.exit(0)));

await app.listen({ host: "0.0.0.0", port: config.port });
