import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { nanoid } from "nanoid";
import { type ServerConfig } from "./config.js";
import { type CompileJobRow, type FileRow, type FolderRow, type UnderleafDb } from "./db.js";
import { ensureParentDir, normalizeProjectPath, projectFilePath, projectRoot } from "./paths.js";
import { resolveTemplate, templates } from "./templates.js";

type CreateProjectBody = { name?: string; template?: string };
type UpdateProjectBody = { name?: string };
type CreateFileBody = { path?: string; content?: string };
type UpdateFileBody = { content?: string };
type RenamePathBody = { path?: string };
type PdfSourceBody = { page?: number; x?: number; y?: number; text?: string };
type CreateSnapshotBody = { label?: string };
type SnapshotManifest = {
  id: string;
  projectId: string;
  label: string;
  createdAt: string;
  files: Array<{ path: string; size: number }>;
};

export function buildApp(db: UnderleafDb, config: ServerConfig): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: config.webOrigin
  });
  app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 100
    }
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/projects", async () => db.listProjects());

  app.post<{ Body: CreateProjectBody }>("/api/projects", async (request, reply) => {
    const now = new Date().toISOString();
    const project = {
      id: nanoid(),
      ownerId: "local-user",
      name: request.body.name?.trim() || "Untitled Project",
      createdAt: now,
      updatedAt: now
    };
    const template = templates[resolveTemplate(request.body.template)];
    const root = projectRoot(config.dataDir, project.id);

    await fs.mkdir(root, { recursive: true });
    db.createProject(project);

    for (const [templatePath, content] of Object.entries(template.files)) {
      const safePath = normalizeProjectPath(templatePath);
      const file = { id: nanoid(), projectId: project.id, path: safePath, createdAt: now, updatedAt: now };
      await ensureParentDir(projectFilePath(config.dataDir, project.id, safePath));
      await fs.writeFile(projectFilePath(config.dataDir, project.id, safePath), content, "utf8");
      db.createFile(file);
    }

    return reply.code(201).send(project);
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId", async (request, reply) => {
    const project = db.getProject(request.params.projectId);
    if (!project) return reply.code(404).send({ message: "Project not found" });
    return project;
  });

  app.patch<{ Params: { projectId: string }; Body: UpdateProjectBody }>("/api/projects/:projectId", async (request, reply) => {
    const name = request.body.name?.trim();
    if (!name) return reply.code(400).send({ message: "Project name is required" });

    const updated = db.updateProject(request.params.projectId, name, new Date().toISOString());
    if (!updated) return reply.code(404).send({ message: "Project not found" });
    return db.getProject(request.params.projectId);
  });

  app.delete<{ Params: { projectId: string } }>("/api/projects/:projectId", async (request, reply) => {
    const deleted = db.deleteProject(request.params.projectId);
    if (!deleted) return reply.code(404).send({ message: "Project not found" });
    await fs.rm(projectRoot(config.dataDir, request.params.projectId), { recursive: true, force: true });
    return reply.code(204).send();
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/files", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });
    return db.listFiles(request.params.projectId);
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/folders", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });
    return db.listFolders(request.params.projectId);
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/snapshots", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });
    return db.listSnapshots(request.params.projectId);
  });

  app.post<{ Params: { projectId: string }; Body: CreateSnapshotBody }>("/api/projects/:projectId/snapshots", async (request, reply) => {
    const project = db.getProject(request.params.projectId);
    if (!project) return reply.code(404).send({ message: "Project not found" });

    const snapshot = await createProjectSnapshot(db, config, project.id, request.body.label);
    return reply.code(201).send(snapshot);
  });

  app.get<{ Params: { projectId: string; snapshotId: string } }>("/api/projects/:projectId/snapshots/:snapshotId", async (request, reply) => {
    const snapshot = db.getSnapshot(request.params.projectId, request.params.snapshotId);
    if (!snapshot) return reply.code(404).send({ message: "Snapshot not found" });

    const manifest = await readSnapshotManifest(config, snapshot.projectId, snapshot.id);
    return { ...snapshot, files: manifest.files };
  });

  app.post<{ Params: { projectId: string; snapshotId: string } }>("/api/projects/:projectId/snapshots/:snapshotId/restore", async (request, reply) => {
    const snapshot = db.getSnapshot(request.params.projectId, request.params.snapshotId);
    if (!snapshot) return reply.code(404).send({ message: "Snapshot not found" });

    await restoreProjectSnapshot(db, config, snapshot.projectId, snapshot.id);
    return { ok: true };
  });

  app.get<{ Params: { projectId: string; snapshotId: string } }>("/api/projects/:projectId/snapshots/:snapshotId/download", async (request, reply) => {
    const snapshot = db.getSnapshot(request.params.projectId, request.params.snapshotId);
    if (!snapshot) return reply.code(404).send({ message: "Snapshot not found" });

    const sourceDir = snapshotSourceDir(config.dataDir, snapshot.projectId, snapshot.id);
    const archive = await spawnCommandBuffer("tar", ["-czf", "-", "-C", sourceDir, "."]);
    return reply
      .type("application/gzip")
      .header("Content-Disposition", `attachment; filename="${sanitizeDownloadName(snapshot.label || "snapshot")}.tar.gz"`)
      .send(archive);
  });

  app.get<{ Params: { projectId: string; fileId: string } }>("/api/projects/:projectId/files/:fileId", async (request, reply) => {
    const file = db.getFile(request.params.projectId, request.params.fileId);
    if (!file) return reply.code(404).send({ message: "File not found" });

    const content = await fs.readFile(projectFilePath(config.dataDir, file.projectId, file.path), "utf8");
    return { ...file, content };
  });

  app.put<{ Params: { projectId: string; fileId: string }; Body: UpdateFileBody }>("/api/projects/:projectId/files/:fileId/content", async (request, reply) => {
    const file = db.getFile(request.params.projectId, request.params.fileId);
    if (!file) return reply.code(404).send({ message: "File not found" });

    await fs.writeFile(projectFilePath(config.dataDir, file.projectId, file.path), request.body.content ?? "", "utf8");
    db.updateFileTimestamp(file.projectId, file.id, new Date().toISOString());
    return { ...file, content: request.body.content ?? "" };
  });

  app.patch<{ Params: { projectId: string; fileId: string }; Body: RenamePathBody }>("/api/projects/:projectId/files/:fileId", async (request, reply) => {
    const file = db.getFile(request.params.projectId, request.params.fileId);
    if (!file) return reply.code(404).send({ message: "File not found" });

    let safePath: string;
    try {
      safePath = normalizeProjectPath(request.body.path ?? "");
    } catch {
      return reply.code(400).send({ message: "Invalid file path" });
    }

    if (safePath === file.path) return file;
    if (db.getFileByPath(file.projectId, safePath)) return reply.code(409).send({ message: "File already exists" });
    if (db.getFolderByPath(file.projectId, safePath)) return reply.code(409).send({ message: "A folder already exists at that path" });
    if (hasFileAncestor(db, file.projectId, safePath)) return reply.code(409).send({ message: "Parent path is a file" });

    const currentPath = projectFilePath(config.dataDir, file.projectId, file.path);
    const nextPath = projectFilePath(config.dataDir, file.projectId, safePath);
    await ensureParentDir(nextPath);
    await fs.rename(currentPath, nextPath);
    const now = new Date().toISOString();
    ensureFolderMetadata(db, file.projectId, path.posix.dirname(safePath), now);
    db.renameFile(file.projectId, file.id, safePath, now);
    return db.getFile(file.projectId, file.id);
  });

  app.post<{ Params: { projectId: string }; Body: CreateFileBody }>("/api/projects/:projectId/files", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });

    let safePath: string;
    try {
      safePath = normalizeProjectPath(request.body.path ?? "");
    } catch {
      return reply.code(400).send({ message: "Invalid file path" });
    }

    if (db.getFileByPath(request.params.projectId, safePath)) {
      return reply.code(409).send({ message: "File already exists" });
    }
    if (db.getFolderByPath(request.params.projectId, safePath)) return reply.code(409).send({ message: "A folder already exists at that path" });
    if (hasFileAncestor(db, request.params.projectId, safePath)) return reply.code(409).send({ message: "Parent path is a file" });

    const now = new Date().toISOString();
    const file = { id: nanoid(), projectId: request.params.projectId, path: safePath, createdAt: now, updatedAt: now };
    await ensureParentDir(projectFilePath(config.dataDir, request.params.projectId, safePath));
    await fs.writeFile(projectFilePath(config.dataDir, request.params.projectId, safePath), request.body.content ?? "", "utf8");
    ensureFolderMetadata(db, request.params.projectId, path.posix.dirname(safePath), now);
    db.createFile(file);
    return reply.code(201).send(file);
  });

  app.post<{ Params: { projectId: string } }>("/api/projects/:projectId/files/upload", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });
    if (!request.isMultipart()) return reply.code(415).send({ message: "Expected multipart upload" });

    const requestedPaths = new Map<string, string>();
    const uploadedFiles = [];

    for await (const part of request.parts()) {
      if (part.type === "field" && part.fieldname.startsWith("path-")) {
        requestedPaths.set(part.fieldname.slice("path-".length), String(part.value ?? ""));
        continue;
      }

      if (part.type === "file" && part.fieldname.startsWith("file-")) {
        const index = part.fieldname.slice("file-".length);
        const requestedPath = requestedPaths.get(index) || part.filename;
        let safePath: string;
        try {
          safePath = resolveAvailableUploadPath(db, request.params.projectId, requestedPath);
        } catch {
          return reply.code(400).send({ message: "Invalid upload path" });
        }
        const buffer = await part.toBuffer();
        const now = new Date().toISOString();
        const file = { id: nanoid(), projectId: request.params.projectId, path: safePath, createdAt: now, updatedAt: now };

        await ensureParentDir(projectFilePath(config.dataDir, request.params.projectId, safePath));
        await fs.writeFile(projectFilePath(config.dataDir, request.params.projectId, safePath), buffer);
        ensureFolderMetadata(db, request.params.projectId, path.posix.dirname(safePath), now);
        db.createFile(file);
        uploadedFiles.push(file);
      }
    }

    if (uploadedFiles.length === 0) return reply.code(400).send({ message: "No files uploaded" });
    return reply.code(201).send(uploadedFiles);
  });

  app.post<{ Params: { projectId: string }; Body: RenamePathBody }>("/api/projects/:projectId/folders", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });

    let safePath: string;
    try {
      safePath = normalizeProjectPath(request.body.path ?? "");
    } catch {
      return reply.code(400).send({ message: "Invalid folder path" });
    }

    if (db.getFolderByPath(request.params.projectId, safePath)) return reply.code(409).send({ message: "Folder already exists" });
    if (db.getFileByPath(request.params.projectId, safePath)) return reply.code(409).send({ message: "A file already exists at that path" });
    if (hasFileAncestor(db, request.params.projectId, safePath)) return reply.code(409).send({ message: "Parent path is a file" });

    const now = new Date().toISOString();
    const folder = { id: nanoid(), projectId: request.params.projectId, path: safePath, createdAt: now, updatedAt: now };
    await fs.mkdir(projectFilePath(config.dataDir, request.params.projectId, safePath), { recursive: true });
    ensureFolderMetadata(db, request.params.projectId, path.posix.dirname(safePath), now);
    db.createFolder(folder);
    return reply.code(201).send(folder);
  });

  app.patch<{ Params: { projectId: string; folderId: string }; Body: RenamePathBody }>("/api/projects/:projectId/folders/:folderId", async (request, reply) => {
    const folder = db.getFolder(request.params.projectId, request.params.folderId);
    if (!folder) return reply.code(404).send({ message: "Folder not found" });

    let safePath: string;
    try {
      safePath = normalizeProjectPath(request.body.path ?? "");
    } catch {
      return reply.code(400).send({ message: "Invalid folder path" });
    }

    if (safePath === folder.path) return folder;
    if (safePath.startsWith(`${folder.path}/`)) return reply.code(400).send({ message: "Folder cannot be moved inside itself" });
    if (db.getFolderByPath(folder.projectId, safePath)) return reply.code(409).send({ message: "Folder already exists" });
    if (db.getFileByPath(folder.projectId, safePath)) return reply.code(409).send({ message: "A file already exists at that path" });
    if (hasFileAncestor(db, folder.projectId, safePath)) return reply.code(409).send({ message: "Parent path is a file" });

    const currentPath = projectFilePath(config.dataDir, folder.projectId, folder.path);
    const nextPath = projectFilePath(config.dataDir, folder.projectId, safePath);
    await ensureParentDir(nextPath);
    await fs.rename(currentPath, nextPath);
    const now = new Date().toISOString();
    ensureFolderMetadata(db, folder.projectId, path.posix.dirname(safePath), now);
    db.renameFolder(folder.projectId, folder.id, folder.path, safePath, now);
    return db.getFolder(folder.projectId, folder.id);
  });

  app.delete<{ Params: { projectId: string; fileId: string } }>("/api/projects/:projectId/files/:fileId", async (request, reply) => {
    const file = db.getFile(request.params.projectId, request.params.fileId);
    if (!file) return reply.code(404).send({ message: "File not found" });
    db.deleteFile(file.projectId, file.id);
    await fs.rm(projectFilePath(config.dataDir, file.projectId, file.path), { force: true });
    return reply.code(204).send();
  });

  app.delete<{ Params: { projectId: string; folderId: string } }>("/api/projects/:projectId/folders/:folderId", async (request, reply) => {
    const folder = db.getFolder(request.params.projectId, request.params.folderId);
    if (!folder) return reply.code(404).send({ message: "Folder not found" });
    db.deleteFolder(folder.projectId, folder.id, folder.path);
    await fs.rm(projectFilePath(config.dataDir, folder.projectId, folder.path), { recursive: true, force: true });
    return reply.code(204).send();
  });

  app.post<{ Params: { projectId: string } }>("/api/projects/:projectId/compile", async (request, reply) => {
    const project = db.getProject(request.params.projectId);
    if (!project) return reply.code(404).send({ message: "Project not found" });

    const job = await runCompile(db, config, project.id);
    return reply.code(job.status === "success" ? 200 : 500).send(job);
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/compile/latest", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });
    return db.latestCompileJob(request.params.projectId) ?? null;
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/pdf", async (request, reply) => {
    const latest = db.latestCompileJob(request.params.projectId);
    if (!latest?.pdfPath || latest.status !== "success") return reply.code(404).send({ message: "PDF not found" });

    const absolutePdf = path.resolve(latest.pdfPath);
    const root = path.resolve(projectRoot(config.dataDir, request.params.projectId));
    if (!absolutePdf.startsWith(root)) return reply.code(403).send({ message: "PDF path is outside project" });

    return reply.type("application/pdf").send(await fs.readFile(absolutePdf));
  });

  app.post<{ Params: { projectId: string }; Body: PdfSourceBody }>("/api/projects/:projectId/pdf/source", async (request, reply) => {
    const latest = db.latestCompileJob(request.params.projectId);
    if (!latest?.pdfPath || latest.status !== "success") return reply.code(404).send({ message: "PDF not found" });

    const page = Number(request.body.page);
    const x = Number(request.body.x);
    const y = Number(request.body.y);
    if (!Number.isFinite(page) || page < 1 || !Number.isFinite(x) || !Number.isFinite(y)) {
      return reply.code(400).send({ message: "Invalid PDF source position" });
    }

    const root = path.resolve(projectRoot(config.dataDir, request.params.projectId));
    const absolutePdf = path.resolve(latest.pdfPath);
    if (!absolutePdf.startsWith(root)) return reply.code(403).send({ message: "PDF path is outside project" });

    const synctexLocation = await locateSourceWithSynctex(db, request.params.projectId, root, absolutePdf, page, x, y);
    if (synctexLocation) return synctexLocation;

    const textLocation = await locateSourceByText(db, request.params.projectId, root, request.body.text ?? "");
    return textLocation;
  });

  return app;
}

