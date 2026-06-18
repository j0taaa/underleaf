import path from "node:path";

export type ServerConfig = {
  databaseUrl: string;
  dataDir: string;
  staticDir: string | null;
  latexEngine: "auto" | "latexmk" | "tectonic";
  latexmkBin: string;
  tectonicBin: string;
  port: number;
  webOrigin: string;
};

export function getConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const dataDir = overrides.dataDir ?? process.env.UNDERLEAF_DATA_DIR ?? path.resolve(process.cwd(), ".underleaf-data");

  return {
    dataDir,
    databaseUrl: overrides.databaseUrl ?? process.env.DATABASE_URL ?? path.join(dataDir, "underleaf.sqlite"),
    staticDir: overrides.staticDir ?? process.env.UNDERLEAF_STATIC_DIR ?? null,
    latexEngine: overrides.latexEngine ?? resolveLatexEngine(process.env.LATEX_ENGINE),
    latexmkBin: overrides.latexmkBin ?? process.env.LATEXMK_BIN ?? "latexmk",
    tectonicBin: overrides.tectonicBin ?? process.env.TECTONIC_BIN ?? "tectonic",
    port: overrides.port ?? Number(process.env.SERVER_PORT ?? 3001),
    webOrigin: overrides.webOrigin ?? process.env.WEB_ORIGIN ?? "http://localhost:5173"
  };
}

function resolveLatexEngine(value: string | undefined): ServerConfig["latexEngine"] {
  if (value === "latexmk" || value === "tectonic") return value;
  return "auto";
}
