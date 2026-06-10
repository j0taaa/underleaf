import { RefreshCw } from "lucide-react";
import { api, type CompileJob } from "../../api";
import { Button } from "../ui/button";

export function PdfPreviewPane({
  projectId,
  compileJob,
  pdfNonce,
  onReload
}: {
  projectId: string;
  compileJob: CompileJob | null;
  pdfNonce: number;
  onReload: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-col bg-white">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-medium">PDF Preview</span>
        <Button variant="outline" size="sm" onClick={onReload}>
          <RefreshCw className="h-4 w-4" />
          Reload
        </Button>
      </div>
      {compileJob?.status === "success" ? (
        <iframe className="min-h-0 flex-1" title="PDF Preview" src={api.pdfUrl(projectId, pdfNonce)} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
          <div className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
            Recompile the project to generate a PDF preview.
          </div>
          {compileJob?.status === "error" && (
            <pre className="mt-4 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">
              {compileJob.stderr || compileJob.stdout || "Compilation failed."}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