async function runCompile(db: UnderleafDb, config: ServerConfig, projectId: string): Promise<CompileJobRow> {
  const now = new Date().toISOString();
  const root = projectRoot(config.dataDir, projectId);
  const job: CompileJobRow = {
    id: nanoid(),
    projectId,
    status: "running",
    stdout: "",
    stderr: "",
    pdfPath: null,
    durationMs: null,
    createdAt: now,
    updatedAt: now
  };

  db.createCompileJob(job);
  const startedAt = Date.now();

  try {
    const result = await spawnCompiler(config, root);
    const pdfPath = path.join(root, "main.pdf");
    const hasPdf = await fs.stat(pdfPath).then((stat) => stat.isFile()).catch(() => false);

    job.status = result.code === 0 && hasPdf ? "success" : "error";
    job.stdout = result.stdout;
    job.stderr = result.stderr;
    job.pdfPath = job.status === "success" ? pdfPath : null;
  } catch (error) {
    job.status = "error";
    job.stderr = error instanceof Error ? error.message : String(error);
  } finally {
    job.durationMs = Date.now() - startedAt;
    job.updatedAt = new Date().toISOString();
    db.updateCompileJob(job);
  }

  return job;
}

async function spawnCompiler(config: ServerConfig, cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  if (config.latexEngine === "latexmk") {
    return spawnCommand(config.latexmkBin, ["-pdf", "-synctex=1", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "main.tex"], cwd);
  }

  if (config.latexEngine === "tectonic") {
    return spawnCommand(config.tectonicBin, ["--keep-logs", "--keep-intermediates", "--synctex", "main.tex"], cwd);
  }

  try {
    return await spawnCommand(config.latexmkBin, ["-pdf", "-synctex=1", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "main.tex"], cwd);
  } catch (error) {
    if (!isMissingCommandError(error)) throw error;

    try {
      const tectonicResult = await spawnCommand(config.tectonicBin, ["--keep-logs", "--keep-intermediates", "--synctex", "main.tex"], cwd);
      tectonicResult.stderr = [
        `latexmk was not found, so Underleaf used tectonic (${config.tectonicBin}) instead.`,
        tectonicResult.stderr
      ].filter(Boolean).join("\n");
      return tectonicResult;
    } catch (tectonicError) {
      if (!isMissingCommandError(tectonicError)) throw tectonicError;
      throw new Error(
        `No LaTeX compiler found. Install latexmk or tectonic, or set LATEX_ENGINE plus LATEXMK_BIN/TECTONIC_BIN. Tried '${config.latexmkBin}' and '${config.tectonicBin}'.`
      );
    }
  }
}

