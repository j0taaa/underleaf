import { Download, History, RotateCcw, X } from "lucide-react";
import { api, type ProjectSnapshot } from "../../api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function HistoryPanel({
  projectId,
  snapshots,
  label,
  creating,
  restoringId,
  onLabelChange,
  onCreate,
  onRestore,
  onClose
}: {
  projectId: string;
  snapshots: ProjectSnapshot[];
  label: string;
  creating: boolean;
  restoringId: string | null;
  onLabelChange: (label: string) => void;
  onCreate: () => void;
  onRestore: (snapshot: ProjectSnapshot) => void;
  onClose: () => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-l border-border bg-card">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4" />
          History
        </div>
        <Button variant="ghost" size="icon" title="Close history" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <form
        className="border-b border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <div className="flex gap-2">
          <Input placeholder="Snapshot label" value={label} onChange={(event) => onLabelChange(event.target.value)} />
          <Button type="submit" disabled={creating} size="sm">
            {creating ? "Saving" : "Save"}
          </Button>
        </div>
      </form>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {snapshots.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">No snapshots yet.</div>
        ) : (
          <div className="space-y-2">
            {snapshots.map((snapshot) => (
              <div className="rounded-md border border-border bg-background p-2" key={snapshot.id}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{snapshot.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(snapshot.createdAt).toLocaleString()} · {snapshot.fileCount} {snapshot.fileCount === 1 ? "file" : "files"}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={restoringId === snapshot.id} onClick={() => onRestore(snapshot)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    {restoringId === snapshot.id ? "Restoring" : "Restore"}
                  </Button>
                  <a
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={api.snapshotDownloadUrl(projectId, snapshot.id)}
                    title="Download snapshot"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
