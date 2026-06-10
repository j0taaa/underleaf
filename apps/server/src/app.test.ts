import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { getConfig, type ServerConfig } from "./config.js";
import { createDb, type UnderleafDb } from "./db.js";

let tmpDir: string;
let db: UnderleafDb;
let config: ServerConfig;
let app: ReturnType<typeof buildApp>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "underleaf-test-"));
  config = getConfig({
    dataDir: tmpDir,
    databaseUrl: path.join(tmpDir, "test.sqlite"),
    latexmkBin: "definitely-missing-latexmk",
    webOrigin: "http://localhost:5173",
    port: 0
  });
  db = createDb(config.databaseUrl);
  app = buildApp(db, config);
});

afterEach(async () => {
  await app.close();
  db.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("projects and files", () => {
  it("creates a project with starter files", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Paper", template: "article" }
    });

    expect(response.statusCode).toBe(201);
    const project = response.json<{ id: string; name: string }>();
    expect(project.name).toBe("Paper");

    const filesResponse = await app.inject({ method: "GET", url: `/api/projects/${project.id}/files` });
    expect(filesResponse.json<Array<{ path: string }>>()).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "main.tex" })])
    );
  });

  it("rejects path traversal when creating files", async () => {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Unsafe" }
    });
    const project = projectResponse.json<{ id: string }>();

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files`,
      payload: { path: "../secret.tex", content: "nope" }
    });

    expect(response.statusCode).toBe(400);
  });

  it("persists content updates", async () => {
    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Draft" } });
    const project = projectResponse.json<{ id: string }>();
    const files = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/files` })).json<Array<{ id: string }>>();

    await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/files/${files[0].id}/content`,
      payload: { content: "\\documentclass{article}\\begin{document}Updated\\end{document}" }
    });

    const fileResponse = await app.inject({ method: "GET", url: `/api/projects/${project.id}/files/${files[0].id}` });
    expect(fileResponse.json<{ content: string }>().content).toContain("Updated");
  });
});

describe("compile", () => {
  it("records compiler errors when latexmk is unavailable", async () => {
    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Compile me" } });
    const project = projectResponse.json<{ id: string }>();

    const response = await app.inject({ method: "POST", url: `/api/projects/${project.id}/compile` });
    expect(response.statusCode).toBe(500);
    expect(response.json<{ status: string; stderr: string }>().status).toBe("error");

    const latest = await app.inject({ method: "GET", url: `/api/projects/${project.id}/compile/latest` });
    expect(latest.json<{ status: string }>().status).toBe("error");
  });
});
