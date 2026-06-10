import { AlertCircle, AlertTriangle } from "lucide-react";
import type { CompileDiagnostic, CompileJob } from "../../api";
import { cn } from "../../lib/utils";

export function CompileDiagnosticsPanel({
  compileJob,
  onDiagnosticSelected
}: {
  compileJob: CompileJob;
  onDiagnosticSelected: (diagnostic: CompileDiagnostic) => void;
}) {
  const diagnostics = compileJob.diagnostics ?? [];
  const logs = compileJob.stderr || compileJob.stdout || "Compilation failed.";

  return (
    <div className="mt-4 space-y-3">
      {diagnostics.length > 0 && (
        <div className="rounded-md border border-border bg-white">
          <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Compiler Diagnostics
          </div>
          <div className="max-h-64 overflow-auto">
            {diagnostics.map((diagnostic, index) => (
              <button
                key={`${diagnostic.severity}-${diagnostic.filePath ?? "project"}-${diagnostic.line ?? "?"}-${index}`}
                type="button"
                className="flex w-full gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onDiagnosticSelected(diagnostic)}
              >
                {diagnostic.severity === "error" ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-xs font-medium", diagnostic.severity === "error" ? "text-destructive" : "text-amber-700")}>
                    {diagnostic.filePath ?? "project"}
                    {diagnostic.line ? `:${diagnostic.line}` : ""}
                  </span>
                  <span className="mt-0.5 block break-words text-sm text-foreground">{diagnostic.message}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <details className="rounded-md border border-slate-800 bg-slate-950 text-xs text-slate-100" open={diagnostics.length === 0}>
        <summary className="cursor-pointer px-4 py-3 font-medium text-slate-200">Raw compiler log</summary>
        <pre className="max-h-72 overflow-auto border-t border-slate-800 p-4">{logs}</pre>
      </details>
    </div>
  );
}