function isMissingCommandError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function ensureFolderMetadata(db: UnderleafDb, projectId: string, folderPath: string, now: string): void {
  if (!folderPath || folderPath === ".") return;

  const parts = folderPath.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    const currentPath = parts.slice(0, index + 1).join("/");
    if (!db.getFolderByPath(projectId, currentPath)) {
      db.createFolder({ id: nanoid(), projectId, path: currentPath, createdAt: now, updatedAt: now });
    }
  }
}

function hasFileAncestor(db: UnderleafDb, projectId: string, itemPath: string): boolean {
  const parts = itemPath.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    if (db.getFileByPath(projectId, parts.slice(0, index).join("/"))) return true;
  }
  return false;
}

function resolveAvailableUploadPath(db: UnderleafDb, projectId: string, requestedPath: string): string {
  const safePath = normalizeProjectPath(requestedPath || "upload.bin");
  if (hasFileAncestor(db, projectId, safePath)) throw new Error("Parent path is a file");
  if (!db.getFileByPath(projectId, safePath) && !db.getFolderByPath(projectId, safePath)) return safePath;

  const parent = path.posix.dirname(safePath);
  const parsed = path.posix.parse(safePath);
  for (let index = 1; index < 1000; index += 1) {
    const candidateName = `${parsed.name}-${index}${parsed.ext}`;
    const candidate = parent === "." ? candidateName : `${parent}/${candidateName}`;
    if (!db.getFileByPath(projectId, candidate) && !db.getFolderByPath(projectId, candidate)) return candidate;
  }

  throw new Error("Unable to find available upload path");
}

