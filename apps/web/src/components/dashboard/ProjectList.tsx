import { Copy, Download, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { api, type Project } from "../../api";
import { Button } from "../ui/button";

export function ProjectList({
  projects,
  loading,
  duplicatingProjectId,
  onDuplicate,
  onDelete
}: {
  projects: Project[];
  loading: boolean;
  duplicatingProjectId?: string | null;
  onDuplicate: (projectId: string) => Promise<void>;
  onDelete: (projectId: string) => Promise<void>;
}) {
  return (
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
              <Link className="min-w-0 flex-1 text-left" to="/projects/$projectId" params={{ projectId: project.id }}>
                <div className="truncate text-sm font-medium">{project.name}</div>
                <div className="text-xs text-muted-foreground">Updated {new Date(project.updatedAt).toLocaleString()}</div>
              </Link>
              <a
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={api.projectDownloadUrl(project.id)}
                download
                title="Download project"
              >
                <Download className="h-4 w-4" />
              </a>
              <Button
                variant="ghost"
                size="icon"
                title="Duplicate project"
                disabled={duplicatingProjectId === project.id}
                onClick={() => void onDuplicate(project.id)}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" title="Delete project" onClick={() => void onDelete(project.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
