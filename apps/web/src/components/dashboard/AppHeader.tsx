import { FileText, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";

export function AppHeader({ onRefresh }: { onRefresh: () => void }) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Underleaf</h1>
            <p className="text-xs text-muted-foreground">Self-hosted LaTeX projects</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>
    </header>
  );
}
