import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { getConfig, type ServerConfig } from "./config.js";
import { createDb, type UnderleafDb } from "./db.js";

let tmpDir: string;
let db: UnderleafDb;
let config: ServerConfig;
let app: ReturnType<typeof buildApp>;
const execFileAsync = promisify(execFile);

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

  it("sets, validates, and preserves the project root document", async () => {
    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Rooted" } });
    const project = projectResponse.json<{ id: string; rootFilePath: string | null }>();
    expect(project.rootFilePath).toBe("main.tex");

    const createRootResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files`,
      payload: { path: "paper.tex", content: "\\documentclass{article}\\begin{document}Paper\\end{document}" }
    });
    expect(createRootResponse.statusCode).toBe(201);

    const invalidRootResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      payload: { rootFilePath: "missing.tex" }
    });
    expect(invalidRootResponse.statusCode).toBe(404);

    const nonTexRootResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      payload: { rootFilePath: "notes.txt" }
    });
    expect(nonTexRootResponse.statusCode).toBe(400);

    const rootResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      payload: { rootFilePath: "paper.tex" }
    });
    expect(rootResponse.statusCode).toBe(200);
    expect(rootResponse.json<{ rootFilePath: string }>().rootFilePath).toBe("paper.tex");

    const paperFile = createRootResponse.json<{ id: string }>();
    const renameResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}/files/${paperFile.id}`,
      payload: { path: "chapters/paper.tex" }
    });
    expect(renameResponse.statusCode).toBe(200);

    const updatedProject = (await app.inject({ method: "GET", url: `/api/projects/${project.id}` })).json<{ rootFilePath: string }>();
    expect(updatedProject.rootFilePath).toBe("chapters/paper.tex");
  });

  it("compiles the selected root document instead of assuming main.tex", async () => {
    const fakeLatexmk = path.join(tmpDir, "fake-latexmk.sh");
    await fs.writeFile(
      fakeLatexmk,
      [
        "#!/bin/sh",
        "for arg in \"$@\"; do root=\"$arg\"; done",
        "base=\"${root%.tex}\"",
        "mkdir -p \"$(dirname \"$base\")\"",
        "printf '%s' PDF > \"$base.pdf\"",
        "printf 'compiled %s\\n' \"$root\""
      ].join("\n"),
      "utf8"
    );
    await fs.chmod(fakeLatexmk, 0o755);
    await app.close();
    db.close();

    config = getConfig({
      dataDir: tmpDir,
      databaseUrl: path.join(tmpDir, "test.sqlite"),
      latexEngine: "latexmk",
      latexmkBin: fakeLatexmk,
      tectonicBin: "definitely-missing-tectonic",
      webOrigin: "http://localhost:5173",
      port: 0
    });
    db = createDb(config.databaseUrl);
    app = buildApp(db, config);

    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Compile Root" } });
    const project = projectResponse.json<{ id: string }>();

    const rootResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files`,
      payload: { path: "chapters/paper.tex", content: "\\documentclass{article}\\begin{document}Paper\\end{document}" }
    });
    expect(rootResponse.statusCode).toBe(201);

    await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      payload: { rootFilePath: "chapters/paper.tex" }
    });

    const compileResponse = await app.inject({ method: "POST", url: `/api/projects/${project.id}/compile` });
    expect(compileResponse.statusCode).toBe(200);
    expect(compileResponse.json<{ status: string; stdout: string; pdfPath: string }>())
      .toEqual(expect.objectContaining({ status: "success", stdout: expect.stringContaining("compiled chapters/paper.tex") }));

    const pdfResponse = await app.inject({ method: "GET", url: `/api/projects/${project.id}/pdf` });
    expect(pdfResponse.statusCode).toBe(200);
    expect(pdfResponse.rawPayload.toString("utf8")).toBe("PDF");
    await expect(fs.stat(path.join(tmpDir, "projects", project.id, "main.pdf"))).rejects.toThrow();
    await expect(fs.stat(path.join(tmpDir, "projects", project.id, "chapters", "paper.pdf"))).resolves.toBeDefined();
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

  it("uploads files and assigns duplicate-safe names", async () => {
    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Uploads" } });
    const project = projectResponse.json<{ id: string }>();
    const boundary = "underleaf-test-boundary";
    const uploadBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="path-0"',
      "",
      "figures/logo.png",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file-0"; filename="logo.png"',
      "Content-Type: image/png",
      "",
      "PNGDATA",
      `--${boundary}`,
      'Content-Disposition: form-data; name="path-1"',
      "",
      "figures/logo.png",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file-1"; filename="logo.png"',
      "Content-Type: image/png",
      "",
      "PNGDATA2",
      `--${boundary}--`,
      ""
    ].join("\r\n");

    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files/upload`,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: uploadBody
    });

    expect(uploadResponse.statusCode).toBe(201);
    expect(uploadResponse.json<Array<{ path: string }>>()).toEqual([
      expect.objectContaining({ path: "figures/logo.png" }),
      expect.objectContaining({ path: "figures/logo-1.png" })
    ]);
    await expect(fs.readFile(path.join(tmpDir, "projects", project.id, "figures", "logo.png"), "utf8")).resolves.toBe("PNGDATA");
    await expect(fs.readFile(path.join(tmpDir, "projects", project.id, "figures", "logo-1.png"), "utf8")).resolves.toBe("PNGDATA2");

    const uploadedFile = uploadResponse.json<Array<{ id: string; path: string }>>()[0];
    const rawResponse = await app.inject({ method: "GET", url: `/api/projects/${project.id}/files/${uploadedFile.id}/raw` });
    expect(rawResponse.statusCode).toBe(200);
    expect(rawResponse.headers["content-type"]).toContain("image/png");
    expect(rawResponse.rawPayload.toString("utf8")).toBe("PNGDATA");
  });

  it("searches project text files and reports source locations", async () => {
    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Searchable" } });
    const project = projectResponse.json<{ id: string }>();
    const files = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/files` })).json<Array<{ id: string; path: string }>>();
    const mainFile = files.find((file) => file.path === "main.tex");
    expect(mainFile).toBeDefined();

    await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/files/${mainFile?.id}/content`,
      payload: { content: "\\documentclass{article}\n\\begin{document}\nA searchable theorem lives here.\n\\end{document}" }
    });
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files`,
      payload: { path: "notes.txt", content: "Another searchable note" }
    });

    const response = await app.inject({ method: "GET", url: `/api/projects/${project.id}/search?q=searchable` });

    expect(response.statusCode).toBe(200);
    expect(response.json<Array<{ path: string; line: number; column: number; preview: string }>>()).toEqual([
      expect.objectContaining({ path: "main.tex", line: 3, column: 3, preview: "A searchable theorem lives here." }),
      expect.objectContaining({ path: "notes.txt", line: 1, column: 9, preview: "Another searchable note" })
    ]);
  });

  it("builds a clickable LaTeX document outline across source files", async () => {
    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Outlined" } });
    const project = projectResponse.json<{ id: string }>();
    const files = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/files` })).json<Array<{ id: string; path: string }>>();
    const mainFile = files.find((file) => file.path === "main.tex");
    expect(mainFile).toBeDefined();

    await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/files/${mainFile?.id}/content`,
      payload: {
        content: [
          "\\documentclass{report}",
          "\\begin{document}",
          "\\chapter{Project Overview}",
          "\\section*{Motivation}",
          "\\subsection[Short]{Detailed \\textbf{Method}} % outline item",
          "\\section{Ignored Comment} % not ignored because before comment",
          "% \\section{Hidden}",
          "\\input{chapters/background}",
          "\\end{document}"
        ].join("\n")
      }
    });
    const chapterResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files`,
      payload: { path: "chapters/background.tex", content: "\\section{Background}\n\\subsection{Prior Work}" }
    });
    expect(chapterResponse.statusCode).toBe(201);

    const response = await app.inject({ method: "GET", url: `/api/projects/${project.id}/outline` });

    expect(response.statusCode).toBe(200);
    expect(response.json<Array<{ path: string; line: number; level: number; kind: string; title: string }>>()).toEqual([
      expect.objectContaining({ path: "main.tex", line: 3, level: 1, kind: "chapter", title: "Project Overview" }),
      expect.objectContaining({ path: "main.tex", line: 4, level: 2, kind: "section", title: "Motivation" }),
      expect.objectContaining({ path: "main.tex", line: 5, level: 3, kind: "subsection", title: "Detailed Method" }),
      expect.objectContaining({ path: "main.tex", line: 6, level: 2, kind: "section", title: "Ignored Comment" }),
      expect.objectContaining({ path: "chapters/background.tex", line: 1, level: 2, kind: "section", title: "Background" }),
      expect.objectContaining({ path: "chapters/background.tex", line: 2, level: 3, kind: "subsection", title: "Prior Work" })
    ]);
  });

  it("counts project words while ignoring common LaTeX syntax", async () => {
    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Counted" } });
    const project = projectResponse.json<{ id: string }>();
    const files = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/files` })).json<Array<{ id: string; path: string }>>();
    const mainFile = files.find((file) => file.path === "main.tex");
    expect(mainFile).toBeDefined();

    await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/files/${mainFile?.id}/content`,
      payload: {
        content: [
          "\\documentclass{article}",
          "% Hidden comment words",
          "\\begin{document}",
          "\\section{Readable Heading}",
          "First sentence has five words.",
          "Math $x + y = z$ is ignored.",
          "A \\textbf{bold claim} remains readable.",
          "\\cite{smith2020} \\label{sec:intro}",
          "\\end{document}"
        ].join("\n")
      }
    });
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files`,
      payload: { path: "chapters/method.tex", content: "\\subsection{Method}\nSecond file adds words." }
    });

    const response = await app.inject({ method: "GET", url: `/api/projects/${project.id}/word-count` });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ words: number; files: Array<{ path: string; words: number }> }>()).toMatchObject({
      words: 20,
      files: [
        expect.objectContaining({ path: "main.tex", words: 15 }),
        expect.objectContaining({ path: "chapters/method.tex", words: 5 })
      ]
    });
  });

  it("collects labels and citation keys for editor completions", async () => {
    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Symbols" } });
    const project = projectResponse.json<{ id: string }>();
    const files = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/files` })).json<Array<{ id: string; path: string }>>();
    const mainFile = files.find((file) => file.path === "main.tex");
    expect(mainFile).toBeDefined();

    await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/files/${mainFile?.id}/content`,
      payload: {
        content: [
          "\\section{Intro}\\label{sec:intro}",
          "% \\label{hidden}",
          "\\begin{thebibliography}{9}",
          "\\bibitem{knuth1984} Donald Knuth.",
          "\\end{thebibliography}"
        ].join("\n")
      }
    });
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files`,
      payload: { path: "chapters/results.tex", content: "\\subsection{Results}\\label{sec:results}\n\\label{sec:intro}" }
    });
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files`,
      payload: {
        path: "refs.bib",
        content: [
          "@article{smith2024,",
          "  title = {A paper}",
          "}",
          "% @book{hidden2024,"
        ].join("\n")
      }
    });

    const response = await app.inject({ method: "GET", url: `/api/projects/${project.id}/symbols` });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ labels: Array<{ key: string; path: string; line: number }>; citations: Array<{ key: string; path: string; line: number }> }>()).toEqual({
      labels: [
        expect.objectContaining({ key: "sec:intro", path: "main.tex", line: 1 }),
        expect.objectContaining({ key: "sec:results", path: "chapters/results.tex", line: 1 })
      ],
      citations: [
        expect.objectContaining({ key: "knuth1984", path: "main.tex", line: 4 }),
        expect.objectContaining({ key: "smith2024", path: "refs.bib", line: 1 })
      ]
    });
  });

  it("exports and imports project archives", async () => {
    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Archive Source" } });
    const project = projectResponse.json<{ id: string }>();
    const files = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/files` })).json<Array<{ id: string; path: string }>>();
    const mainFile = files.find((file) => file.path === "main.tex");
    expect(mainFile).toBeDefined();

    await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/files/${mainFile?.id}/content`,
      payload: { content: "\\documentclass{article}\n\\begin{document}\nExported source\n\\end{document}" }
    });
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files`,
      payload: { path: "chapters/intro.tex", content: "Imported chapter" }
    });

    const downloadResponse = await app.inject({ method: "GET", url: `/api/projects/${project.id}/download` });
    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.headers["content-type"]).toContain("application/gzip");

    const boundary = "underleaf-import-boundary";
    const importBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="archive-source.tar.gz"\r\nContent-Type: application/gzip\r\n\r\n`),
      downloadResponse.rawPayload,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const importResponse = await app.inject({
      method: "POST",
      url: "/api/projects/import?name=Imported%20Archive",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: importBody
    });

    expect(importResponse.statusCode).toBe(201);
    const importedProject = importResponse.json<{ id: string; name: string }>();
    expect(importedProject.name).toBe("Imported Archive");

    const importedFiles = (await app.inject({ method: "GET", url: `/api/projects/${importedProject.id}/files` })).json<Array<{ id: string; path: string }>>();
    expect(importedFiles.map((file) => file.path).sort()).toEqual(["chapters/intro.tex", "main.tex"]);
    const importedMain = importedFiles.find((file) => file.path === "main.tex");
    const importedMainResponse = await app.inject({ method: "GET", url: `/api/projects/${importedProject.id}/files/${importedMain?.id}` });
    expect(importedMainResponse.json<{ content: string }>().content).toContain("Exported source");
  });

  it("duplicates a project with source files, folders, and root document settings", async () => {
    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Original Paper" } });
    const project = projectResponse.json<{ id: string }>();
    const files = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/files` })).json<Array<{ id: string; path: string }>>();
    const mainFile = files.find((file) => file.path === "main.tex");
    expect(mainFile).toBeDefined();

    await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/files/${mainFile?.id}/content`,
      payload: { content: "\\documentclass{article}\n\\begin{document}\nOriginal text\n\\end{document}" }
    });
    const chapterResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files`,
      payload: { path: "chapters/intro.tex", content: "\\section{Copied chapter}" }
    });
    expect(chapterResponse.statusCode).toBe(201);
    await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      payload: { rootFilePath: "chapters/intro.tex" }
    });

    const duplicateResponse = await app.inject({ method: "POST", url: `/api/projects/${project.id}/duplicate` });
    expect(duplicateResponse.statusCode).toBe(201);
    const duplicateProject = duplicateResponse.json<{ id: string; name: string; rootFilePath: string | null }>();
    expect(duplicateProject.id).not.toBe(project.id);
    expect(duplicateProject.name).toBe("Copy of Original Paper");
    expect(duplicateProject.rootFilePath).toBe("chapters/intro.tex");

    const duplicateFiles = (await app.inject({ method: "GET", url: `/api/projects/${duplicateProject.id}/files` })).json<Array<{ id: string; path: string }>>();
    expect(duplicateFiles.map((file) => file.path).sort()).toEqual(["chapters/intro.tex", "main.tex"]);
    expect(duplicateFiles.map((file) => file.id)).not.toEqual(files.map((file) => file.id));
    const duplicateFolders = (await app.inject({ method: "GET", url: `/api/projects/${duplicateProject.id}/folders` })).json<Array<{ path: string }>>();
    expect(duplicateFolders).toEqual(expect.arrayContaining([expect.objectContaining({ path: "chapters" })]));

    const duplicateMain = duplicateFiles.find((file) => file.path === "main.tex");
    const duplicateMainResponse = await app.inject({ method: "GET", url: `/api/projects/${duplicateProject.id}/files/${duplicateMain?.id}` });
    expect(duplicateMainResponse.json<{ content: string }>().content).toContain("Original text");
    await expect(fs.readFile(path.join(tmpDir, "projects", duplicateProject.id, "chapters", "intro.tex"), "utf8")).resolves.toContain("Copied chapter");
  });

  it("initializes git repositories and commits project changes", async () => {
    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Versioned" } });
    const project = projectResponse.json<{ id: string }>();
    const files = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/files` })).json<Array<{ id: string; path: string }>>();
    const mainFile = files.find((file) => file.path === "main.tex");
    expect(mainFile).toBeDefined();
    await execFileAsync("git", ["init"], { cwd: tmpDir });

    const initialStatus = await app.inject({ method: "GET", url: `/api/projects/${project.id}/git/status` });
    expect(initialStatus.statusCode).toBe(200);
    expect(initialStatus.json<{ initialized: boolean }>().initialized).toBe(false);

    const initStatus = await app.inject({ method: "POST", url: `/api/projects/${project.id}/git/init` });
    expect(initStatus.statusCode).toBe(200);
    expect(initStatus.json<{ initialized: boolean; hasChanges: boolean; entries: Array<{ path: string }> }>()).toMatchObject({
      initialized: true,
      hasChanges: true
    });
    expect(initStatus.json<{ entries: Array<{ path: string }> }>().entries.map((entry) => entry.path)).toEqual(
      expect.arrayContaining([".gitignore", "main.tex"])
    );

    const firstCommit = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/git/commit`,
      payload: { message: "Initial project" }
    });
    expect(firstCommit.statusCode).toBe(200);
    expect(firstCommit.json<{ hasChanges: boolean; lastCommit: { subject: string } }>().hasChanges).toBe(false);
    expect(firstCommit.json<{ lastCommit: { subject: string } }>().lastCommit.subject).toBe("Initial project");

    await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/files/${mainFile?.id}/content`,
      payload: { content: "\\documentclass{article}\n\\begin{document}\nGit changed this.\n\\end{document}" }
    });

    const dirtyStatus = await app.inject({ method: "GET", url: `/api/projects/${project.id}/git/status` });
    expect(dirtyStatus.statusCode).toBe(200);
    expect(dirtyStatus.json<{ hasChanges: boolean; entries: Array<{ path: string; status: string }> }>()).toMatchObject({
      hasChanges: true,
      entries: [expect.objectContaining({ path: "main.tex" })]
    });
  });

  it("creates and restores project snapshots", async () => {
    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "History" } });
    const project = projectResponse.json<{ id: string }>();
    const files = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/files` })).json<Array<{ id: string }>>();

    await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/files/${files[0].id}/content`,
      payload: { content: "\\documentclass{article}\\begin{document}Original\\end{document}" }
    });

    const snapshotResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/snapshots`,
      payload: { label: "Before edits" }
    });
    expect(snapshotResponse.statusCode).toBe(201);
    const snapshot = snapshotResponse.json<{ id: string; label: string; fileCount: number }>();
    expect(snapshot).toMatchObject({ label: "Before edits", fileCount: 1 });

    await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/files/${files[0].id}/content`,
      payload: { content: "\\documentclass{article}\\begin{document}Changed\\end{document}" }
    });
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/files`,
      payload: { path: "extra.tex", content: "temporary" }
    });

    const detailResponse = await app.inject({ method: "GET", url: `/api/projects/${project.id}/snapshots/${snapshot.id}` });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json<{ files: Array<{ path: string }> }>().files).toEqual([expect.objectContaining({ path: "main.tex" })]);
    const downloadResponse = await app.inject({ method: "GET", url: `/api/projects/${project.id}/snapshots/${snapshot.id}/download` });
    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.headers["content-type"]).toContain("application/gzip");

    const restoreResponse = await app.inject({ method: "POST", url: `/api/projects/${project.id}/snapshots/${snapshot.id}/restore` });
    expect(restoreResponse.statusCode).toBe(200);

    const filesAfterRestore = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/files` })).json<Array<{ id: string; path: string }>>();
    expect(filesAfterRestore.map((file) => file.path)).toEqual(["main.tex"]);
    const restoredFile = await app.inject({ method: "GET", url: `/api/projects/${project.id}/files/${filesAfterRestore[0].id}` });
    expect(restoredFile.json<{ content: string }>().content).toContain("Original");
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

  it("extracts clickable diagnostics from compiler errors", async () => {
    const fakeLatexmk = path.join(tmpDir, "fake-latexmk-error");
    await fs.writeFile(
      fakeLatexmk,
      "#!/bin/sh\nprintf '%s\\n' './main.tex:7: Undefined control sequence.' 'l.7 \\\\brokencommand' >&2\nexit 1\n",
      "utf8"
    );
    await fs.chmod(fakeLatexmk, 0o755);
    config.latexmkBin = fakeLatexmk;

    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Broken compile" } });
    const project = projectResponse.json<{ id: string }>();

    const response = await app.inject({ method: "POST", url: `/api/projects/${project.id}/compile` });

    expect(response.statusCode).toBe(500);
    expect(response.json<{ diagnostics: Array<{ severity: string; filePath: string; line: number; message: string }> }>().diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        filePath: "main.tex",
        line: 7,
        message: expect.stringContaining("Undefined control sequence")
      })
    ]);
  });

  it("stores warning diagnostics for successful compiles", async () => {
    const fakeLatexmk = path.join(tmpDir, "fake-latexmk-warning");
    await fs.writeFile(
      fakeLatexmk,
      "#!/bin/sh\nprintf '%s\\n' 'LaTeX Warning: Reference `missing` on page 1 undefined on input line 12.' >&2\nprintf '%s' fake-pdf > main.pdf\n",
      "utf8"
    );
    await fs.chmod(fakeLatexmk, 0o755);
    config.latexmkBin = fakeLatexmk;

    const projectResponse = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Warning compile" } });
    const project = projectResponse.json<{ id: string }>();

    const response = await app.inject({ method: "POST", url: `/api/projects/${project.id}/compile` });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ diagnostics: Array<{ severity: string; filePath: string; line: number; message: string }> }>().diagnostics).toEqual([
      expect.objectContaining({
        severity: "warning",
        filePath: "main.tex",
        line: 12,
        message: expect.stringContaining("Reference")
      })
    ]);
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
