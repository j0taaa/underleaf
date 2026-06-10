import { useCallback, useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  ChevronLeft,
  FilePlus2,
  FileText,
  FolderOpen,
  LayoutPanelLeft,
  Maximize2,
  PanelRightOpen,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2
} from "lucide-react";
import { api, type CompileJob, type Project, type ProjectFile, type ProjectFileWithContent } from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Select } from "./components/ui/select";
import { cn } from "./lib/utils";

type LayoutMode = "split" | "editor" | "pdf";
type SaveState = "idle" | "saving" | "saved" | "error";

const templateOptions = [
  { value: "article", label: "Article" },
  { value: "report", label: "Report" },
  { value: "beamer", label: "Beamer" }
];

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const refreshProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const nextProjects = await api.listProjects();
      setProjects(nextProjects);
      setActiveProject((current) => {
        if (!current) return current;
        return nextProjects.find((project) => project.id === current.id) ?? null;
      });
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  if (activeProject) {
    return (
      <EditorWorkspace
        project={activeProject}
        onBack={() => {
          setActiveProject(null);
          void refreshProjects();
        }}
        onProjectRenamed={(project) => {
          setActiveProject(project);
          setProjects((current) => current.map((item) => (item.id === project.id ? project : item)));
        }}
      />
    );
  }

  return (
    <Dashboard
      projects={projects}
      loading={loadingProjects}
      onOpen={setActiveProject}
      onRefresh={refreshProjects}
    />
  );
}

