import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { api, type CompileDiagnostic, type CompileJob, type ProjectFile, type ProjectFileWithContent, type ProjectFolder, type ProjectOutlineItem, type ProjectSearchResult } from "../api";
import { EditorHeader } from "../components/editor/EditorHeader";
import { EditorLayout } from "../components/editor/EditorLayout";
import { FileSidebar } from "../components/editor/FileSidebar";
import { HistoryPanel } from "../components/editor/HistoryPanel";
import { SourceControlPanel } from "../components/editor/SourceControlPanel";
import { WordCountPanel } from "../components/editor/WordCountPanel";
import { cn } from "../lib/utils";
import type { LayoutMode, SaveState } from "../types/editor";

type UploadItem = { file: File; path: string };
type UploadFileSystemEntry = {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
};
type UploadFileSystemFileEntry = UploadFileSystemEntry & {
  file: (success: (file: File) => void, failure?: (error: DOMException) => void) => void;
};
type UploadFileSystemDirectoryEntry = UploadFileSystemEntry & {
  createReader: () => {
    readEntries: (success: (entries: UploadFileSystemEntry[]) => void, failure?: (error: DOMException) => void) => void;
  };
};
type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => UploadFileSystemEntry | null;
};

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sourceControlOpen, setSourceControlOpen] = useState(false);
  const [wordCountOpen, setWordCountOpen] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

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

  const snapshotsQuery = useQuery({
    queryKey: ["project-snapshots", projectId],
    queryFn: () => api.listSnapshots(projectId)
  });

  const latestCompileQuery = useQuery({
    queryKey: ["latest-compile", projectId],
    queryFn: () => api.latestCompile(projectId)
  });

  const projectSearchQuery = useQuery({
    queryKey: ["project-search", projectId, debouncedSearchQuery],
    queryFn: () => api.searchProject(projectId, debouncedSearchQuery),
    enabled: debouncedSearchQuery.trim().length >= 2
  });

  const projectOutlineQuery = useQuery({
    queryKey: ["project-outline", projectId],
    queryFn: () => api.outlineProject(projectId)
  });

  const gitStatusQuery = useQuery({
    queryKey: ["project-git-status", projectId],
    queryFn: () => api.gitStatus(projectId),
    enabled: sourceControlOpen,
    refetchInterval: sourceControlOpen ? 3000 : false
  });

  const wordCountQuery = useQuery({
    queryKey: ["project-word-count", projectId],
    queryFn: () => api.wordCount(projectId),
    enabled: wordCountOpen
  });

  const projectSymbolsQuery = useQuery({
    queryKey: ["project-symbols", projectId],
    queryFn: () => api.symbols(projectId)
  });

  const project = projectQuery.data ?? null;
  const files = filesQuery.data ?? [];
  const folders = foldersQuery.data ?? [];
  const snapshots = snapshotsQuery.data ?? [];
  const compileJob = compileOverride ?? latestCompileQuery.data ?? null;
  const searchResults = debouncedSearchQuery.trim().length >= 2 ? projectSearchQuery.data ?? [] : [];
  const outlineItems = projectOutlineQuery.data ?? [];
  const projectSymbols = projectSymbolsQuery.data ?? null;

  const invalidateGitStatus = async () => {
    await queryClient.invalidateQueries({ queryKey: ["project-git-status", projectId] });
  };

  const invalidateOutline = async () => {
    await queryClient.invalidateQueries({ queryKey: ["project-outline", projectId] });
  };

  const invalidateWordCount = async () => {
    await queryClient.invalidateQueries({ queryKey: ["project-word-count", projectId] });
  };

  const invalidateSymbols = async () => {
    await queryClient.invalidateQueries({ queryKey: ["project-symbols", projectId] });
  };

  useEffect(() => {
    if (project) setProjectName(project.name);
  }, [project]);

  useEffect(() => {
    setSourceTarget(null);
    setCompileOverride(null);
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setCommitMessage("");
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const selectFirstFile = async () => {
      if (files.length === 0) {
        setActiveFile(null);
        setContent("");
        return;
      }

      const shouldSelectFirst = !activeFile || activeFile.projectId !== projectId || !files.some((file) => file.id === activeFile.id);
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
    onSuccess: async (saved) => {
      queryClient.setQueryData(["project-file", projectId, saved.id], saved);
      setActiveFile(saved);
      setSaveState("saved");
      await Promise.all([invalidateGitStatus(), invalidateOutline(), invalidateWordCount(), invalidateSymbols()]);
    },
    onError: () => setSaveState("error")
  });

  const createFileMutation = useMutation({
    mutationFn: (path: string) => api.createFile(projectId, path),
    onSuccess: async (file) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-files", projectId] }),
        invalidateGitStatus(),
        invalidateOutline(),
        invalidateWordCount(),
        invalidateSymbols()
      ]);
      await openFile(file);
    }
  });

  const renameFileMutation = useMutation({
    mutationFn: ({ fileId, path }: { fileId: string; path: string }) => api.renameFile(projectId, fileId, path),
    onSuccess: async (file) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-files", projectId] }),
        invalidateGitStatus(),
        invalidateOutline(),
        invalidateWordCount(),
        invalidateSymbols()
      ]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-files", projectId] }),
        invalidateGitStatus(),
        invalidateOutline(),
        invalidateWordCount(),
        invalidateSymbols()
      ]);
    }
  });

  const createFolderMutation = useMutation({
    mutationFn: (path: string) => api.createFolder(projectId, path),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-folders", projectId] }),
        invalidateGitStatus(),
        invalidateOutline(),
        invalidateWordCount(),
        invalidateSymbols()
      ]);
    }
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ folderId, path }: { folderId: string; path: string }) => api.renameFolder(projectId, folderId, path),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-folders", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-files", projectId] }),
        invalidateGitStatus(),
        invalidateOutline(),
        invalidateWordCount(),
        invalidateSymbols()
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
        queryClient.invalidateQueries({ queryKey: ["project-files", projectId] }),
        invalidateGitStatus(),
        invalidateOutline(),
        invalidateWordCount(),
        invalidateSymbols()
      ]);
    }
  });

  const uploadFilesMutation = useMutation({
    mutationFn: (uploads: UploadItem[]) => api.uploadFiles(projectId, uploads),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-files", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-folders", projectId] }),
        invalidateGitStatus(),
        invalidateOutline(),
        invalidateWordCount(),
        invalidateSymbols()
      ]);
    }
  });

  const createSnapshotMutation = useMutation({
    mutationFn: (label: string) => api.createSnapshot(projectId, label),
    onSuccess: async () => {
      setSnapshotLabel("");
      await queryClient.invalidateQueries({ queryKey: ["project-snapshots", projectId] });
    }
  });

  const restoreSnapshotMutation = useMutation({
    mutationFn: (snapshotId: string) => api.restoreSnapshot(projectId, snapshotId),
    onSuccess: async () => {
      setActiveFile(null);
      setContent("");
      setSourceTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-files", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-folders", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-snapshots", projectId] }),
        invalidateGitStatus(),
        invalidateOutline(),
        invalidateWordCount(),
        invalidateSymbols()
      ]);
    }
  });

  const initGitMutation = useMutation({
    mutationFn: () => api.initGit(projectId),
    onSuccess: (status) => {
      queryClient.setQueryData(["project-git-status", projectId], status);
    }
  });

  const commitGitMutation = useMutation({
    mutationFn: (message: string) => api.commitGit(projectId, message),
    onSuccess: (status) => {
      setCommitMessage("");
      queryClient.setQueryData(["project-git-status", projectId], status);
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
    if (!projectId || !activeFile || activeFile.projectId !== projectId || content === activeFile.content) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      saveFileMutation.mutate({ fileId: activeFile.id, nextContent: content });
    }, 650);

    return () => window.clearTimeout(timer);
  }, [activeFile, content, projectId, saveFileMutation]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData || clipboardData.files.length === 0) return;
      event.preventDefault();
      const uploads = Array.from(clipboardData.files).map((file, index) => ({
        file,
        path: pastedFileName(file, index)
      }));
      void uploadFiles(uploads);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

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

  const uploadFiles = async (uploads: UploadItem[]) => {
    if (uploads.length === 0) return;
    await uploadFilesMutation.mutateAsync(uploads);
  };

  const uploadDroppedItems = async (dataTransfer: DataTransfer, parentPath: string) => {
    const uploads = await uploadsFromDataTransfer(dataTransfer, parentPath);
    await uploadFiles(uploads);
  };

  const compile = async () => {
    await compileMutation.mutateAsync().catch(() => undefined);
  };

  const renameProject = async () => {
    await renameProjectMutation.mutateAsync(projectName);
  };

  const createSnapshot = async () => {
    await createSnapshotMutation.mutateAsync(snapshotLabel);
  };

  const restoreSnapshot = async (snapshotId: string) => {
    await restoreSnapshotMutation.mutateAsync(snapshotId);
  };

  const initGit = async () => {
    await initGitMutation.mutateAsync();
  };

  const commitGit = async () => {
    if (!commitMessage.trim()) return;
    await commitGitMutation.mutateAsync(commitMessage);
  };

  const showPdfSource = async (location: { fileId: string; line: number; column: number }) => {
    const file = files.find((item) => item.id === location.fileId);
    if (!file) return;
    await openFile(file);
    setSourceTarget({ ...location, nonce: Date.now() });
    if (layout === "pdf") setLayout("split");
  };

  const showCompileDiagnostic = async (diagnostic: CompileDiagnostic) => {
    const file = diagnostic.filePath ? files.find((item) => item.path === diagnostic.filePath) : activeFile;
    if (!file) return;

    await openFile(file);
    setSourceTarget({
      fileId: file.id,
      line: diagnostic.line ?? 1,
      column: diagnostic.column ?? 1,
      nonce: Date.now()
    });
    if (layout === "pdf") setLayout("split");
  };

  const showSearchResult = async (result: ProjectSearchResult) => {
    const file = files.find((item) => item.id === result.fileId);
    if (!file) return;

    await openFile(file);
    setSourceTarget({
      fileId: file.id,
      line: result.line,
      column: result.column,
      nonce: Date.now()
    });
    if (layout === "pdf") setLayout("split");
  };

  const showOutlineItem = async (item: ProjectOutlineItem) => {
    const file = files.find((candidate) => candidate.id === item.fileId);
    if (!file) return;

    await openFile(file);
    setSourceTarget({
      fileId: file.id,
      line: item.line,
      column: item.column,
      nonce: Date.now()
    });
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
        onHistoryToggle={() => {
          setSourceControlOpen(false);
          setWordCountOpen(false);
          setHistoryOpen((current) => !current);
        }}
        onSourceControlToggle={() => {
          setHistoryOpen(false);
          setWordCountOpen(false);
          setSourceControlOpen((current) => !current);
        }}
        onWordCountToggle={() => {
          setHistoryOpen(false);
          setSourceControlOpen(false);
          setWordCountOpen((current) => !current);
        }}
        onLayoutChange={setLayout}
        onCompile={() => void compile()}
      />
      <div className={cn("grid min-h-0 flex-1 grid-cols-1", historyOpen || sourceControlOpen || wordCountOpen ? "md:grid-cols-[260px_minmax(0,1fr)_320px]" : "md:grid-cols-[260px_minmax(0,1fr)]")}>
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
          onUploadItems={(dataTransfer, parentPath) => void uploadDroppedItems(dataTransfer, parentPath)}
          searchQuery={searchQuery}
          searchResults={searchResults}
          searching={projectSearchQuery.isFetching}
          outlineItems={outlineItems}
          outlineLoading={projectOutlineQuery.isFetching}
          onSearchQueryChange={setSearchQuery}
          onOpenSearchResult={(result) => void showSearchResult(result)}
          onOpenOutlineItem={(item) => void showOutlineItem(item)}
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
          symbols={projectSymbols}
          onContentChange={setContent}
          onPdfReload={() => setPdfNonce(Date.now())}
          onPdfSourceLocated={(location) => void showPdfSource(location)}
          onDiagnosticSelected={(diagnostic) => void showCompileDiagnostic(diagnostic)}
        />
        {historyOpen && (
          <HistoryPanel
            projectId={projectId}
            snapshots={snapshots}
            label={snapshotLabel}
            creating={createSnapshotMutation.isPending}
            restoringId={typeof restoreSnapshotMutation.variables === "string" && restoreSnapshotMutation.isPending ? restoreSnapshotMutation.variables : null}
            onLabelChange={setSnapshotLabel}
            onCreate={() => void createSnapshot()}
            onRestore={(snapshot) => void restoreSnapshot(snapshot.id)}
            onClose={() => setHistoryOpen(false)}
          />
        )}
        {sourceControlOpen && (
          <SourceControlPanel
            status={gitStatusQuery.data ?? null}
            loading={gitStatusQuery.isPending}
            initializing={initGitMutation.isPending}
            committing={commitGitMutation.isPending}
            commitMessage={commitMessage}
            onCommitMessageChange={setCommitMessage}
            onInit={() => void initGit()}
            onCommit={() => void commitGit()}
            onRefresh={() => void gitStatusQuery.refetch()}
            onClose={() => setSourceControlOpen(false)}
          />
        )}
        {wordCountOpen && (
          <WordCountPanel
            count={wordCountQuery.data ?? null}
            loading={wordCountQuery.isPending}
            onRefresh={() => void wordCountQuery.refetch()}
            onClose={() => setWordCountOpen(false)}
          />
        )}
      </div>
    </main>
  );
}

