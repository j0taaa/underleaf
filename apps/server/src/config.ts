import path from "node:path";

export type ServerConfig = {
  databaseUrl: string;
  dataDir: string;
  latexmkBin: string;
  port: number;
  webOrigin: string;
};

export function getConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const dataDir = overrides.dataDir ?? process.env.UNDERLEAF_DATA_DIR ?? path.resolve(process.cwd(), ".underleaf-data");

  return {
    dataDir,
    databaseUrl: overrides.databaseUrl ?? process.env.DATABASE_URL ?? path.join(dataDir, "underleaf.sqlite"),
    latexmkBin: overrides.latexmkBin ?? process.env.LATEXMK_BIN ?? "latexmk",
    port: overrides.port ?? Number(process.env.SERVER_PORT ?? 3001),
    webOrigin: overrides.webOrigin ?? process.env.WEB_ORIGIN ?? "http://localhost:5173"
  };
}
