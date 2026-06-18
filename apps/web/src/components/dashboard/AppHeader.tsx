import { FileText, LogOut, RefreshCw, User } from "lucide-react";
import { Button } from "../ui/button";

export function AppHeader({ email, onRefresh, onSignOut }: { email: string; onRefresh: () => void; onSignOut: () => void }) {
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
        <div className="flex items-center gap-2">
          <div className="hidden max-w-52 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground sm:flex">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{email}</span>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button aria-label="Sign out" variant="ghost" size="icon" onClick={onSignOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
