import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { api, type CompileJob, type ProjectFile, type ProjectFileWithContent } from "../api";
import { EditorHeader } from "../components/editor/EditorHeader";
import { EditorLayout } from "../components/editor/EditorLayout";
import { FileSidebar } from "../components/editor/FileSidebar";
import type { LayoutMode, SaveState } from "../types/editor";

export function ProjectEditorPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const queryClient = useQueryClient();
  const [activeFile, setActiveFile] = useState<ProjectFileWithContent | null>(null);
  const [content, setContent] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [layout, setLayout] = useState<LayoutMode>("split");
  const [compileOverride, setCompileOverride] = useState<CompileJob | null>(null);
  const [pdfNonce, setPdfNonce] = useState(0);
  const [newFilePath, setNewFilePath] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [projectName, setProjectName] = useState("");

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId)
  });

  const filesQuery = useQuery({
    queryKey: ["project-files", projectId],
    queryFn: () => api.listFiles(projectId)
  });

  const latestCompileQuery = useQuery({
    queryKey: ["latest-compile", projectId],
    queryFn: () => api.latestCompile(projectId)
  });

  const project = projectQuery.data ?? null;
  const files = filesQuery.data ?? [];
  const compileJob = compileOverride ?? latestCompileQuery.data ?? null;

  useEffect(() => {
    if (project) setProjectName(project.name);
  }, [project]);

  useEffect(() => {
    const selectFirstFile = async () => {
      if (files.length === 0) {
        setActiveFile(null);
        setContent("");
        return;
      }

      const shouldSelectFirst = !activeFile || !files.some((file) => file.id === activeFile.id);
      if (!shouldSelectFirst) return;

      const file = await queryClient.fetchQuery({
        queryKey: ["project-file", projectId, files[0].id],
        queryFn: () => api.getFile(projectId, files[0].id)
      });
      setActiveFile(file);
      setContent(file.content);
      setSaveState("idle");
    };

    void selectFirstFile();
  }, [activeFile, files, projectId, queryClient]);

  const saveFileMutation = useMutation({
    mutationFn: ({ fileId, nextContent }: { fileId: string; nextContent: string }) => api.saveFile(projectId, fileId, nextContent),
    onSuccess: (saved) => {
      queryClient.setQueryData(["project-file", projectId, saved.id], saved);
      setActiveFile(saved);
      setSaveState("saved");
    },
    onError: () => setSaveState("error")
  });

  const createFileMutation = useMutation({
    mutationFn: (path: string) => api.createFile(projectId, path),
    onSuccess: async (file) => {
      setNewFilePath("");
      await queryClient.invalidateQueries({ queryKey: ["project-files", projectId] });
      await openFile(file);
    }
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) => api.deleteFile(projectId, fileId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-files", projectId] });
    }
  });

  const compileMutation = useMutation({
    mutationFn: () => api.compile(projectId),
    onSuccess: async (job) => {
      setCompileOverride(job);
      queryClient.setQueryData(["latest-compile", projectId], job);
      if (job.status === "success") setPdfNonce(Date.now());
    },
    onError: async () => {
      const latest = await queryClient.fetchQuery({
        queryKey: ["latest-compile", projectId],
        queryFn: () => api.latestCompile(projectId)
      });
      setCompileOverride(latest);
    }
  });

  const renameProjectMutation = useMutation({
    mutationFn: (name: string) => api.updateProject(projectId, name),
    onSuccess: async (nextProject) => {
      queryClient.setQueryData(["project", projectId], nextProject);
      setProjectName(nextProject.name);
      setRenaming(false);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  useEffect(() => {
    if (!projectId || !activeFile || content === activeFile.content) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      saveFileMutation.mutate({ fileId: activeFile.id, nextContent: content });
    }, 650);

    return () => window.clearTimeout(timer);
  }, [activeFile, content, projectId, saveFileMutation]);

  const openFile = async (file: ProjectFile) => {
    const nextFile = await queryClient.fetchQuery({
      queryKey: ["project-file", projectId, file.id],
      queryFn: () => api.getFile(projectId, file.id)
    });
    setActiveFile(nextFile);
    setContent(nextFile.content);
    setSaveState("idle");
  };

  const createFile = async () => {
    if (!newFilePath.trim()) return;
    await createFileMutation.mutateAsync(newFilePath);
  };

  const deleteFile = async (file: ProjectFile) => {
    await deleteFileMutation.mutateAsync(file.id);
    if (activeFile?.id === file.id) {
      setActiveFile(null);
      setContent("");
    }
  };

  const compile = async () => {
    await compileMutation.mutateAsync().catch(() => undefined);
  };

  const renameProject = async () => {
    await renameProjectMutation.mutateAsync(projectName);
  };

  const statusText = useMemo(() => {
    if (compileMutation.isPending) return "Compiling";
    if (compileJob?.status === "success") return `Compiled in ${compileJob.durationMs ?? 0} ms`;
    if (compileJob?.status === "error") return "Compile error";
    return "Not compiled";
  }, [compileJob, compileMutation.isPending]);

  const loadError = projectQuery.error ?? filesQuery.error;
  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="rounded-md border border-border bg-card p-6 shadow-sm">
          <h1 className="text-base font-semibold">Project unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {loadError instanceof Error ? loadError.message : "Project not found"}
          </p>
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
        compiling={compileMutation.isPending}
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
