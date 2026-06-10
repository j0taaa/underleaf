import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type ProjectRow = {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type FileRow = {
  id: string;
  projectId: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type CompileStatus = "queued" | "running" | "success" | "error";

export type CompileJobRow = {
  id: string;
  projectId: string;
  status: CompileStatus;
  stdout: string;
  stderr: string;
  pdfPath: string | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
};

export type UnderleafDb = ReturnType<typeof createDb>;

export function createDb(databaseUrl: string) {
  fs.mkdirSync(path.dirname(databaseUrl), { recursive: true });
  const db = new Database(databaseUrl);

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, path)
    );

    CREATE TABLE IF NOT EXISTS compile_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      stdout TEXT NOT NULL DEFAULT '',
      stderr TEXT NOT NULL DEFAULT '',
      pdf_path TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.prepare(
    "INSERT OR IGNORE INTO users (id, email, display_name, created_at) VALUES (?, ?, ?, ?)"
  ).run("local-user", "local@underleaf.invalid", "Local User", new Date().toISOString());

  return {
    close: () => db.close(),
    listProjects(): ProjectRow[] {
      return db.prepare("SELECT id, owner_id as ownerId, name, created_at as createdAt, updated_at as updatedAt FROM projects ORDER BY updated_at DESC").all() as ProjectRow[];
    },
    getProject(id: string): ProjectRow | undefined {
      return db.prepare("SELECT id, owner_id as ownerId, name, created_at as createdAt, updated_at as updatedAt FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    },
    createProject(project: ProjectRow): void {
      db.prepare("INSERT INTO projects (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
        project.id,
        project.ownerId,
        project.name,
        project.createdAt,
        project.updatedAt
      );
    },
    updateProject(id: string, name: string, updatedAt: string): boolean {
      const result = db.prepare("UPDATE projects SET name = ?, updated_at = ? WHERE id = ?").run(name, updatedAt, id);
      return result.changes > 0;
    },
    deleteProject(id: string): boolean {
      const result = db.prepare("DELETE FROM projects WHERE id = ?").run(id);
      return result.changes > 0;
    },
    listFiles(projectId: string): FileRow[] {
      return db.prepare("SELECT id, project_id as projectId, path, created_at as createdAt, updated_at as updatedAt FROM files WHERE project_id = ? ORDER BY path ASC").all(projectId) as FileRow[];
    },
    getFile(projectId: string, fileId: string): FileRow | undefined {
      return db.prepare("SELECT id, project_id as projectId, path, created_at as createdAt, updated_at as updatedAt FROM files WHERE project_id = ? AND id = ?").get(projectId, fileId) as FileRow | undefined;
    },
    getFileByPath(projectId: string, filePath: string): FileRow | undefined {
      return db.prepare("SELECT id, project_id as projectId, path, created_at as createdAt, updated_at as updatedAt FROM files WHERE project_id = ? AND path = ?").get(projectId, filePath) as FileRow | undefined;
    },
    createFile(file: FileRow): void {
      db.prepare("INSERT INTO files (id, project_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
        file.id,
        file.projectId,
        file.path,
        file.createdAt,
        file.updatedAt
      );
    },
    updateFileTimestamp(projectId: string, fileId: string, updatedAt: string): boolean {
      const result = db.prepare("UPDATE files SET updated_at = ? WHERE project_id = ? AND id = ?").run(updatedAt, projectId, fileId);
      db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(updatedAt, projectId);
      return result.changes > 0;
    },
    deleteFile(projectId: string, fileId: string): boolean {
      const result = db.prepare("DELETE FROM files WHERE project_id = ? AND id = ?").run(projectId, fileId);
      return result.changes > 0;
    },
    createCompileJob(job: CompileJobRow): void {
      db.prepare("INSERT INTO compile_jobs (id, project_id, status, stdout, stderr, pdf_path, duration_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        job.id,
        job.projectId,
        job.status,
        job.stdout,
        job.stderr,
        job.pdfPath,
        job.durationMs,
        job.createdAt,
        job.updatedAt
      );
    },
    updateCompileJob(job: CompileJobRow): void {
      db.prepare("UPDATE compile_jobs SET status = ?, stdout = ?, stderr = ?, pdf_path = ?, duration_ms = ?, updated_at = ? WHERE id = ?").run(
        job.status,
        job.stdout,
        job.stderr,
        job.pdfPath,
        job.durationMs,
        job.updatedAt,
        job.id
      );
      db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(job.updatedAt, job.projectId);
    },
    latestCompileJob(projectId: string): CompileJobRow | undefined {
      return db.prepare("SELECT id, project_id as projectId, status, stdout, stderr, pdf_path as pdfPath, duration_ms as durationMs, created_at as createdAt, updated_at as updatedAt FROM compile_jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").get(projectId) as CompileJobRow | undefined;
    }
  };
}
