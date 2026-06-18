import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { nanoid } from "nanoid";
import { type ServerConfig } from "./config.js";
import { type CompileDiagnosticRow, type CompileEngine, type CompileJobRow, type FileRow, type FolderRow, type ProjectRow, type UnderleafDb } from "./db.js";
import { ensureParentDir, normalizeProjectPath, projectFilePath, projectRoot } from "./paths.js";
import { resolveTemplate, templates } from "./templates.js";

type CreateProjectBody = { name?: string; template?: string };
type ImportProjectQuery = { name?: string };
type UpdateProjectBody = { name?: string; rootFilePath?: string | null; compileEngine?: string; autoCompile?: boolean };
type CreateFileBody = { path?: string; content?: string };
type UpdateFileBody = { content?: string };
type RenamePathBody = { path?: string };
type GitCommitBody = { message?: string };
type ProjectSearchQuery = { q?: string };
type PdfSourceBody = { page?: number; x?: number; y?: number; text?: string };
type CreateSnapshotBody = { label?: string };
type ProjectSearchResult = {
  fileId: string;
  path: string;
  line: number;
  column: number;
  preview: string;
};
type ProjectOutlineItem = {
  fileId: string;
  path: string;
  line: number;
  column: number;
  level: number;
  kind: string;
  title: string;
};
type ProjectWordCount = {
  words: number;
  characters: number;
  files: Array<{ fileId: string; path: string; words: number; characters: number }>;
};
type ProjectSymbols = {
  labels: Array<{ key: string; fileId: string; path: string; line: number }>;
  citations: Array<{ key: string; fileId: string; path: string; line: number }>;
};
type GitStatusResult = {
  initialized: boolean;
  branch: string | null;
  lastCommit: { hash: string; subject: string; committedAt: string } | null;
  hasChanges: boolean;
  entries: Array<{ path: string; status: string }>;
};
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

  if (config.staticDir) {
    app.register(staticPlugin, {
      root: config.staticDir,
      prefix: "/"
    });
  }

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/projects", async () => db.listProjects());

  app.post<{ Body: CreateProjectBody }>("/api/projects", async (request, reply) => {
    const now = new Date().toISOString();
    const template = templates[resolveTemplate(request.body.template)];
    const project = {
      id: nanoid(),
      ownerId: "local-user",
      name: request.body.name?.trim() || "Untitled Project",
      rootFilePath: templateRootFile(Object.keys(template.files)),
      compileEngine: "pdflatex" as const,
      autoCompile: false,
      createdAt: now,
      updatedAt: now
    };
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

  app.post<{ Querystring: ImportProjectQuery }>("/api/projects/import", async (request, reply) => {
    if (!request.isMultipart()) return reply.code(415).send({ message: "Expected multipart upload" });

    const archive = await request.file();
    if (!archive) return reply.code(400).send({ message: "Archive file is required" });

    const buffer = await archive.toBuffer();
    try {
      const project = await importProjectArchive(db, config, buffer, archive.filename, request.query.name);
      return reply.code(201).send(project);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Unable to import archive" });
    }
  });

  app.post<{ Params: { projectId: string } }>("/api/projects/:projectId/duplicate", async (request, reply) => {
    const project = db.getProject(request.params.projectId);
    if (!project) return reply.code(404).send({ message: "Project not found" });

    const duplicate = await duplicateProject(db, config, project);
    return reply.code(201).send(duplicate);
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId", async (request, reply) => {
    const project = db.getProject(request.params.projectId);
    if (!project) return reply.code(404).send({ message: "Project not found" });
    return project;
  });

  app.patch<{ Params: { projectId: string }; Body: UpdateProjectBody }>("/api/projects/:projectId", async (request, reply) => {
    const project = db.getProject(request.params.projectId);
    if (!project) return reply.code(404).send({ message: "Project not found" });

    if (Object.prototype.hasOwnProperty.call(request.body, "name")) {
      const name = request.body.name?.trim();
      if (!name) return reply.code(400).send({ message: "Project name is required" });
      db.updateProject(request.params.projectId, name, new Date().toISOString());
    }

    if (Object.prototype.hasOwnProperty.call(request.body, "rootFilePath")) {
      if (request.body.rootFilePath === null) {
        db.updateProjectRootFile(request.params.projectId, null, new Date().toISOString());
      } else {
        const rootFilePath = validateRootFilePath(db, request.params.projectId, request.body.rootFilePath);
        if (!rootFilePath.ok) return reply.code(rootFilePath.statusCode).send({ message: rootFilePath.message });
        db.updateProjectRootFile(request.params.projectId, rootFilePath.path, new Date().toISOString());
      }
    }

    if (Object.prototype.hasOwnProperty.call(request.body, "compileEngine")) {
      const compileEngine = validateCompileEngine(request.body.compileEngine);
      if (!compileEngine) return reply.code(400).send({ message: "Compile engine must be pdflatex, xelatex, or lualatex" });
      db.updateProjectCompileEngine(request.params.projectId, compileEngine, new Date().toISOString());
    }

    if (Object.prototype.hasOwnProperty.call(request.body, "autoCompile")) {
      if (typeof request.body.autoCompile !== "boolean") return reply.code(400).send({ message: "Auto compile must be true or false" });
      db.updateProjectAutoCompile(request.params.projectId, request.body.autoCompile, new Date().toISOString());
    }

    return db.getProject(request.params.projectId);
  });

  app.delete<{ Params: { projectId: string } }>("/api/projects/:projectId", async (request, reply) => {
    const deleted = db.deleteProject(request.params.projectId);
    if (!deleted) return reply.code(404).send({ message: "Project not found" });
    await fs.rm(projectRoot(config.dataDir, request.params.projectId), { recursive: true, force: true });
    return reply.code(204).send();
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/download", async (request, reply) => {
    const project = db.getProject(request.params.projectId);
    if (!project) return reply.code(404).send({ message: "Project not found" });

    const sourceDir = await createProjectArchiveSource(db, config, project.id);
    try {
      const archive = await spawnCommandBuffer("tar", ["-czf", "-", "-C", sourceDir, "."]);
      return reply
        .type("application/gzip")
        .header("Content-Disposition", `attachment; filename="${sanitizeDownloadName(project.name || "project")}.tar.gz"`)
        .send(archive);
    } finally {
      await fs.rm(sourceDir, { recursive: true, force: true });
    }
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/files", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });
    return db.listFiles(request.params.projectId);
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/folders", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });
    return db.listFolders(request.params.projectId);
  });

  app.get<{ Params: { projectId: string }; Querystring: ProjectSearchQuery }>("/api/projects/:projectId/search", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });

    const query = request.query.q?.trim() ?? "";
    if (query.length < 2) return [];
    if (query.length > 120) return reply.code(400).send({ message: "Search query is too long" });

    return searchProjectFiles(db, config, request.params.projectId, query);
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/outline", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });
    return buildProjectOutline(db, config, request.params.projectId);
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/word-count", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });
    return countProjectWords(db, config, request.params.projectId);
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/symbols", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });
    return collectProjectSymbols(db, config, request.params.projectId);
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/git/status", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });
    return getProjectGitStatus(config, request.params.projectId);
  });

  app.post<{ Params: { projectId: string } }>("/api/projects/:projectId/git/init", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });
    await initProjectGit(config, request.params.projectId);
    return getProjectGitStatus(config, request.params.projectId);
  });

  app.post<{ Params: { projectId: string }; Body: GitCommitBody }>("/api/projects/:projectId/git/commit", async (request, reply) => {
    if (!db.getProject(request.params.projectId)) return reply.code(404).send({ message: "Project not found" });

    const message = request.body.message?.trim();
    if (!message) return reply.code(400).send({ message: "Commit message is required" });

    try {
      await commitProjectGit(config, request.params.projectId, message);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Unable to commit project" });
    }
    return getProjectGitStatus(config, request.params.projectId);
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

  app.get<{ Params: { projectId: string; fileId: string } }>("/api/projects/:projectId/files/:fileId/raw", async (request, reply) => {
    const file = db.getFile(request.params.projectId, request.params.fileId);
    if (!file) return reply.code(404).send({ message: "File not found" });

    const root = path.resolve(projectRoot(config.dataDir, file.projectId));
    const absoluteFile = path.resolve(projectFilePath(config.dataDir, file.projectId, file.path));
    if (!absoluteFile.startsWith(root)) return reply.code(403).send({ message: "File path is outside project" });

    return reply
      .type(mimeTypeForPath(file.path))
      .header("Content-Disposition", `inline; filename="${path.posix.basename(file.path).replaceAll('"', "")}"`)
      .send(await fs.readFile(absoluteFile));
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

  if (config.staticDir) {
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/")) {
        return reply.sendFile("index.html");
      }

      return reply.code(404).send({ message: "Not found" });
    });
  }

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
    diagnostics: [],
    createdAt: now,
    updatedAt: now
  };

  db.createCompileJob(job);
  const startedAt = Date.now();
  const project = db.getProject(projectId);
  const rootFilePath = resolveCompileRootFile(db, projectId);

  try {
    if (!rootFilePath) throw new Error("No LaTeX root document found. Choose a .tex root file in project settings.");
    const result = await spawnCompiler(config, root, rootFilePath, project?.compileEngine ?? "pdflatex");
    const pdfPath = path.join(root, replaceTexExtension(rootFilePath, ".pdf"));
    const hasPdf = await fs.stat(pdfPath).then((stat) => stat.isFile()).catch(() => false);

    job.status = result.code === 0 && hasPdf ? "success" : "error";
    job.stdout = result.stdout;
    job.stderr = result.stderr;
    job.pdfPath = job.status === "success" ? pdfPath : null;
  } catch (error) {
    job.status = "error";
    job.stderr = error instanceof Error ? error.message : String(error);
  } finally {
    job.diagnostics = parseCompileDiagnostics(`${job.stdout}\n${job.stderr}`, db.listFiles(projectId), rootFilePath);
    job.durationMs = Date.now() - startedAt;
    job.updatedAt = new Date().toISOString();
    db.updateCompileJob(job);
  }

  return job;
}

