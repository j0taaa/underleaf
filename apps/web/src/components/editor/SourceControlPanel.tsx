import { GitBranch, GitCommitHorizontal, RefreshCw, X } from "lucide-react";
import type { GitStatus } from "../../api";
import { Button } from "../ui/button";

export function SourceControlPanel({
  status,
  loading,
  initializing,
  committing,
  commitMessage,
  onCommitMessageChange,
  onInit,
  onCommit,
  onRefresh,
  onClose
}: {
  status: GitStatus | null;
  loading: boolean;
  initializing: boolean;
  committing: boolean;
  commitMessage: string;
  onCommitMessageChange: (message: string) => void;
  onInit: () => void;
  onCommit: () => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-l border-border bg-card">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <GitBranch className="h-4 w-4" />
          Source Control
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" title="Refresh source control" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Close source control" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="border-b border-border p-3">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading repository...</div>
        ) : !status?.initialized ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">Initialize a local Git repository for this project.</p>
            <Button disabled={initializing} onClick={onInit}>
              <GitBranch className="h-4 w-4" />
              {initializing ? "Initializing" : "Initialize Repository"}
            </Button>
          </div>
        ) : (
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Branch</span>
              <span className="truncate font-medium">{status.branch ?? "HEAD"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Changes</span>
              <span className="font-medium">{status.entries.length}</span>
            </div>
            {status.lastCommit && (
              <div className="min-w-0 rounded-md border border-border bg-background p-2 text-xs">
                <div className="font-medium">{status.lastCommit.hash}</div>
                <div className="truncate text-muted-foreground">{status.lastCommit.subject}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {status?.initialized && (
        <form
          className="border-b border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            onCommit();
          }}
        >
          <div className="grid gap-2">
            <textarea
              className="min-h-20 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Commit message"
              value={commitMessage}
              onChange={(event) => onCommitMessageChange(event.target.value)}
            />
            <Button type="submit" disabled={!status.hasChanges || !commitMessage.trim() || committing}>
              <GitCommitHorizontal className="h-4 w-4" />
              {committing ? "Committing" : "Commit Changes"}
            </Button>
          </div>
        </form>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {status?.initialized ? (
          status.entries.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">Working tree clean.</div>
          ) : (
            <div className="space-y-1">
              {status.entries.map((entry) => (
                <div className="flex items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-muted" key={`${entry.status}:${entry.path}`}>
                  <span className="flex h-5 w-6 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
                    {entry.status}
                  </span>
                  <span className="min-w-0 truncate">{entry.path}</span>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">No repository yet.</div>
        )}
      </div>
    </aside>
  );
}
