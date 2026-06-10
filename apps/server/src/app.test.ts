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
    latexEngine: "latexmk",
    latexmkBin: "definitely-missing-latexmk",
    tectonicBin: "definitely-missing-tectonic",
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

  it("creates parent folder metadata for nested files", async () => {
    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Nested" } });
    const project = projectResponse.json<{ id: string }>();

    const fileResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files`,
      payload: { path: "chapters/intro.tex", content: "Intro" }
    });

    expect(fileResponse.statusCode).toBe(201);
    const foldersResponse = await app.inject({ method: "GET", url: `/api/projects/${project.id}/folders` });
    expect(foldersResponse.json<Array<{ path: string }>>()).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "chapters" })])
    );
  });

  it("renames and deletes folders recursively", async () => {
    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Folders" } });
    const project = projectResponse.json<{ id: string }>();

    const folderResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/folders`,
      payload: { path: "sections" }
    });
    const folder = folderResponse.json<{ id: string }>();

    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files`,
      payload: { path: "sections/intro.tex", content: "Intro" }
    });

    const renameResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}/folders/${folder.id}`,
      payload: { path: "chapters" }
    });

    expect(renameResponse.statusCode).toBe(200);
    const filesAfterRename = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/files` })).json<Array<{ path: string }>>();
    expect(filesAfterRename).toEqual(expect.arrayContaining([expect.objectContaining({ path: "chapters/intro.tex" })]));

    const renamedFolder = renameResponse.json<{ id: string }>();
    const deleteResponse = await app.inject({ method: "DELETE", url: `/api/projects/${project.id}/folders/${renamedFolder.id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const filesAfterDelete = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/files` })).json<Array<{ path: string }>>();
    expect(filesAfterDelete.some((file) => file.path.startsWith("chapters/"))).toBe(false);
  });

  it("rejects file and folder path collisions", async () => {
    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Collisions" } });
    const project = projectResponse.json<{ id: string }>();

    const folderResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/folders`,
      payload: { path: "sections" }
    });
    expect(folderResponse.statusCode).toBe(201);

    const fileAtFolderPathResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files`,
      payload: { path: "sections", content: "" }
    });
    expect(fileAtFolderPathResponse.statusCode).toBe(409);

    const fileResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files`,
      payload: { path: "notes.tex", content: "" }
    });
    expect(fileResponse.statusCode).toBe(201);

    const folderUnderFileResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/folders`,
      payload: { path: "notes.tex/assets" }
    });
    expect(folderUnderFileResponse.statusCode).toBe(409);
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

  it("falls back to tectonic when latexmk is unavailable in auto mode", async () => {
    const fakeTectonic = path.join(tmpDir, "fake-tectonic");
    await fs.writeFile(
      fakeTectonic,
      "#!/bin/sh\necho tectonic fallback ok\nprintf '%s' fake-pdf > main.pdf\n",
      "utf8"
    );
    await fs.chmod(fakeTectonic, 0o755);
    config.latexEngine = "auto";
    config.tectonicBin = fakeTectonic;

    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Fallback" } });
    const project = projectResponse.json<{ id: string }>();

    const response = await app.inject({ method: "POST", url: `/api/projects/${project.id}/compile` });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ status: string; stderr: string }>().status).toBe("success");
    expect(response.json<{ stderr: string }>().stderr).toContain("used tectonic");
  });

  it("requests SyncTeX data and resolves PDF text back to source", async () => {
    const argsPath = path.join(tmpDir, "latexmk-args.txt");
    const fakeLatexmk = path.join(tmpDir, "fake-latexmk");
    await fs.writeFile(
      fakeLatexmk,
      `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(argsPath)}\nprintf '%s' fake-pdf > main.pdf\n`,
      "utf8"
    );
    await fs.chmod(fakeLatexmk, 0o755);
    config.latexmkBin = fakeLatexmk;

    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Source lookup" } });
    const project = projectResponse.json<{ id: string }>();

    const compileResponse = await app.inject({ method: "POST", url: `/api/projects/${project.id}/compile` });
    expect(compileResponse.statusCode).toBe(200);
    await expect(fs.readFile(argsPath, "utf8")).resolves.toContain("-synctex=1");

    const sourceResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/pdf/source`,
      payload: { page: 1, x: 100, y: 100, text: "Fresh Underleaf Article" }
    });

    expect(sourceResponse.statusCode).toBe(200);
    expect(sourceResponse.json<{ path: string; line: number; source: string }>()).toMatchObject({
      path: "main.tex",
      line: 5,
      source: "text"
    });
  });
});
