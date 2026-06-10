import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { nanoid } from "nanoid";
import { type ServerConfig } from "./config.js";
import { type CompileJobRow, type UnderleafDb } from "./db.js";
import { ensureParentDir, normalizeProjectPath, projectFilePath, projectRoot } from "./paths.js";
import { resolveTemplate, templates } from "./templates.js";

type CreateProjectBody = { name?: string; template?: string };
type UpdateProjectBody = { name?: string };
type CreateFileBody = { path?: string; content?: string };
type UpdateFileBody = { content?: string };

export function buildApp(db: UnderleafDb, config: ServerConfig): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: config.webOrigin
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

    const now = new Date().toISOString();
    const file = { id: nanoid(), projectId: request.params.projectId, path: safePath, createdAt: now, updatedAt: now };
    await ensureParentDir(projectFilePath(config.dataDir, request.params.projectId, safePath));
    await fs.writeFile(projectFilePath(config.dataDir, request.params.projectId, safePath), request.body.content ?? "", "utf8");
    db.createFile(file);
    return reply.code(201).send(file);
  });

  app.delete<{ Params: { projectId: string; fileId: string } }>("/api/projects/:projectId/files/:fileId", async (request, reply) => {
    const file = db.getFile(request.params.projectId, request.params.fileId);
    if (!file) return reply.code(404).send({ message: "File not found" });
    db.deleteFile(file.projectId, file.id);
    await fs.rm(projectFilePath(config.dataDir, file.projectId, file.path), { force: true });
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
    const result = await spawnLatexmk(config.latexmkBin, root);
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

function spawnLatexmk(bin: string, cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-pdf", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "main.tex"], {
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
