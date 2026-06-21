import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type ProjectRow = {
  id: string;
  ownerId: string;
  name: string;
  rootFilePath: string | null;
  compileEngine: CompileEngine;
  autoCompile: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CompileEngine = "pdflatex" | "xelatex" | "lualatex";

export type FileRow = {
  id: string;
  projectId: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type FolderRow = {
  id: string;
  projectId: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type CompileStatus = "queued" | "running" | "success" | "error";

export type CompileDiagnosticSeverity = "error" | "warning";

export type CompileDiagnosticRow = {
  severity: CompileDiagnosticSeverity;
  filePath: string | null;
  line: number | null;
  column: number | null;
  message: string;
  raw: string;
};

export type CompileJobRow = {
  id: string;
  projectId: string;
  status: CompileStatus;
  stdout: string;
  stderr: string;
  pdfPath: string | null;
  durationMs: number | null;
  diagnostics: CompileDiagnosticRow[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectSnapshotRow = {
  id: string;
  projectId: string;
  label: string;
  fileCount: number;
  createdAt: string;
};

export type UnderleafDb = ReturnType<typeof createDb>;
type CreateDbOptions = { dataDir?: string };

export function createDb(databaseUrl: string, options: CreateDbOptions = {}) {
  fs.mkdirSync(path.dirname(databaseUrl), { recursive: true });
  const db = new Database(databaseUrl);

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      password TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      root_file_path TEXT,
      compile_engine TEXT NOT NULL DEFAULT 'pdflatex',
      auto_compile INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS folders (
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
      diagnostics TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      file_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_session_user_id ON session(user_id);
    CREATE INDEX IF NOT EXISTS idx_account_user_id ON account(user_id);
    CREATE INDEX IF NOT EXISTS idx_verification_identifier ON verification(identifier);
  `);

  ensureColumn(db, "users", "email_verified", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "users", "image", "TEXT");
  ensureColumn(db, "users", "updated_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "compile_jobs", "diagnostics", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "projects", "root_file_path", "TEXT");
  ensureColumn(db, "projects", "compile_engine", "TEXT NOT NULL DEFAULT 'pdflatex'");
  ensureColumn(db, "projects", "auto_compile", "INTEGER NOT NULL DEFAULT 0");

  return {
    close: () => db.close(),
    claimLegacyProjects(ownerId: string, updatedAt: string): void {
      const transaction = db.transaction(() => {
        const marker = db.prepare("SELECT value FROM app_meta WHERE key = ?").get("auth_migration_v1") as { value: string } | undefined;
        if (marker) return;

        db.prepare("UPDATE projects SET owner_id = ?, updated_at = ? WHERE owner_id = ?").run(ownerId, updatedAt, "local-user");
        db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run("auth_migration_v1", updatedAt);
      });

      transaction();
    },
    listProjects(ownerId: string): ProjectRow[] {
      const rows = db.prepare("SELECT id, owner_id as ownerId, name, root_file_path as rootFilePath, compile_engine as compileEngine, auto_compile as autoCompile, created_at as createdAt, updated_at as updatedAt FROM projects WHERE owner_id = ? ORDER BY updated_at DESC").all(ownerId) as ProjectSelectRow[];
      return rows.map(hydrateProject);
    },
    getProject(id: string, ownerId?: string): ProjectRow | undefined {
      const row = ownerId
        ? db.prepare("SELECT id, owner_id as ownerId, name, root_file_path as rootFilePath, compile_engine as compileEngine, auto_compile as autoCompile, created_at as createdAt, updated_at as updatedAt FROM projects WHERE id = ? AND owner_id = ?").get(id, ownerId) as ProjectSelectRow | undefined
        : db.prepare("SELECT id, owner_id as ownerId, name, root_file_path as rootFilePath, compile_engine as compileEngine, auto_compile as autoCompile, created_at as createdAt, updated_at as updatedAt FROM projects WHERE id = ?").get(id) as ProjectSelectRow | undefined;
      return row ? hydrateProject(row) : undefined;
    },
    createProject(project: ProjectRow): void {
      db.prepare("INSERT INTO projects (id, owner_id, name, root_file_path, compile_engine, auto_compile, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        project.id,
        project.ownerId,
        project.name,
        project.rootFilePath,
        project.compileEngine,
        project.autoCompile ? 1 : 0,
        project.createdAt,
        project.updatedAt
      );
    },
    updateProject(id: string, name: string, updatedAt: string): boolean {
      const result = db.prepare("UPDATE projects SET name = ?, updated_at = ? WHERE id = ?").run(name, updatedAt, id);
      return result.changes > 0;
    },
    updateProjectRootFile(projectId: string, rootFilePath: string | null, updatedAt: string): boolean {
      const result = db.prepare("UPDATE projects SET root_file_path = ?, updated_at = ? WHERE id = ?").run(rootFilePath, updatedAt, projectId);
      return result.changes > 0;
    },
    updateProjectCompileEngine(projectId: string, compileEngine: CompileEngine, updatedAt: string): boolean {
      const result = db.prepare("UPDATE projects SET compile_engine = ?, updated_at = ? WHERE id = ?").run(compileEngine, updatedAt, projectId);
      return result.changes > 0;
    },
    updateProjectAutoCompile(projectId: string, autoCompile: boolean, updatedAt: string): boolean {
      const result = db.prepare("UPDATE projects SET auto_compile = ?, updated_at = ? WHERE id = ?").run(autoCompile ? 1 : 0, updatedAt, projectId);
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
    renameFile(projectId: string, fileId: string, nextPath: string, updatedAt: string): boolean {
      const transaction = db.transaction(() => {
        const existing = db.prepare("SELECT path FROM files WHERE project_id = ? AND id = ?").get(projectId, fileId) as { path: string } | undefined;
        const result = db.prepare("UPDATE files SET path = ?, updated_at = ? WHERE project_id = ? AND id = ?").run(nextPath, updatedAt, projectId, fileId);
        if (existing) {
          db.prepare("UPDATE projects SET root_file_path = CASE WHEN root_file_path = ? THEN ? ELSE root_file_path END, updated_at = ? WHERE id = ?").run(existing.path, nextPath, updatedAt, projectId);
        } else {
          db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(updatedAt, projectId);
        }
        return result.changes > 0;
      });

      return transaction();
    },
    updateFileTimestamp(projectId: string, fileId: string, updatedAt: string): boolean {
      const result = db.prepare("UPDATE files SET updated_at = ? WHERE project_id = ? AND id = ?").run(updatedAt, projectId, fileId);
      db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(updatedAt, projectId);
      return result.changes > 0;
    },
    deleteFile(projectId: string, fileId: string): boolean {
      const transaction = db.transaction(() => {
        const existing = db.prepare("SELECT path FROM files WHERE project_id = ? AND id = ?").get(projectId, fileId) as { path: string } | undefined;
        const result = db.prepare("DELETE FROM files WHERE project_id = ? AND id = ?").run(projectId, fileId);
        if (existing) {
          db.prepare("UPDATE projects SET root_file_path = CASE WHEN root_file_path = ? THEN NULL ELSE root_file_path END, updated_at = ? WHERE id = ?").run(existing.path, new Date().toISOString(), projectId);
        }
        return result.changes > 0;
      });

      return transaction();
    },
    listFolders(projectId: string): FolderRow[] {
      return db.prepare("SELECT id, project_id as projectId, path, created_at as createdAt, updated_at as updatedAt FROM folders WHERE project_id = ? ORDER BY path ASC").all(projectId) as FolderRow[];
    },
    getFolder(projectId: string, folderId: string): FolderRow | undefined {
      return db.prepare("SELECT id, project_id as projectId, path, created_at as createdAt, updated_at as updatedAt FROM folders WHERE project_id = ? AND id = ?").get(projectId, folderId) as FolderRow | undefined;
    },
    getFolderByPath(projectId: string, folderPath: string): FolderRow | undefined {
      return db.prepare("SELECT id, project_id as projectId, path, created_at as createdAt, updated_at as updatedAt FROM folders WHERE project_id = ? AND path = ?").get(projectId, folderPath) as FolderRow | undefined;
    },
    createFolder(folder: FolderRow): void {
      db.prepare("INSERT INTO folders (id, project_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
        folder.id,
        folder.projectId,
        folder.path,
        folder.createdAt,
        folder.updatedAt
      );
      db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(folder.updatedAt, folder.projectId);
    },
    renameFolder(projectId: string, folderId: string, oldPath: string, nextPath: string, updatedAt: string): boolean {
      const transaction = db.transaction(() => {
        const result = db.prepare("UPDATE folders SET path = ?, updated_at = ? WHERE project_id = ? AND id = ?").run(nextPath, updatedAt, projectId, folderId);
        const childFolders = db.prepare("SELECT id, path FROM folders WHERE project_id = ? AND path LIKE ?").all(projectId, `${oldPath}/%`) as Array<{ id: string; path: string }>;
        const childFiles = db.prepare("SELECT id, path FROM files WHERE project_id = ? AND path LIKE ?").all(projectId, `${oldPath}/%`) as Array<{ id: string; path: string }>;

        for (const folder of childFolders) {
          db.prepare("UPDATE folders SET path = ?, updated_at = ? WHERE id = ?").run(folder.path.replace(`${oldPath}/`, `${nextPath}/`), updatedAt, folder.id);
        }

        for (const file of childFiles) {
          db.prepare("UPDATE files SET path = ?, updated_at = ? WHERE id = ?").run(file.path.replace(`${oldPath}/`, `${nextPath}/`), updatedAt, file.id);
        }

        db.prepare("UPDATE projects SET root_file_path = ? || substr(root_file_path, ?), updated_at = ? WHERE id = ? AND root_file_path LIKE ?").run(
          nextPath,
          oldPath.length + 1,
          updatedAt,
          projectId,
          `${oldPath}/%`
        );
        db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(updatedAt, projectId);
        return result.changes > 0;
      });

      return transaction();
    },
    deleteFolder(projectId: string, folderId: string, folderPath: string): boolean {
      const transaction = db.transaction(() => {
        const result = db.prepare("DELETE FROM folders WHERE project_id = ? AND (id = ? OR path LIKE ?)").run(projectId, folderId, `${folderPath}/%`);
        db.prepare("DELETE FROM files WHERE project_id = ? AND path LIKE ?").run(projectId, `${folderPath}/%`);
        db.prepare("UPDATE projects SET root_file_path = CASE WHEN root_file_path LIKE ? THEN NULL ELSE root_file_path END, updated_at = ? WHERE id = ?").run(`${folderPath}/%`, new Date().toISOString(), projectId);
        return result.changes > 0;
      });

      return transaction();
    },
    createCompileJob(job: CompileJobRow): void {
      db.prepare("INSERT INTO compile_jobs (id, project_id, status, stdout, stderr, pdf_path, duration_ms, diagnostics, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        job.id,
        job.projectId,
        job.status,
        job.stdout,
        job.stderr,
        job.pdfPath,
        job.durationMs,
        JSON.stringify(job.diagnostics),
        job.createdAt,
        job.updatedAt
      );
    },
    updateCompileJob(job: CompileJobRow): void {
      db.prepare("UPDATE compile_jobs SET status = ?, stdout = ?, stderr = ?, pdf_path = ?, duration_ms = ?, diagnostics = ?, updated_at = ? WHERE id = ?").run(
        job.status,
        job.stdout,
        job.stderr,
        job.pdfPath,
        job.durationMs,
        JSON.stringify(job.diagnostics),
        job.updatedAt,
        job.id
      );
      db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(job.updatedAt, job.projectId);
    },
    latestCompileJob(projectId: string): CompileJobRow | undefined {
      const row = db.prepare("SELECT id, project_id as projectId, status, stdout, stderr, pdf_path as pdfPath, duration_ms as durationMs, diagnostics, created_at as createdAt, updated_at as updatedAt FROM compile_jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").get(projectId) as (Omit<CompileJobRow, "diagnostics"> & { diagnostics: string }) | undefined;
      return row ? hydrateCompileJob(row) : undefined;
    },
    listSnapshots(projectId: string): ProjectSnapshotRow[] {
      return db.prepare("SELECT id, project_id as projectId, label, file_count as fileCount, created_at as createdAt FROM project_snapshots WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as ProjectSnapshotRow[];
    },
    getSnapshot(projectId: string, snapshotId: string): ProjectSnapshotRow | undefined {
      return db.prepare("SELECT id, project_id as projectId, label, file_count as fileCount, created_at as createdAt FROM project_snapshots WHERE project_id = ? AND id = ?").get(projectId, snapshotId) as ProjectSnapshotRow | undefined;
    },
    createSnapshot(snapshot: ProjectSnapshotRow): void {
      db.prepare("INSERT INTO project_snapshots (id, project_id, label, file_count, created_at) VALUES (?, ?, ?, ?, ?)").run(
        snapshot.id,
        snapshot.projectId,
        snapshot.label,
        snapshot.fileCount,
        snapshot.createdAt
      );
    },
    replaceProjectTree(projectId: string, files: FileRow[], folders: FolderRow[], updatedAt: string): void {
      const transaction = db.transaction(() => {
        db.prepare("DELETE FROM files WHERE project_id = ?").run(projectId);
        db.prepare("DELETE FROM folders WHERE project_id = ?").run(projectId);

        const insertFolder = db.prepare("INSERT INTO folders (id, project_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)");
        for (const folder of folders) {
          insertFolder.run(folder.id, folder.projectId, folder.path, folder.createdAt, folder.updatedAt);
        }

        const insertFile = db.prepare("INSERT INTO files (id, project_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)");
        for (const file of files) {
          insertFile.run(file.id, file.projectId, file.path, file.createdAt, file.updatedAt);
        }

        db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(updatedAt, projectId);
      });

      transaction();
    }
  };
}

type ProjectSelectRow = Omit<ProjectRow, "autoCompile"> & { autoCompile: number };

function hydrateProject(row: ProjectSelectRow): ProjectRow {
  return { ...row, autoCompile: row.autoCompile === 1 };
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function hydrateCompileJob(row: Omit<CompileJobRow, "diagnostics"> & { diagnostics: string }): CompileJobRow {
  let diagnostics: CompileDiagnosticRow[] = [];
  try {
    const parsed = JSON.parse(row.diagnostics);
    diagnostics = Array.isArray(parsed) ? parsed : [];
  } catch {
    diagnostics = [];
  }

  return { ...row, diagnostics };
}