async function createProjectSnapshot(db: UnderleafDb, config: ServerConfig, projectId: string, label: string | undefined) {
  const now = new Date().toISOString();
  const files = db.listFiles(projectId);
  const snapshot = {
    id: nanoid(),
    projectId,
    label: label?.trim() || `Snapshot ${new Date(now).toLocaleString("en-US")}`,
    fileCount: files.length,
    createdAt: now
  };
  const sourceDir = snapshotSourceDir(config.dataDir, projectId, snapshot.id);
  await fs.mkdir(sourceDir, { recursive: true });

  const manifestFiles: SnapshotManifest["files"] = [];
  for (const file of files) {
    const source = projectFilePath(config.dataDir, projectId, file.path);
    const target = path.join(sourceDir, file.path);
    await ensureParentDir(target);
    await fs.copyFile(source, target);
    const stat = await fs.stat(target);
    manifestFiles.push({ path: file.path, size: stat.size });
  }

  const manifest: SnapshotManifest = {
    id: snapshot.id,
    projectId,
    label: snapshot.label,
    createdAt: snapshot.createdAt,
    files: manifestFiles
  };
  await writeSnapshotManifest(config, manifest);
  db.createSnapshot(snapshot);
  return snapshot;
}

async function restoreProjectSnapshot(db: UnderleafDb, config: ServerConfig, projectId: string, snapshotId: string): Promise<void> {
  const manifest = await readSnapshotManifest(config, projectId, snapshotId);
  const root = projectRoot(config.dataDir, projectId);
  const sourceDir = snapshotSourceDir(config.dataDir, projectId, snapshotId);
  const now = new Date().toISOString();

  for (const file of db.listFiles(projectId)) {
    await fs.rm(projectFilePath(config.dataDir, projectId, file.path), { force: true });
  }

  const restoredFiles: FileRow[] = [];
  const restoredFolderPaths = new Set<string>();
  for (const file of manifest.files) {
    const safePath = normalizeProjectPath(file.path);
    const source = path.join(sourceDir, safePath);
    const target = projectFilePath(config.dataDir, projectId, safePath);
    await ensureParentDir(target);
    await fs.copyFile(source, target);
    restoredFiles.push({ id: nanoid(), projectId, path: safePath, createdAt: now, updatedAt: now });

    const folder = path.posix.dirname(safePath);
    if (folder && folder !== ".") {
      const parts = folder.split("/");
      for (let index = 0; index < parts.length; index += 1) {
        restoredFolderPaths.add(parts.slice(0, index + 1).join("/"));
      }
    }
  }

  const restoredFolders: FolderRow[] = [...restoredFolderPaths].sort().map((folderPath) => ({
    id: nanoid(),
    projectId,
    path: folderPath,
    createdAt: now,
    updatedAt: now
  }));
  db.replaceProjectTree(projectId, restoredFiles, restoredFolders, now);
  await removeEmptyProjectDirs(root, new Set([".underleaf-snapshots"]));
}

