import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { api, type CompileJob, type ProjectFile, type ProjectFileWithContent, type ProjectFolder } from "../api";
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
  const [renaming, setRenaming] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [sourceTarget, setSourceTarget] = useState<{ fileId: string; line: number; column: number; nonce: number } | null>(null);

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId)
  });

  const filesQuery = useQuery({
    queryKey: ["project-files", projectId],
    queryFn: () => api.listFiles(projectId)
  });

  const foldersQuery = useQuery({
    queryKey: ["project-folders", projectId],
    queryFn: () => api.listFolders(projectId)
  });

  const latestCompileQuery = useQuery({
    queryKey: ["latest-compile", projectId],
    queryFn: () => api.latestCompile(projectId)
  });

  const project = projectQuery.data ?? null;
  const files = filesQuery.data ?? [];
  const folders = foldersQuery.data ?? [];
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
      await queryClient.invalidateQueries({ queryKey: ["project-files", projectId] });
      await openFile(file);
    }
  });

  const renameFileMutation = useMutation({
    mutationFn: ({ fileId, path }: { fileId: string; path: string }) => api.renameFile(projectId, fileId, path),
    onSuccess: async (file) => {
      await queryClient.invalidateQueries({ queryKey: ["project-files", projectId] });
      queryClient.setQueryData(["project-file", projectId, file.id], undefined);
      if (activeFile?.id === file.id) {
        const nextFile = await api.getFile(projectId, file.id);
        queryClient.setQueryData(["project-file", projectId, file.id], nextFile);
        setActiveFile(nextFile);
        setContent(nextFile.content);
      }
    }
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) => api.deleteFile(projectId, fileId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-files", projectId] });
    }
  });

  const createFolderMutation = useMutation({
    mutationFn: (path: string) => api.createFolder(projectId, path),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-folders", projectId] });
    }
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ folderId, path }: { folderId: string; path: string }) => api.renameFolder(projectId, folderId, path),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-folders", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-files", projectId] })
      ]);
      setActiveFile(null);
      setContent("");
    }
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => api.deleteFolder(projectId, folderId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-folders", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-files", projectId] })
      ]);
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
    return nextFile;
  };

  const createFile = async (path: string) => {
    if (!path.trim()) return;
    await createFileMutation.mutateAsync(path);
  };

  const createFolder = async (path: string) => {
    if (!path.trim()) return;
    await createFolderMutation.mutateAsync(path);
  };

  const renameFile = async (file: ProjectFile, path: string) => {
    if (!path.trim()) return;
    await renameFileMutation.mutateAsync({ fileId: file.id, path });
  };

  const renameFolder = async (folder: ProjectFolder, path: string) => {
    if (!path.trim()) return;
    await renameFolderMutation.mutateAsync({ folderId: folder.id, path });
  };

  const deleteFile = async (file: ProjectFile) => {
    await deleteFileMutation.mutateAsync(file.id);
    if (activeFile?.id === file.id) {
      setActiveFile(null);
      setContent("");
    }
  };

  const deleteFolder = async (folder: ProjectFolder) => {
    await deleteFolderMutation.mutateAsync(folder.id);
    if (activeFile?.path.startsWith(`${folder.path}/`)) {
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

  const showPdfSource = async (location: { fileId: string; line: number; column: number }) => {
    const file = files.find((item) => item.id === location.fileId);
    if (!file) return;
    await openFile(file);
    setSourceTarget({ ...location, nonce: Date.now() });
    if (layout === "pdf") setLayout("split");
  };

  const statusText = useMemo(() => {
    if (compileMutation.isPending) return "Compiling";
    if (compileJob?.status === "success") return `Compiled in ${compileJob.durationMs ?? 0} ms`;
    if (compileJob?.status === "error") return "Compile error";
    return "Not compiled";
  }, [compileJob, compileMutation.isPending]);

  const loadError = projectQuery.error ?? filesQuery.error ?? foldersQuery.error;
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
          folders={folders}
          activeFile={activeFile}
          onCreateFile={(path) => void createFile(path)}
          onCreateFolder={(path) => void createFolder(path)}
          onRenameFile={(file, path) => void renameFile(file, path)}
          onRenameFolder={(folder, path) => void renameFolder(folder, path)}
          onOpenFile={(file) => void openFile(file)}
          onDeleteFile={(file) => void deleteFile(file)}
          onDeleteFolder={(folder) => void deleteFolder(folder)}
        />
        <EditorLayout
          layout={layout}
          projectId={projectId}
          activeFile={activeFile}
          content={content}
          saveState={saveState}
          compileJob={compileJob}
          pdfNonce={pdfNonce}
          sourceTarget={sourceTarget}
          onContentChange={setContent}
          onPdfReload={() => setPdfNonce(Date.now())}
          onPdfSourceLocated={(location) => void showPdfSource(location)}
        />
      </div>
    </main>
  );
}
