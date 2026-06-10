import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type CompileJob, type Project, type ProjectFile, type ProjectFileWithContent } from "../api";
import { EditorHeader } from "../components/editor/EditorHeader";
import { EditorLayout } from "../components/editor/EditorLayout";
import { FileSidebar } from "../components/editor/FileSidebar";
import type { LayoutMode, SaveState } from "../types/editor";

export function ProjectEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
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
  const [projectName, setProjectName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshFiles = useCallback(async () => {
    if (!projectId) return;
    const nextFiles = await api.listFiles(projectId);
    setFiles(nextFiles);
    if (nextFiles.length > 0) {
      const shouldSelectFirst = !activeFile || !nextFiles.some((file) => file.id === activeFile.id);
      if (shouldSelectFirst) {
        const file = await api.getFile(projectId, nextFiles[0].id);
        setActiveFile(file);
        setContent(file.content);
        setSaveState("idle");
      }
    } else {
      setActiveFile(null);
      setContent("");
    }
  }, [activeFile, projectId]);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    const loadProject = async () => {
      try {
        const [nextProject, latestCompile] = await Promise.all([
          api.getProject(projectId),
          api.latestCompile(projectId)
        ]);
        if (cancelled) return;
        setProject(nextProject);
        setProjectName(nextProject.name);
        setCompileJob(latestCompile);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Project not found");
      }
    };

    void loadProject();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    void refreshFiles().catch((error) => {
      setLoadError(error instanceof Error ? error.message : "Unable to load files");
    });
  }, [refreshFiles]);

  useEffect(() => {
    if (!projectId || !activeFile || content === activeFile.content) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void api
        .saveFile(projectId, activeFile.id, content)
        .then((saved) => {
          setActiveFile(saved);
          setSaveState("saved");
        })
        .catch(() => setSaveState("error"));
    }, 650);

    return () => window.clearTimeout(timer);
  }, [activeFile, content, projectId]);

  const openFile = async (file: ProjectFile) => {
    if (!projectId) return;
    const nextFile = await api.getFile(projectId, file.id);
    setActiveFile(nextFile);
    setContent(nextFile.content);
    setSaveState("idle");
  };

  const createFile = async () => {
    if (!projectId || !newFilePath.trim()) return;
    const file = await api.createFile(projectId, newFilePath);
    setNewFilePath("");
    await refreshFiles();
    await openFile(file);
  };

  const deleteFile = async (file: ProjectFile) => {
    if (!projectId) return;
    await api.deleteFile(projectId, file.id);
    setFiles((current) => current.filter((item) => item.id !== file.id));
    if (activeFile?.id === file.id) {
      setActiveFile(null);
      setContent("");
    }
  };

  const compile = async () => {
    if (!projectId) return;
    setCompiling(true);
    try {
      const job = await api.compile(projectId).catch((error) => {
        if (error instanceof Error) throw error;
        throw new Error("Compile failed");
      });
      setCompileJob(job);
      if (job.status === "success") setPdfNonce(Date.now());
    } catch {
      setCompileJob(await api.latestCompile(projectId));
    } finally {
      setCompiling(false);
    }
  };

  const renameProject = async () => {
    if (!projectId) return;
    const nextProject = await api.updateProject(projectId, projectName);
    setProject(nextProject);
    setProjectName(nextProject.name);
    setRenaming(false);
  };

  const statusText = useMemo(() => {
    if (compiling) return "Compiling";
    if (compileJob?.status === "success") return `Compiled in ${compileJob.durationMs ?? 0} ms`;
    if (compileJob?.status === "error") return "Compile error";
    return "Not compiled";
  }, [compileJob, compiling]);

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="rounded-md border border-border bg-card p-6 shadow-sm">
          <h1 className="text-base font-semibold">Project unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
          <Link
            className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            to="/"
          >
            Back to projects
          </Link>
        </div>
      </main>
    );
  }

  if (!project || !projectId) {
    return <main className="p-6 text-sm text-muted-foreground">Loading project...</main>;
  }

  return (
    <main className="flex h-screen min-h-[620px] flex-col bg-background">
      <EditorHeader
        project={project}
        activeFile={activeFile}
        projectName={projectName}
        renaming={renaming}
        layout={layout}
        compileJob={compileJob}
        compiling={compiling}
        statusText={statusText}
        onProjectNameChange={setProjectName}
        onRenameStart={() => setRenaming(true)}
        onRenameSubmit={() => void renameProject()}
        onLayoutChange={setLayout}
        onCompile={() => void compile()}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
        <FileSidebar
          files={files}
          activeFile={activeFile}
          newFilePath={newFilePath}
          onNewFilePathChange={setNewFilePath}
          onCreateFile={() => void createFile()}
          onOpenFile={(file) => void openFile(file)}
          onDeleteFile={(file) => void deleteFile(file)}
        />
        <EditorLayout
          layout={layout}
          projectId={projectId}
          activeFile={activeFile}
          content={content}
          saveState={saveState}
          compileJob={compileJob}
          pdfNonce={pdfNonce}
          onContentChange={setContent}
          onPdfReload={() => setPdfNonce(Date.now())}
        />
      </div>
    </main>
  );
}