async function readSnapshotManifest(config: ServerConfig, projectId: string, snapshotId: string): Promise<SnapshotManifest> {
  const content = await fs.readFile(snapshotManifestPath(config.dataDir, projectId, snapshotId), "utf8");
  return JSON.parse(content) as SnapshotManifest;
}

async function writeSnapshotManifest(config: ServerConfig, manifest: SnapshotManifest): Promise<void> {
  await fs.writeFile(snapshotManifestPath(config.dataDir, manifest.projectId, manifest.id), JSON.stringify(manifest, null, 2), "utf8");
}

function snapshotRoot(dataDir: string, projectId: string): string {
  return path.join(projectRoot(dataDir, projectId), ".underleaf-snapshots");
}

function snapshotSourceDir(dataDir: string, projectId: string, snapshotId: string): string {
  return path.join(snapshotRoot(dataDir, projectId), snapshotId, "source");
}

function snapshotManifestPath(dataDir: string, projectId: string, snapshotId: string): string {
  return path.join(snapshotRoot(dataDir, projectId), snapshotId, "manifest.json");
}

async function removeEmptyProjectDirs(dir: string, preserveNames: Set<string>): Promise<boolean> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  let isEmpty = true;

  for (const entry of entries) {
    if (preserveNames.has(entry.name)) {
      isEmpty = false;
      continue;
    }
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const childEmpty = await removeEmptyProjectDirs(child, preserveNames);
      if (childEmpty) await fs.rmdir(child).catch(() => undefined);
      else isEmpty = false;
    } else {
      isEmpty = false;
    }
  }

  return isEmpty && dir !== path.dirname(dir);
}