function validateRootFilePath(
  db: UnderleafDb,
  projectId: string,
  rawPath: string | undefined
): { ok: true; path: string } | { ok: false; statusCode: 400 | 404; message: string } {
  let safePath: string;
  try {
    safePath = normalizeProjectPath(rawPath ?? "");
  } catch {
    return { ok: false, statusCode: 400, message: "Invalid root document path" };
  }

  if (!safePath.toLowerCase().endsWith(".tex")) {
    return { ok: false, statusCode: 400, message: "Root document must be a .tex file" };
  }

  if (!db.getFileByPath(projectId, safePath)) {
    return { ok: false, statusCode: 404, message: "Root document file was not found" };
  }

  return { ok: true, path: safePath };
}

function validateCompileEngine(value: string | undefined): CompileEngine | null {
  if (value === "pdflatex" || value === "xelatex" || value === "lualatex") return value;
  return null;
}

function resolveCompileRootFile(db: UnderleafDb, projectId: string): string | null {
  const project = db.getProject(projectId);
  if (!project) return null;

  if (project.rootFilePath) {
    return db.getFileByPath(projectId, project.rootFilePath) ? project.rootFilePath : null;
  }

  return detectRootFilePath(db.listFiles(projectId));
}

function detectRootFilePath(files: FileRow[]): string | null {
  const texFiles = files.filter((file) => file.path.toLowerCase().endsWith(".tex")).sort(compareOutlineFiles);
  return texFiles.find((file) => file.path === "main.tex")?.path ?? texFiles[0]?.path ?? null;
}