async function uploadsFromDataTransfer(dataTransfer: DataTransfer, parentPath: string): Promise<UploadItem[]> {
  const entries = Array.from(dataTransfer.items)
    .map((item): UploadFileSystemEntry | null => (item as unknown as DataTransferItemWithEntry).webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is UploadFileSystemEntry => entry !== null);

  if (entries.length > 0) {
    const nestedUploads = await Promise.all(entries.map((entry) => uploadsFromEntry(entry, parentPath)));
    return nestedUploads.flat();
  }

  return Array.from(dataTransfer.files).map((file) => ({
    file,
    path: joinUploadPath(parentPath, file.webkitRelativePath || file.name)
  }));
}

async function uploadsFromEntry(entry: UploadFileSystemEntry, parentPath: string): Promise<UploadItem[]> {
  if (entry.isFile) {
    const file = await fileFromEntry(entry as UploadFileSystemFileEntry);
    return [{ file, path: joinUploadPath(parentPath, entry.name) }];
  }

  if (!entry.isDirectory) return [];

  const directory = entry as UploadFileSystemDirectoryEntry;
  const children = await readDirectoryEntries(directory);
  const nestedUploads = await Promise.all(children.map((child) => uploadsFromEntry(child, joinUploadPath(parentPath, directory.name))));
  return nestedUploads.flat();
}

