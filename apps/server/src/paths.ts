import fs from "node:fs/promises";
import path from "node:path";

export function normalizeProjectPath(input: string): string {
  const unixPath = input.replaceAll("\\", "/").trim();
  const normalized = path.posix.normalize(unixPath);

  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized === ".." || path.posix.isAbsolute(normalized)) {
    throw new Error("Invalid project path");
  }

  return normalized;
}

export function projectRoot(dataDir: string, projectId: string): string {
  return path.join(dataDir, "projects", projectId);
}

export function projectFilePath(dataDir: string, projectId: string, relativePath: string): string {
  return path.join(projectRoot(dataDir, projectId), normalizeProjectPath(relativePath));
}

export async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}