function Dashboard({
  projects,
  loading,
  onOpen,
  onRefresh
}: {
  projects: Project[];
  loading: boolean;
  onOpen: (project: Project) => void;
  onRefresh: () => Promise<void>;
}) {
  const [name, setName] = useState("Untitled Project");
  const [template, setTemplate] = useState("article");
  const [creating, setCreating] = useState(false);

  const createProject = async () => {
    setCreating(true);
    try {
      const project = await api.createProject({ name, template });
      await onRefresh();
      onOpen(project);
    } finally {
      setCreating(false);
    }
  };

  const deleteProject = async (projectId: string) => {
    await api.deleteProject(projectId);
    await onRefresh();
  };

  return (
    <main className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Underleaf</h1>
              <p className="text-xs text-muted-foreground">Self-hosted LaTeX projects</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void onRefresh()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <form
          className="rounded-md border border-border bg-card p-4 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void createProject();
          }}
        >
          <h2 className="mb-4 text-base font-semibold">Create project</h2>
          <div className="space-y-3">
            <Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Project name" />
            <Select value={template} onChange={(event) => setTemplate(event.target.value)} aria-label="Template">
              {templateOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button type="submit" disabled={creating || !name.trim()} className="w-full">
              <Plus className="h-4 w-4" />
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>

        <div className="rounded-md border border-border bg-card shadow-sm">
          <div className="flex h-12 items-center justify-between border-b border-border px-4">
            <h2 className="text-sm font-semibold">Projects</h2>
            <span className="text-xs text-muted-foreground">{projects.length} total</span>
          </div>
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No projects yet. Create one to start writing.</div>
          ) : (
            <div className="divide-y divide-border">
              {projects.map((project) => (
                <div className="flex items-center justify-between gap-3 px-4 py-3" key={project.id}>
                  <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(project)}>
                    <div className="truncate text-sm font-medium">{project.name}</div>
                    <div className="text-xs text-muted-foreground">Updated {new Date(project.updatedAt).toLocaleString()}</div>
                  </button>
                  <Button variant="ghost" size="icon" title="Delete project" onClick={() => void deleteProject(project.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function EditorWorkspace({
  project,
  onBack,
  onProjectRenamed
}: {
  project: Project;
  onBack: () => void;
  onProjectRenamed: (project: Project) => void;
}) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeFile, setActiveFile] = useState<ProjectFileWithContent | null>(null);
  const [content, setContent] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [layout, setLayout] = useState<LayoutMode>("split");
  const [compileJob, setCompileJob] = useState<CompileJob | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [pdfNonce, setPdfNonce] = useState(0);
  const [newFilePath, setNewFilePath] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [projectName, setProjectName] = useState(project.name);

  const refreshFiles = useCallback(async () => {
    const nextFiles = await api.listFiles(project.id);
    setFiles(nextFiles);
    setActiveFile((current) => current ?? null);
    if (!activeFile && nextFiles[0]) {
      const file = await api.getFile(project.id, nextFiles[0].id);
      setActiveFile(file);
      setContent(file.content);
    }
  }, [activeFile, project.id]);

  useEffect(() => {
    void refreshFiles();
    void api.latestCompile(project.id).then(setCompileJob);
  }, [project.id]);

  useEffect(() => {
    if (!activeFile || content === activeFile.content) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void api
        .saveFile(project.id, activeFile.id, content)
        .then((saved) => {
          setActiveFile(saved);
          setSaveState("saved");
        })
        .catch(() => setSaveState("error"));
    }, 650);

    return () => window.clearTimeout(timer);
  }, [activeFile, content, project.id]);

  const openFile = async (file: ProjectFile) => {
    const nextFile = await api.getFile(project.id, file.id);
    setActiveFile(nextFile);
    setContent(nextFile.content);
    setSaveState("idle");
  };

  const createFile = async () => {
    if (!newFilePath.trim()) return;
    const file = await api.createFile(project.id, newFilePath);
    setNewFilePath("");
    await refreshFiles();
    await openFile(file);
  };

  const deleteFile = async (file: ProjectFile) => {
    await api.deleteFile(project.id, file.id);
    setFiles((current) => current.filter((item) => item.id !== file.id));
    if (activeFile?.id === file.id) {
      setActiveFile(null);
      setContent("");
    }
  };

  const compile = async () => {
    setCompiling(true);
    try {
      const job = await api.compile(project.id).catch((error) => {
        if (error instanceof Error) throw error;
        throw new Error("Compile failed");
      });
      setCompileJob(job);
      if (job.status === "success") setPdfNonce(Date.now());
    } catch {
      const latest = await api.latestCompile(project.id);
      setCompileJob(latest);
    } finally {
      setCompiling(false);
    }
  };

  const renameProject = async () => {
    const next = await api.updateProject(project.id, projectName);
    onProjectRenamed(next);
    setRenaming(false);
  };

  const statusText = useMemo(() => {
    if (compiling) return "Compiling";
    if (compileJob?.status === "success") return `Compiled in ${compileJob.durationMs ?? 0} ms`;
    if (compileJob?.status === "error") return "Compile error";
    return "Not compiled";
  }, [compileJob, compiling]);

  return (
    <main className="flex h-screen min-h-[620px] flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" title="Back to projects" onClick={onBack}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          {renaming ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void renameProject();
              }}
            >
              <Input className="w-56" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
              <Button size="sm" type="submit">Save</Button>
            </form>
          ) : (
            <button className="min-w-0 text-left" onClick={() => setRenaming(true)}>
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold">{project.name}</h1>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="text-xs text-muted-foreground">{activeFile?.path ?? "No file selected"}</div>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className={cn("hidden text-xs sm:inline", compileJob?.status === "error" ? "text-destructive" : "text-muted-foreground")}>
            {statusText}
          </span>
          <div className="hidden items-center rounded-md border border-border p-0.5 md:flex">
            <Button variant={layout === "split" ? "secondary" : "ghost"} size="icon" title="Split view" onClick={() => setLayout("split")}>
              <LayoutPanelLeft className="h-4 w-4" />
            </Button>
            <Button variant={layout === "editor" ? "secondary" : "ghost"} size="icon" title="Editor only" onClick={() => setLayout("editor")}>
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button variant={layout === "pdf" ? "secondary" : "ghost"} size="icon" title="PDF only" onClick={() => setLayout("pdf")}>
              <PanelRightOpen className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={() => void compile()} disabled={compiling}>
            <Play className="h-4 w-4" />
            {compiling ? "Compiling" : "Recompile"}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-border bg-card md:border-b-0 md:border-r">
          <div className="flex h-11 items-center justify-between border-b border-border px-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FolderOpen className="h-4 w-4" />
              Files
            </div>
          </div>
          <div className="flex gap-2 border-b border-border p-2">
            <Input placeholder="sections/intro.tex" value={newFilePath} onChange={(event) => setNewFilePath(event.target.value)} />
            <Button size="icon" variant="outline" title="Create file" onClick={() => void createFile()}>
              <FilePlus2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {files.map((file) => (
              <div className="group flex items-center gap-1" key={file.id}>
                <button
                  className={cn(
                    "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted",
                    activeFile?.id === file.id && "bg-muted font-medium"
                  )}
                  onClick={() => void openFile(file)}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{file.path}</span>
                </button>
                <Button variant="ghost" size="icon" title="Delete file" className="h-8 w-8 opacity-70 md:opacity-0 md:group-hover:opacity-100" onClick={() => void deleteFile(file)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </aside>

        <section
          className={cn(
            "grid min-h-0",
            layout === "split" && "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,45%)]",
            layout === "editor" && "grid-cols-1",
            layout === "pdf" && "grid-cols-1"
          )}
        >
          {layout !== "pdf" && (
            <div className="flex min-h-0 flex-col border-r border-border bg-[#1f2430]">
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-700 px-3 text-xs text-slate-300">
                <span>{activeFile?.path ?? "Select a file"}</span>
                <span className={cn(saveState === "error" ? "text-red-300" : "text-slate-400")}>
                  {saveState === "saving" && "Saving..."}
                  {saveState === "saved" && (
                    <span className="inline-flex items-center gap-1">
                      <Save className="h-3 w-3" />
                      Saved
                    </span>
                  )}
                  {saveState === "error" && "Save failed"}
                </span>
              </div>
              <div className="min-h-0 flex-1">
                <Editor
                  height="100%"
                  language="latex"
                  theme="vs-dark"
                  value={content}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    wordWrap: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true
                  }}
                  onChange={(value) => setContent(value ?? "")}
                />
              </div>
            </div>
          )}

          {layout !== "editor" && (
            <div className="flex min-h-0 flex-col bg-white">
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
                <span className="text-sm font-medium">PDF Preview</span>
                <Button variant="outline" size="sm" onClick={() => setPdfNonce(Date.now())}>
                  <RefreshCw className="h-4 w-4" />
                  Reload
                </Button>
              </div>
              {compileJob?.status === "success" ? (
                <iframe className="min-h-0 flex-1" title="PDF Preview" src={api.pdfUrl(project.id, pdfNonce)} />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
                  <div className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
                    Recompile the project to generate a PDF preview.
                  </div>
                  {compileJob?.status === "error" && (
                    <pre className="mt-4 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">
                      {compileJob.stderr || compileJob.stdout || "Compilation failed."}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
