import path from "node:path";

export type ServerConfig = {
  databaseUrl: string;
  dataDir: string;
  staticDir: string | null;
  authSecret: string;
  authUrl: string;
  trustedOrigins: string[];
  latexEngine: "auto" | "latexmk" | "tectonic";
  latexmkBin: string;
  tectonicBin: string;
  port: number;
  webOrigin: string;
};

export function getConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const dataDir = overrides.dataDir ?? process.env.UNDERLEAF_DATA_DIR ?? path.resolve(process.cwd(), ".underleaf-data");
  const webOrigin = overrides.webOrigin ?? process.env.WEB_ORIGIN ?? "http://localhost:5173";
  const authUrl = overrides.authUrl ?? process.env.BETTER_AUTH_URL ?? webOrigin;
  const trustedOrigins = overrides.trustedOrigins ?? collectTrustedOrigins(webOrigin, authUrl, process.env.BETTER_AUTH_TRUSTED_ORIGINS);

  return {
    dataDir,
    databaseUrl: overrides.databaseUrl ?? process.env.DATABASE_URL ?? path.join(dataDir, "underleaf.sqlite"),
    staticDir: overrides.staticDir ?? process.env.UNDERLEAF_STATIC_DIR ?? null,
    authSecret: overrides.authSecret ?? resolveAuthSecret(process.env.BETTER_AUTH_SECRET),
    authUrl,
    trustedOrigins,
    latexEngine: overrides.latexEngine ?? resolveLatexEngine(process.env.LATEX_ENGINE),
    latexmkBin: overrides.latexmkBin ?? process.env.LATEXMK_BIN ?? "latexmk",
    tectonicBin: overrides.tectonicBin ?? process.env.TECTONIC_BIN ?? "tectonic",
    port: overrides.port ?? Number(process.env.SERVER_PORT ?? 3001),
    webOrigin
  };
}

function resolveLatexEngine(value: string | undefined): ServerConfig["latexEngine"] {
  if (value === "latexmk" || value === "tectonic") return value;
  return "auto";
}

function collectTrustedOrigins(webOrigin: string, authUrl: string, rawOrigins: string | undefined): string[] {
  return Array.from(
    new Set(
      [webOrigin, authUrl, ...(rawOrigins?.split(",") ?? [])]
        .map((origin) => origin.trim())
        .filter(Boolean)
    )
  );
}

function resolveAuthSecret(value: string | undefined): string {
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is required in production");
  }
  return "underleaf-development-secret-change-before-production";
}
