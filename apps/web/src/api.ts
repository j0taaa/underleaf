export type Project = {
  id: string;
  ownerId: string;
  name: string;
  rootFilePath: string | null;
  compileEngine: CompileEngine;
  autoCompile: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CompileEngine = "pdflatex" | "xelatex" | "lualatex";

export type ProjectFile = {
  id: string;
  projectId: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectFolder = {
  id: string;
  projectId: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectFileWithContent = ProjectFile & {
  content: string;
};

export type ProjectSearchResult = {
  fileId: string;
  path: string;
  line: number;
  column: number;
  preview: string;
};

export type ProjectOutlineItem = {
  fileId: string;
  path: string;
  line: number;
  column: number;
  level: number;
  kind: string;
  title: string;
};

export type ProjectWordCount = {
  words: number;
  characters: number;
  files: Array<{ fileId: string; path: string; words: number; characters: number }>;
};

export type ProjectSymbols = {
  labels: Array<{ key: string; fileId: string; path: string; line: number }>;
  citations: Array<{ key: string; fileId: string; path: string; line: number }>;
};

export type GitStatus = {
  initialized: boolean;
  branch: string | null;
  lastCommit: { hash: string; subject: string; committedAt: string } | null;
  hasChanges: boolean;
  entries: Array<{ path: string; status: string }>;
};

export type CompileJob = {
  id: string;
  projectId: string;
  status: "queued" | "running" | "success" | "error";
  stdout: string;
  stderr: string;
  pdfPath: string | null;
  durationMs: number | null;
  diagnostics: CompileDiagnostic[];
  createdAt: string;
  updatedAt: string;
};

export type CompileDiagnostic = {
  severity: "error" | "warning";
  filePath: string | null;
  line: number | null;
  column: number | null;
  message: string;
  raw: string;
};

export type PdfSourceLocation = {
  fileId: string;
  path: string;
  line: number;
  column: number;
  source: "synctex" | "text";
};

export type ProjectSnapshot = {
  id: string;
  projectId: string;
  label: string;
  fileCount: number;
  createdAt: string;
};

export type ProjectSnapshotDetail = ProjectSnapshot & {
  files: Array<{ path: string; size: number }>;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.PROD ? "" : "http://localhost:3001");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message ?? response.statusText);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  pdfUrl(projectId: string, nonce: number) {
    return `${API_BASE}/api/projects/${projectId}/pdf?t=${nonce}`;
  },
  fileRawUrl(projectId: string, fileId: string) {
    return `${API_BASE}/api/projects/${projectId}/files/${fileId}/raw`;
  },
  snapshotDownloadUrl(projectId: string, snapshotId: string) {
    return `${API_BASE}/api/projects/${projectId}/snapshots/${snapshotId}/download`;
  },
  projectDownloadUrl(projectId: string) {
    return `${API_BASE}/api/projects/${projectId}/download`;
  },
  listProjects() {
    return request<Project[]>("/api/projects");
  },
  createProject(input: { name: string; template: string }) {
    return request<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  duplicateProject(projectId: string) {
    return request<Project>(`/api/projects/${projectId}/duplicate`, { method: "POST" });
  },
  importProject(input: { file: File; name?: string }) {
    const formData = new FormData();
    formData.append("file", input.file, input.file.name);
    const query = input.name?.trim() ? `?name=${encodeURIComponent(input.name.trim())}` : "";
    return request<Project>(`/api/projects/import${query}`, {
      method: "POST",
      body: formData
    });
  },
  getProject(projectId: string) {
    return request<Project>(`/api/projects/${projectId}`);
  },
  updateProject(projectId: string, name: string) {
    return request<Project>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ name })
    });
  },
  updateProjectRootFile(projectId: string, rootFilePath: string | null) {
    return request<Project>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ rootFilePath })
    });
  },
  updateProjectCompileEngine(projectId: string, compileEngine: CompileEngine) {
    return request<Project>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ compileEngine })
    });
  },
  updateProjectAutoCompile(projectId: string, autoCompile: boolean) {
    return request<Project>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ autoCompile })
    });
  },
  deleteProject(projectId: string) {
    return request<void>(`/api/projects/${projectId}`, { method: "DELETE" });
  },
  listFiles(projectId: string) {
    return request<ProjectFile[]>(`/api/projects/${projectId}/files`);
  },
  listFolders(projectId: string) {
    return request<ProjectFolder[]>(`/api/projects/${projectId}/folders`);
  },
  searchProject(projectId: string, query: string) {
    return request<ProjectSearchResult[]>(`/api/projects/${projectId}/search?q=${encodeURIComponent(query)}`);
  },
  outlineProject(projectId: string) {
    return request<ProjectOutlineItem[]>(`/api/projects/${projectId}/outline`);
  },
  wordCount(projectId: string) {
    return request<ProjectWordCount>(`/api/projects/${projectId}/word-count`);
  },
  symbols(projectId: string) {
    return request<ProjectSymbols>(`/api/projects/${projectId}/symbols`);
  },
  gitStatus(projectId: string) {
    return request<GitStatus>(`/api/projects/${projectId}/git/status`);
  },
  initGit(projectId: string) {
    return request<GitStatus>(`/api/projects/${projectId}/git/init`, { method: "POST" });
  },
  commitGit(projectId: string, message: string) {
    return request<GitStatus>(`/api/projects/${projectId}/git/commit`, {
      method: "POST",
      body: JSON.stringify({ message })
    });
  },
  listSnapshots(projectId: string) {
    return request<ProjectSnapshot[]>(`/api/projects/${projectId}/snapshots`);
  },
  createSnapshot(projectId: string, label: string) {
    return request<ProjectSnapshot>(`/api/projects/${projectId}/snapshots`, {
      method: "POST",
      body: JSON.stringify({ label })
    });
  },
  getSnapshot(projectId: string, snapshotId: string) {
    return request<ProjectSnapshotDetail>(`/api/projects/${projectId}/snapshots/${snapshotId}`);
  },
  restoreSnapshot(projectId: string, snapshotId: string) {
    return request<{ ok: true }>(`/api/projects/${projectId}/snapshots/${snapshotId}/restore`, { method: "POST" });
  },
  getFile(projectId: string, fileId: string) {
    return request<ProjectFileWithContent>(`/api/projects/${projectId}/files/${fileId}`);
  },
  saveFile(projectId: string, fileId: string, content: string) {
    return request<ProjectFileWithContent>(`/api/projects/${projectId}/files/${fileId}/content`, {
      method: "PUT",
      body: JSON.stringify({ content })
    });
  },
  createFile(projectId: string, path: string) {
    return request<ProjectFile>(`/api/projects/${projectId}/files`, {
      method: "POST",
      body: JSON.stringify({ path, content: "" })
    });
  },
  uploadFiles(projectId: string, uploads: Array<{ file: File; path: string }>) {
    const formData = new FormData();
    uploads.forEach((upload, index) => {
      formData.append(`path-${index}`, upload.path);
      formData.append(`file-${index}`, upload.file, upload.file.name);
    });
    return request<ProjectFile[]>(`/api/projects/${projectId}/files/upload`, {
      method: "POST",
      body: formData
    });
  },
  renameFile(projectId: string, fileId: string, path: string) {
    return request<ProjectFile>(`/api/projects/${projectId}/files/${fileId}`, {
      method: "PATCH",
      body: JSON.stringify({ path })
    });
  },
  deleteFile(projectId: string, fileId: string) {
    return request<void>(`/api/projects/${projectId}/files/${fileId}`, { method: "DELETE" });
  },
  createFolder(projectId: string, path: string) {
    return request<ProjectFolder>(`/api/projects/${projectId}/folders`, {
      method: "POST",
      body: JSON.stringify({ path })
    });
  },
  renameFolder(projectId: string, folderId: string, path: string) {
    return request<ProjectFolder>(`/api/projects/${projectId}/folders/${folderId}`, {
      method: "PATCH",
      body: JSON.stringify({ path })
    });
  },
  deleteFolder(projectId: string, folderId: string) {
    return request<void>(`/api/projects/${projectId}/folders/${folderId}`, { method: "DELETE" });
  },
  compile(projectId: string) {
    return request<CompileJob>(`/api/projects/${projectId}/compile`, { method: "POST" });
  },
  latestCompile(projectId: string) {
    return request<CompileJob | null>(`/api/projects/${projectId}/compile/latest`);
  },
  locatePdfSource(projectId: string, input: { page: number; x: number; y: number; text?: string }) {
    return request<PdfSourceLocation | null>(`/api/projects/${projectId}/pdf/source`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }
};
