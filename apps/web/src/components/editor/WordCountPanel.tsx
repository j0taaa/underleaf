import { BarChart3, RefreshCw, X } from "lucide-react";
import type { ProjectWordCount } from "../../api";
import { Button } from "../ui/button";

export function WordCountPanel({
  count,
  loading,
  onRefresh,
  onClose
}: {
  count: ProjectWordCount | null;
  loading: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const files = count?.files ?? [];

  return (
    <aside className="flex min-h-0 flex-col border-l border-border bg-card">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="h-4 w-4" />
          Word Count
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" title="Refresh word count" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Close word count" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="border-b border-border p-3">
        {loading && !count ? (
          <div className="text-sm text-muted-foreground">Counting words...</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Words" value={count?.words ?? 0} />
            <Metric label="Characters" value={count?.characters ?? 0} />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {files.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
            No LaTeX source words found.
          </div>
        ) : (
          <div className="space-y-1">
            {files.map((file) => (
              <div className="rounded-sm px-2 py-1.5 text-sm hover:bg-muted" key={file.fileId}>
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{file.path}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{file.words}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{file.characters.toLocaleString()} characters</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}