function templateRootFile(templatePaths: string[]): string | null {
  const files = templatePaths.map((templatePath) => ({ path: normalizeProjectPath(templatePath) }) as FileRow);
  return detectRootFilePath(files);
}

function replaceTexExtension(filePath: string, extension: string): string {
  return filePath.replace(/\.tex$/i, extension);
}

async function spawnCompiler(config: ServerConfig, cwd: string, rootFilePath: string, compileEngine: CompileEngine): Promise<{ code: number | null; stdout: string; stderr: string }> {
  if (config.latexEngine === "latexmk") {
    return spawnCommand(config.latexmkBin, [...latexmkEngineArgs(compileEngine), "-synctex=1", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", rootFilePath], cwd);
  }

  if (config.latexEngine === "tectonic") {
    return spawnCommand(config.tectonicBin, ["--keep-logs", "--keep-intermediates", "--synctex", rootFilePath], cwd);
  }

  try {
    return await spawnCommand(config.latexmkBin, [...latexmkEngineArgs(compileEngine), "-synctex=1", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", rootFilePath], cwd);
  } catch (error) {
    if (!isMissingCommandError(error)) throw error;

    try {
      const tectonicResult = await spawnCommand(config.tectonicBin, ["--keep-logs", "--keep-intermediates", "--synctex", rootFilePath], cwd);
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

function latexmkEngineArgs(compileEngine: CompileEngine): string[] {
  if (compileEngine === "xelatex") return ["-xelatex"];
  if (compileEngine === "lualatex") return ["-lualatex"];
  return ["-pdf"];
}

function isMissingCommandError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function parseCompileDiagnostics(output: string, files: FileRow[], rootFilePath: string | null): CompileDiagnosticRow[] {
  const lines = output.replace(/\r\n/g, "\n").split("\n");
  const diagnostics: CompileDiagnosticRow[] = [];
  const knownPaths = new Set(files.map((file) => file.path));
  const mainPath = rootFilePath && knownPaths.has(rootFilePath) ? rootFilePath : knownPaths.has("main.tex") ? "main.tex" : files.find((file) => file.path.endsWith(".tex"))?.path ?? null;
  const recentFiles: string[] = [];

  const pushDiagnostic = (diagnostic: CompileDiagnosticRow) => {
    const message = diagnostic.message.trim().replace(/\s+/g, " ");
    if (!message) return;

    const normalized: CompileDiagnosticRow = {
      ...diagnostic,
      filePath: diagnostic.filePath ? resolveDiagnosticFilePath(diagnostic.filePath, files) : mainPath,
      line: Number.isFinite(diagnostic.line) && diagnostic.line && diagnostic.line > 0 ? diagnostic.line : null,
      column: Number.isFinite(diagnostic.column) && diagnostic.column && diagnostic.column > 0 ? diagnostic.column : null,
      message
    };
    const key = `${normalized.severity}|${normalized.filePath ?? ""}|${normalized.line ?? ""}|${normalized.message}`;
    if (diagnostics.some((item) => `${item.severity}|${item.filePath ?? ""}|${item.line ?? ""}|${item.message}` === key)) return;
    diagnostics.push(normalized);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^error:\s+halted on potentially-recoverable error/i.test(line)) continue;

    for (const match of line.matchAll(/(?:^|[(/ ])(\.?[A-Za-z0-9_.-][A-Za-z0-9_./ -]*\.tex)\b/g)) {
      const filePath = resolveDiagnosticFilePath(match[1], files);
      if (filePath && recentFiles[recentFiles.length - 1] !== filePath) recentFiles.push(filePath);
      if (recentFiles.length > 8) recentFiles.shift();
    }

    const prefixedFileLine = line.match(/^(error|warning):\s+(.+?\.(?:tex|cls|sty|bib)):(\d+):\s*(.+)$/i);
    if (prefixedFileLine) {
      pushDiagnostic({
        severity: prefixedFileLine[1].toLowerCase() === "warning" ? "warning" : "error",
        filePath: prefixedFileLine[2],
        line: Number(prefixedFileLine[3]),
        column: null,
        message: collectDiagnosticMessage(lines, index, prefixedFileLine[4]),
        raw: line
      });
      continue;
    }

    const fileLineError = line.match(/^(.+?\.(?:tex|cls|sty|bib)):(\d+):\s*(.+)$/);
    if (fileLineError) {
      pushDiagnostic({
        severity: "error",
        filePath: fileLineError[1],
        line: Number(fileLineError[2]),
        column: null,
        message: collectDiagnosticMessage(lines, index, fileLineError[3]),
        raw: line
      });
      continue;
    }

    const latexError = line.match(/^!\s*(.+)$/);
    if (latexError) {
      const nearbyLine = findNearbyInputLine(lines, index);
      pushDiagnostic({
        severity: "error",
        filePath: recentFiles[recentFiles.length - 1] ?? mainPath,
        line: nearbyLine,
        column: null,
        message: collectDiagnosticMessage(lines, index, latexError[1]),
        raw: line
      });
      continue;
    }

    const tectonicError = line.match(/^(?:error|fatal error):\s*(.+)$/i);
    if (tectonicError) {
      const location = findNearbyLocation(lines, index, files);
      pushDiagnostic({
        severity: "error",
        filePath: location.filePath ?? recentFiles[recentFiles.length - 1] ?? mainPath,
        line: location.line,
        column: location.column,
        message: tectonicError[1],
        raw: line
      });
      continue;
    }

    const warning = line.match(/^(?:(LaTeX|Package .+?)\s+)?Warning:\s*(.+?)(?:\s+on input line\s+(\d+))?\.?$/);
    if (warning || /\bWarning:/.test(line)) {
      const lineNumber = warning?.[3] ? Number(warning[3]) : findNearbyInputLine(lines, index);
      pushDiagnostic({
        severity: "warning",
        filePath: recentFiles[recentFiles.length - 1] ?? mainPath,
        line: lineNumber,
        column: null,
        message: warning?.[2] ?? line,
        raw: line
      });
      continue;
    }

    const badBox = line.match(/^((?:Over|Under)full \\[hv]box .+?)(?: at lines? (\d+)(?:--\d+)?)?$/);
    if (badBox) {
      pushDiagnostic({
        severity: "warning",
        filePath: recentFiles[recentFiles.length - 1] ?? mainPath,
        line: badBox[2] ? Number(badBox[2]) : null,
        column: null,
        message: badBox[1],
        raw: line
      });
    }
  }

  return diagnostics.slice(0, 50);
}

function collectDiagnosticMessage(lines: string[], startIndex: number, firstLine: string): string {
  const parts = [firstLine.trim()];
  for (let index = startIndex + 1; index < Math.min(lines.length, startIndex + 4); index += 1) {
    const candidate = lines[index].trim();
    if (!candidate || candidate.startsWith("l.") || /^<.*>$/.test(candidate) || /^Transcript written/.test(candidate)) break;
    if (/^(.+?\.(?:tex|cls|sty|bib)):(\d+):/.test(candidate) || /^!/.test(candidate)) break;
    if (/^(error|warning|fatal error):/i.test(candidate)) break;
    parts.push(candidate);
  }
  return parts.join(" ");
}

function findNearbyInputLine(lines: string[], startIndex: number): number | null {
  for (let index = startIndex; index < Math.min(lines.length, startIndex + 8); index += 1) {
    const inputLine = lines[index].match(/^l\.(\d+)\s/);
    if (inputLine) return Number(inputLine[1]);
    const textLine = lines[index].match(/on input line\s+(\d+)/i);
    if (textLine) return Number(textLine[1]);
  }
  return null;
}

function findNearbyLocation(lines: string[], startIndex: number, files: FileRow[]): { filePath: string | null; line: number | null; column: number | null } {
  for (let index = Math.max(0, startIndex - 3); index < Math.min(lines.length, startIndex + 5); index += 1) {
    const match = lines[index].match(/(.+?\.(?:tex|cls|sty|bib)):(\d+)(?::(\d+))?/);
    if (match) {
      return {
        filePath: resolveDiagnosticFilePath(match[1], files),
        line: Number(match[2]),
        column: match[3] ? Number(match[3]) : null
      };
    }
  }
  return { filePath: null, line: null, column: null };
}

function resolveDiagnosticFilePath(rawPath: string, files: FileRow[]): string | null {
  const cleanPath = rawPath.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/^["']|["']$/g, "");
  try {
    const normalized = normalizeProjectPath(cleanPath);
    if (files.some((file) => file.path === normalized)) return normalized;
  } catch {
    // Fall through to basename matching for compiler paths that include absolute prefixes.
  }

  const basename = path.posix.basename(cleanPath);
  const basenameMatch = files.find((file) => path.posix.basename(file.path) === basename);
  return basenameMatch?.path ?? null;
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

async function createProjectArchiveSource(db: UnderleafDb, config: ServerConfig, projectId: string): Promise<string> {
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "underleaf-export-"));
  const root = path.resolve(projectRoot(config.dataDir, projectId));

  for (const file of db.listFiles(projectId)) {
    const source = path.resolve(projectFilePath(config.dataDir, projectId, file.path));
    if (!source.startsWith(root)) continue;

    const target = path.join(sourceDir, file.path);
    await ensureParentDir(target);
    await fs.copyFile(source, target);
  }

  return sourceDir;
}

async function duplicateProject(db: UnderleafDb, config: ServerConfig, sourceProject: ProjectRow): Promise<ProjectRow> {
  const now = new Date().toISOString();
  const project: ProjectRow = {
    id: nanoid(),
    ownerId: sourceProject.ownerId,
    name: `Copy of ${sourceProject.name}`,
    rootFilePath: sourceProject.rootFilePath,
    compileEngine: sourceProject.compileEngine,
    autoCompile: sourceProject.autoCompile,
    createdAt: now,
    updatedAt: now
  };
  const sourceRoot = path.resolve(projectRoot(config.dataDir, sourceProject.id));
  const sourceRootPrefix = `${sourceRoot}${path.sep}`;

  try {
    await fs.mkdir(projectRoot(config.dataDir, project.id), { recursive: true });
    db.createProject(project);

    for (const folder of db.listFolders(sourceProject.id)) {
      db.createFolder({ id: nanoid(), projectId: project.id, path: folder.path, createdAt: now, updatedAt: now });
    }

    const duplicatedPaths = new Set<string>();
    for (const sourceFile of db.listFiles(sourceProject.id)) {
      const source = path.resolve(projectFilePath(config.dataDir, sourceProject.id, sourceFile.path));
      if (source !== sourceRoot && !source.startsWith(sourceRootPrefix)) continue;

      const target = projectFilePath(config.dataDir, project.id, sourceFile.path);
      await ensureParentDir(target);
      await fs.copyFile(source, target);
      duplicatedPaths.add(sourceFile.path);
      db.createFile({ id: nanoid(), projectId: project.id, path: sourceFile.path, createdAt: now, updatedAt: now });
    }

    if (project.rootFilePath && !duplicatedPaths.has(project.rootFilePath)) {
      project.rootFilePath = null;
      db.updateProjectRootFile(project.id, null, now);
    }

    return db.getProject(project.id) ?? project;
  } catch (error) {
    if (db.getProject(project.id)) db.deleteProject(project.id);
    await fs.rm(projectRoot(config.dataDir, project.id), { recursive: true, force: true });
    throw error;
  }
}

async function importProjectArchive(db: UnderleafDb, config: ServerConfig, archive: Buffer, filename: string, requestedName: string | undefined): Promise<ProjectRow> {
  const now = new Date().toISOString();
  const importRoot = await fs.mkdtemp(path.join(os.tmpdir(), "underleaf-import-"));
  const archivePath = path.join(importRoot, filename || "project.tar.gz");
  const extractRoot = path.join(importRoot, "source");
  const projectId = nanoid();

  try {
    await fs.mkdir(extractRoot, { recursive: true });
    await fs.writeFile(archivePath, archive);
    await extractProjectArchive(archivePath, extractRoot, filename);

    const files = await collectImportedFiles(extractRoot);
    if (files.length === 0) throw new Error("Archive does not contain any importable files");

    const project: ProjectRow = {
      id: projectId,
      ownerId: "local-user",
      name: requestedName?.trim() || archiveProjectName(filename),
      rootFilePath: detectRootFilePath(files.map((file) => ({ path: file.path }) as FileRow)),
      compileEngine: "pdflatex",
      autoCompile: false,
      createdAt: now,
      updatedAt: now
    };

    await fs.mkdir(projectRoot(config.dataDir, project.id), { recursive: true });
    db.createProject(project);

    for (const importedFile of files) {
      const safePath = normalizeProjectPath(importedFile.path);
      const target = projectFilePath(config.dataDir, project.id, safePath);
      const file = { id: nanoid(), projectId: project.id, path: safePath, createdAt: now, updatedAt: now };

      await ensureParentDir(target);
      await fs.copyFile(importedFile.absolutePath, target);
      ensureFolderMetadata(db, project.id, path.posix.dirname(safePath), now);
      db.createFile(file);
    }

    return project;
  } catch (error) {
    if (db.getProject(projectId)) db.deleteProject(projectId);
    await fs.rm(projectRoot(config.dataDir, projectId), { recursive: true, force: true });
    throw error;
  } finally {
    await fs.rm(importRoot, { recursive: true, force: true });
  }
}

async function extractProjectArchive(archivePath: string, extractRoot: string, filename: string): Promise<void> {
  const lowerName = filename.toLowerCase();
  if (lowerName.endsWith(".zip")) {
    const listing = await spawnCommandBuffer("unzip", ["-Z1", archivePath]);
    validateArchiveEntries(listing.toString("utf8").split(/\r?\n/));
    await spawnCommandBuffer("unzip", ["-q", archivePath, "-d", extractRoot]);
    return;
  }

  if (lowerName.endsWith(".tar.gz") || lowerName.endsWith(".tgz") || lowerName.endsWith(".tar")) {
    const listArgs = lowerName.endsWith(".tar") ? ["-tf", archivePath] : ["-tzf", archivePath];
    const extractArgs = lowerName.endsWith(".tar") ? ["-xf", archivePath, "-C", extractRoot] : ["-xzf", archivePath, "-C", extractRoot];
    const listing = await spawnCommandBuffer("tar", listArgs);
    validateArchiveEntries(listing.toString("utf8").split(/\r?\n/));
    await spawnCommandBuffer("tar", extractArgs);
    return;
  }

  throw new Error("Archive must be a .zip, .tar, .tar.gz, or .tgz file");
}

function validateArchiveEntries(entries: string[]): void {
  for (const entry of entries) {
    const value = entry.trim();
    if (!value) continue;
    const parts = value.replaceAll("\\", "/").split("/");
    if (path.posix.isAbsolute(value) || parts.includes("..")) throw new Error("Archive contains unsafe paths");
    const withoutPrefix = stripArchiveRoot(value);
    normalizeProjectPath(withoutPrefix || "archive-entry");
  }
}

async function collectImportedFiles(extractRoot: string): Promise<Array<{ path: string; absolutePath: string }>> {
  const discovered: Array<{ path: string; absolutePath: string }> = [];
  const root = path.resolve(extractRoot);

  const walk = async (dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (relativePath.split("/").some((part) => part.startsWith(".") || part === "__MACOSX")) continue;

      const safePath = normalizeProjectPath(stripArchiveRoot(relativePath));
      discovered.push({ path: safePath, absolutePath });
    }
  };

  await walk(root);

  const paths = discovered.map((file) => file.path);
  const commonRoot = commonArchiveRoot(paths);
  return discovered.map((file) => ({
    ...file,
    path: commonRoot ? normalizeProjectPath(file.path.slice(commonRoot.length + 1)) : file.path
  })).filter((file, index, files) => files.findIndex((candidate) => candidate.path === file.path) === index);
}

function stripArchiveRoot(entryPath: string): string {
  return entryPath.replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");
}

function commonArchiveRoot(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const [first, ...rest] = paths;
  const root = first.split("/")[0];
  if (!root || !first.includes("/")) return null;
  return rest.every((filePath) => filePath.startsWith(`${root}/`)) ? root : null;
}

function archiveProjectName(filename: string): string {
  return (filename || "Imported Project")
    .replace(/\.(tar\.gz|tgz|tar|zip)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim() || "Imported Project";
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
  const project = db.getProject(projectId);
  if (project?.rootFilePath && !restoredFiles.some((file) => file.path === project.rootFilePath)) {
    db.updateProjectRootFile(projectId, detectRootFilePath(restoredFiles), now);
  }
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

function mimeTypeForPath(filePath: string): string {
  const extension = path.posix.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".bib": "text/plain; charset=utf-8",
    ".cls": "text/plain; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".json": "application/json; charset=utf-8",
    ".log": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".sty": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".tex": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp",
    ".xml": "application/xml; charset=utf-8"
  };
  return types[extension] ?? "application/octet-stream";
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

async function buildProjectOutline(db: UnderleafDb, config: ServerConfig, projectId: string): Promise<ProjectOutlineItem[]> {
  const root = path.resolve(projectRoot(config.dataDir, projectId));
  const outline: ProjectOutlineItem[] = [];

  for (const file of db.listFiles(projectId).sort(compareOutlineFiles)) {
    if (!isLatexSourceFile(file.path)) continue;

    const absoluteFile = path.resolve(root, normalizeProjectPath(file.path));
    if (!absoluteFile.startsWith(root)) continue;

    const stat = await fs.stat(absoluteFile).catch(() => null);
    if (!stat?.isFile() || stat.size > 1024 * 1024) continue;

    const content = await fs.readFile(absoluteFile, "utf8").catch(() => "");
    if (content.includes("\u0000")) continue;

    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const item = parseOutlineLine(lines[index]);
      if (!item) continue;
      outline.push({
        fileId: file.id,
        path: file.path,
        line: index + 1,
        column: item.column,
        level: item.level,
        kind: item.kind,
        title: item.title
      });
    }
  }

  return outline.slice(0, 500);
}

function parseOutlineLine(line: string): Omit<ProjectOutlineItem, "fileId" | "path" | "line"> | null {
  const withoutComment = stripLatexLineComment(line);
  const match = withoutComment.match(/\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*])?\s*\{/);
  if (!match || match.index === undefined) return null;

  const titleStart = match.index + match[0].length;
  const rawTitle = readBalancedLatexArgument(withoutComment, titleStart);
  const title = cleanOutlineTitle(rawTitle);
  if (!title) return null;

  const kind = match[1];
  return {
    column: match.index + 1,
    level: outlineLevel(kind),
    kind,
    title
  };
}

function stripLatexLineComment(line: string): string {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "%") continue;
    let slashCount = 0;
    for (let previous = index - 1; previous >= 0 && line[previous] === "\\"; previous -= 1) slashCount += 1;
    if (slashCount % 2 === 0) return line.slice(0, index);
  }
  return line;
}

function readBalancedLatexArgument(value: string, startIndex: number): string {
  let depth = 1;
  let result = "";

  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];
    if (char === "{" && previous !== "\\") depth += 1;
    if (char === "}" && previous !== "\\") depth -= 1;
    if (depth === 0) return result;
    result += char;
  }

  return result;
}

function cleanOutlineTitle(value: string): string {
  return value
    .replace(/\\texorpdfstring\s*\{([^{}]*)}\s*\{([^{}]*)}/g, "$1")
    .replace(/\\[A-Za-z]+\*?(?:\[[^\]]*])?\{([^{}]*)}/g, "$1")
    .replace(/\\[A-Za-z]+\*?/g, "")
    .replace(/[{}$]/g, "")
    .replace(/~+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function outlineLevel(kind: string): number {
  const levels: Record<string, number> = {
    part: 0,
    chapter: 1,
    section: 2,
    subsection: 3,
    subsubsection: 4,
    paragraph: 5,
    subparagraph: 6
  };
  return levels[kind] ?? 9;
}

function compareOutlineFiles(left: FileRow, right: FileRow): number {
  if (left.path === "main.tex") return -1;
  if (right.path === "main.tex") return 1;
  return left.path.localeCompare(right.path);
}

async function countProjectWords(db: UnderleafDb, config: ServerConfig, projectId: string): Promise<ProjectWordCount> {
  const root = path.resolve(projectRoot(config.dataDir, projectId));
  const files: ProjectWordCount["files"] = [];

  for (const file of db.listFiles(projectId).sort(compareOutlineFiles)) {
    if (!isLatexSourceFile(file.path) && path.posix.extname(file.path).toLowerCase() !== ".bib") continue;

    const absoluteFile = path.resolve(root, normalizeProjectPath(file.path));
    if (!absoluteFile.startsWith(root)) continue;

    const stat = await fs.stat(absoluteFile).catch(() => null);
    if (!stat?.isFile() || stat.size > 1024 * 1024) continue;

    const content = await fs.readFile(absoluteFile, "utf8").catch(() => "");
    if (content.includes("\u0000")) continue;

    const text = latexToCountableText(content);
    files.push({
      fileId: file.id,
      path: file.path,
      words: countWords(text),
      characters: countCharacters(text)
    });
  }

  return {
    words: files.reduce((sum, file) => sum + file.words, 0),
    characters: files.reduce((sum, file) => sum + file.characters, 0),
    files
  };
}

function latexToCountableText(content: string): string {
  const withoutComments = content
    .split(/\r?\n/)
    .map(stripLatexLineComment)
    .join("\n");

  return withoutComments
    .replace(/\\(?:documentclass|usepackage|input|include|bibliography|bibliographystyle|label|ref|pageref|cite[a-zA-Z]*|url|href)\*?(?:\[[^\]]*])?(?:\{[^{}]*}){1,2}/g, " ")
    .replace(/\\(?:begin|end)\s*\{[^{}]*}/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/\\\[[\s\S]*?\\]/g, " ")
    .replace(/\\\([\s\S]*?\\\)/g, " ")
    .replace(/\\[A-Za-z]+\*?(?:\[[^\]]*])?\{([^{}]*)}/g, " $1 ")
    .replace(/\\[A-Za-z]+\*?/g, " ")
    .replace(/\\./g, " ")
    .replace(/[{}_^&~#$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu);
  return matches?.length ?? 0;
}

function countCharacters(text: string): number {
  return text.replace(/\s+/g, "").length;
}

async function collectProjectSymbols(db: UnderleafDb, config: ServerConfig, projectId: string): Promise<ProjectSymbols> {
  const root = path.resolve(projectRoot(config.dataDir, projectId));
  const labels = new Map<string, { key: string; fileId: string; path: string; line: number }>();
  const citations = new Map<string, { key: string; fileId: string; path: string; line: number }>();

  for (const file of db.listFiles(projectId).sort(compareOutlineFiles)) {
    const extension = path.posix.extname(file.path).toLowerCase();
    if (!isLatexSourceFile(file.path) && extension !== ".bib") continue;

    const absoluteFile = path.resolve(root, normalizeProjectPath(file.path));
    if (!absoluteFile.startsWith(root)) continue;

    const stat = await fs.stat(absoluteFile).catch(() => null);
    if (!stat?.isFile() || stat.size > 1024 * 1024) continue;

    const content = await fs.readFile(absoluteFile, "utf8").catch(() => "");
    if (content.includes("\u0000")) continue;

    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = stripLatexLineComment(lines[index]);
      if (extension === ".bib") {
        for (const key of extractBibKeys(line)) {
          if (!citations.has(key)) citations.set(key, { key, fileId: file.id, path: file.path, line: index + 1 });
        }
        continue;
      }

      for (const key of extractLatexLabels(line)) {
        if (!labels.has(key)) labels.set(key, { key, fileId: file.id, path: file.path, line: index + 1 });
      }
      for (const key of extractBibItems(line)) {
        if (!citations.has(key)) citations.set(key, { key, fileId: file.id, path: file.path, line: index + 1 });
      }
    }
  }

  return {
    labels: [...labels.values()].slice(0, 500),
    citations: [...citations.values()].slice(0, 500)
  };
}

function extractLatexLabels(line: string): string[] {
  return [...line.matchAll(/\\label\s*\{([^{}]+)}/g)].map((match) => match[1].trim()).filter(Boolean);
}

function extractBibItems(line: string): string[] {
  return [...line.matchAll(/\\bibitem(?:\[[^\]]*])?\s*\{([^{}]+)}/g)].map((match) => match[1].trim()).filter(Boolean);
}

function extractBibKeys(line: string): string[] {
  const match = line.match(/@\w+\s*\{\s*([^,\s]+)\s*,/);
  return match?.[1] ? [match[1].trim()] : [];
}

async function getProjectGitStatus(config: ServerConfig, projectId: string): Promise<GitStatusResult> {
  const root = projectRoot(config.dataDir, projectId);
  if (!(await isGitRepository(root))) {
    return { initialized: false, branch: null, lastCommit: null, hasChanges: false, entries: [] };
  }

  const [branchResult, lastCommitResult, statusResult] = await Promise.all([
    spawnGit(root, ["branch", "--show-current"]),
    spawnGit(root, ["log", "-1", "--pretty=%h%x09%s%x09%cI"]),
    spawnGit(root, ["status", "--short"])
  ]);

  const entries = parseGitStatusEntries(statusResult.stdout);
  return {
    initialized: true,
    branch: branchResult.stdout.trim() || "HEAD",
    lastCommit: parseGitLastCommit(lastCommitResult.stdout),
    hasChanges: entries.length > 0,
    entries
  };
}

async function initProjectGit(config: ServerConfig, projectId: string): Promise<void> {
  const root = projectRoot(config.dataDir, projectId);
  await runGitOrThrow(root, ["init"]);
  await ensureProjectGitignore(root);
}

async function commitProjectGit(config: ServerConfig, projectId: string, message: string): Promise<void> {
  const root = projectRoot(config.dataDir, projectId);
  if (!(await isGitRepository(root))) await initProjectGit(config, projectId);

  await runGitOrThrow(root, ["add", "-A", "."]);
  const status = await getProjectGitStatus(config, projectId);
  if (!status.hasChanges) throw new Error("No changes to commit");

  await runGitOrThrow(root, ["commit", "-m", message], {
    GIT_AUTHOR_NAME: "Underleaf",
    GIT_AUTHOR_EMAIL: "underleaf@local.invalid",
    GIT_COMMITTER_NAME: "Underleaf",
    GIT_COMMITTER_EMAIL: "underleaf@local.invalid"
  });
}

async function isGitRepository(root: string): Promise<boolean> {
  const gitDir = await fs.stat(path.join(root, ".git")).catch(() => null);
  if (!gitDir) return false;

  const result = await spawnGit(root, ["rev-parse", "--show-toplevel"]).catch(() => null);
  if (result?.code !== 0) return false;
  const [reportedRoot, expectedRoot] = await Promise.all([
    fs.realpath(result.stdout.trim()).catch(() => path.resolve(result.stdout.trim())),
    fs.realpath(root).catch(() => path.resolve(root))
  ]);
  return reportedRoot === expectedRoot;
}

async function ensureProjectGitignore(root: string): Promise<void> {
  const gitignorePath = path.join(root, ".gitignore");
  const existing = await fs.readFile(gitignorePath, "utf8").catch(() => "");
  const needed = [
    ".underleaf-snapshots/",
    "*.aux",
    "*.bbl",
    "*.bcf",
    "*.blg",
    "*.fdb_latexmk",
    "*.fls",
    "*.log",
    "*.out",
    "*.pdf",
    "*.run.xml",
    "*.synctex.gz",
    "*.toc"
  ];
  const missing = needed.filter((entry) => !existing.split(/\r?\n/).includes(entry));
  if (existing && missing.length === 0) return;

  await fs.writeFile(gitignorePath, [existing.trimEnd(), ...missing].filter(Boolean).join("\n") + "\n", "utf8");
}

async function runGitOrThrow(root: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ stdout: string; stderr: string }> {
  const result = await spawnGit(root, args, env);
  if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args.join(" ")} failed`);
  return { stdout: result.stdout, stderr: result.stderr };
}

function spawnGit(root: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const projectRootPath = path.resolve(root);
  return spawnCommand("git", args, projectRootPath, {
    GIT_CEILING_DIRECTORIES: path.dirname(projectRootPath),
    ...env
  });
}

function parseGitStatusEntries(output: string): Array<{ path: string; status: string }> {
  return output.split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2).trim() || line.slice(0, 2);
      const rawPath = line.slice(3).trim();
      const renamedPath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) ?? rawPath : rawPath;
      return { status, path: renamedPath.replace(/^"|"$/g, "") };
    });
}

function parseGitLastCommit(output: string): GitStatusResult["lastCommit"] {
  const trimmed = output.trim();
  if (!trimmed) return null;
  const [hash, subject, committedAt] = trimmed.split("\t");
  if (!hash || !subject || !committedAt) return null;
  return { hash, subject, committedAt };
}

async function searchProjectFiles(db: UnderleafDb, config: ServerConfig, projectId: string, query: string): Promise<ProjectSearchResult[]> {
  const root = path.resolve(projectRoot(config.dataDir, projectId));
  const needle = query.toLowerCase();
  const results: ProjectSearchResult[] = [];

  for (const file of db.listFiles(projectId)) {
    if (!isSearchableFile(file.path)) continue;

    const absoluteFile = path.resolve(root, normalizeProjectPath(file.path));
    if (!absoluteFile.startsWith(root)) continue;

    const stat = await fs.stat(absoluteFile).catch(() => null);
    if (!stat?.isFile() || stat.size > 1024 * 1024) continue;

    const content = await fs.readFile(absoluteFile, "utf8").catch(() => "");
    if (content.includes("\u0000")) continue;

    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const columnIndex = lines[index].toLowerCase().indexOf(needle);
      if (columnIndex === -1) continue;

      results.push({
        fileId: file.id,
        path: file.path,
        line: index + 1,
        column: columnIndex + 1,
        preview: lines[index].trim() || lines[index]
      });

      if (results.length >= 200) return results;
    }
  }

  return results;
}

function isSearchableFile(filePath: string): boolean {
  const extension = path.posix.extname(filePath).toLowerCase();
  if (!extension) return true;
  return new Set([".bib", ".cls", ".csv", ".md", ".sty", ".tex", ".txt"]).has(extension);
}

function isLatexSourceFile(filePath: string): boolean {
  return new Set([".cls", ".sty", ".tex"]).has(path.posix.extname(filePath).toLowerCase());
}

function spawnCommand(bin: string, args: string[], cwd: string, extraEnv: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      env: { ...process.env, ...extraEnv }
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