function sanitizeDownloadName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "snapshot";
}

async function locateSourceWithSynctex(
  db: UnderleafDb,
  projectId: string,
  root: string,
  pdfPath: string,
  page: number,
  x: number,
  y: number
): Promise<{ fileId: string; path: string; line: number; column: number; source: "synctex" } | null> {
  try {
    const result = await spawnCommand("synctex", ["edit", "-o", `${page}:${x}:${y}:${pdfPath}`], root);
    if (result.code !== 0) return null;

    const input = result.stdout.match(/^Input:(.+)$/m)?.[1]?.trim();
    const line = Number(result.stdout.match(/^Line:(\d+)$/m)?.[1]);
    const column = Number(result.stdout.match(/^Column:(\d+)$/m)?.[1]);
    if (!input || !Number.isFinite(line) || line < 1) return null;

    const absoluteInput = path.resolve(root, input);
    if (!absoluteInput.startsWith(root)) return null;

    const relativePath = normalizeProjectPath(path.relative(root, absoluteInput).replaceAll(path.sep, "/"));
    const file = db.getFileByPath(projectId, relativePath);
    if (!file) return null;

    return { fileId: file.id, path: file.path, line, column: Number.isFinite(column) && column > 0 ? column : 1, source: "synctex" };
  } catch (error) {
    if (isMissingCommandError(error)) return null;
    return null;
  }
}

