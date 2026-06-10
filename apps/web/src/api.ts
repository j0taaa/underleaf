export type Project = {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectFile = {
  id: string;
  projectId: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectFileWithContent = ProjectFile & {
  content: string;
};

export type CompileJob = {
  id: string;
  projectId: string;
  status: "queued" | "running" | "success" | "error";
  stdout: string;
  stderr: string;
  pdfPath: string | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
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
  listProjects() {
    return request<Project[]>("/api/projects");
  },
  createProject(input: { name: string; template: string }) {
    return request<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input)
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
  deleteProject(projectId: string) {
    return request<void>(`/api/projects/${projectId}`, { method: "DELETE" });
  },
  listFiles(projectId: string) {
    return request<ProjectFile[]>(`/api/projects/${projectId}/files`);
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
  deleteFile(projectId: string, fileId: string) {
    return request<void>(`/api/projects/${projectId}/files/${fileId}`, { method: "DELETE" });
  },
  compile(projectId: string) {
    return request<CompileJob>(`/api/projects/${projectId}/compile`, { method: "POST" });
  },
  latestCompile(projectId: string) {
    return request<CompileJob | null>(`/api/projects/${projectId}/compile/latest`);
  }
};