function fileFromEntry(entry: UploadFileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readDirectoryEntries(entry: UploadFileSystemDirectoryEntry): Promise<UploadFileSystemEntry[]> {
  const reader = entry.createReader();
  const entries: UploadFileSystemEntry[] = [];

  while (true) {
    const batch = await new Promise<UploadFileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

function pastedFileName(file: File, index: number): string {
  const extension = extensionFromFile(file);
  const genericNames = new Set(["image.png", "image.jpeg", "image.jpg", "image.gif", "clipboard.png"]);
  if (file.name && !genericNames.has(file.name.toLowerCase())) return file.name;
  const suffix = index === 0 ? "" : `-${index + 1}`;
  return `pasted-${new Date().toISOString().replace(/[:.]/g, "-")}${suffix}${extension}`;
}

function extensionFromFile(file: File): string {
  const existing = file.name.match(/\.[A-Za-z0-9]+$/)?.[0];
  if (existing) return existing;
  if (file.type === "image/jpeg") return ".jpg";
  if (file.type === "image/gif") return ".gif";
  if (file.type === "image/svg+xml") return ".svg";
  if (file.type === "application/pdf") return ".pdf";
  return ".png";
}

function joinUploadPath(parentPath: string, childPath: string): string {
  const cleanParent = parentPath.replace(/^\/+|\/+$/g, "");
  const cleanChild = childPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return cleanParent ? `${cleanParent}/${cleanChild}` : cleanChild;
}