async function locateSourceByText(
  db: UnderleafDb,
  projectId: string,
  root: string,
  text: string
): Promise<{ fileId: string; path: string; line: number; column: number; source: "text" } | null> {
  const needle = normalizeSearchText(text);
  if (needle.length < 3) return null;

  for (const file of db.listFiles(projectId)) {
    if (!file.path.endsWith(".tex") && !file.path.endsWith(".sty") && !file.path.endsWith(".cls")) continue;
    const absoluteFile = path.resolve(root, normalizeProjectPath(file.path));
    if (!absoluteFile.startsWith(root)) continue;

    const content = await fs.readFile(absoluteFile, "utf8").catch(() => "");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const readableLine = normalizeSearchText(stripLatexMarkup(lines[index]));
      if (readableLine.includes(needle)) {
        return { fileId: file.id, path: file.path, line: index + 1, column: Math.max(1, lines[index].toLowerCase().indexOf(text.toLowerCase()) + 1), source: "text" };
      }
    }
  }

  return null;
}

function stripLatexMarkup(line: string): string {
  return line
    .replace(/\\[A-Za-z]+\*?(?:\[[^\]]*])?\{([^{}]*)\}/g, " $1 ")
    .replace(/\\[A-Za-z]+\*?/g, " ")
    .replace(/[{}$]/g, " ");
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\\[a-z]+\*?/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function spawnCommand(bin: string, args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      env: process.env
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function spawnCommandBuffer(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: process.env
    });
    const stdout: Buffer[] = [];
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(stdout));
      else reject(new Error(stderr || `${bin} exited with code ${code}`));
    });
  });
}
