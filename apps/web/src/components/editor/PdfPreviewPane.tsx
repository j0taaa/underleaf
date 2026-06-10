import { ChevronLeft, ChevronRight, Download, Minus, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { api, type CompileDiagnostic, type CompileJob } from "../../api";
import { Button } from "../ui/button";
import { CompileDiagnosticsPanel } from "./CompileDiagnosticsPanel";
import { PdfPageCanvas } from "./PdfPageCanvas";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();

export function PdfPreviewPane({
  projectId,
  compileJob,
  pdfNonce,
  onReload,
  onSourceLocated,
  onDiagnosticSelected
}: {
  projectId: string;
  compileJob: CompileJob | null;
  pdfNonce: number;
  onReload: () => void;
  onSourceLocated: (location: { fileId: string; line: number; column: number }) => void;
  onDiagnosticSelected: (diagnostic: CompileDiagnostic) => void;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(0.75);

  const pdfUrl = useMemo(() => api.pdfUrl(projectId, pdfNonce), [pdfNonce, projectId]);

  useEffect(() => {
    if (compileJob?.status !== "success") {
      setDocument(null);
      setPageNumber(1);
      return;
    }

    let cancelled = false;
    const loadingTask = pdfjs.getDocument({ url: pdfUrl });
    setLoading(true);
    setError(null);

    loadingTask.promise
      .then((pdfDocument) => {
        if (cancelled) {
          return;
        }
        setDocument(pdfDocument);
        setPageNumber(1);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load PDF");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
  }, [compileJob?.status, pdfUrl]);

  const totalPages = document?.numPages ?? 0;
  const visiblePage = Math.min(pageNumber, Math.max(totalPages, 1));

  const locateSource = async (input: { page: number; x: number; y: number; text?: string }) => {
    setSourceStatus("Finding source...");
    try {
      const location = await api.locatePdfSource(projectId, input);
      if (!location) {
        setSourceStatus("No source match found");
        return;
      }
      onSourceLocated(location);
      setSourceStatus(`${location.path}:${location.line}`);
    } catch (err) {
      setSourceStatus(err instanceof Error ? err.message : "Source lookup failed");
    }
  };

  return (
    <div className="flex min-h-0 flex-col bg-[#e9edf2]">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-white px-3">
        <div className="min-w-0">
          <span className="text-sm font-medium">PDF Preview</span>
          {sourceStatus && <span className="ml-2 hidden truncate text-xs text-muted-foreground sm:inline">{sourceStatus}</span>}
        </div>
        <div className="flex items-center gap-1">
          {document && (
            <>
              <Button
                variant="ghost"
                size="icon"
                title="Previous page"
                disabled={visiblePage <= 1}
                onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-14 text-center text-xs text-muted-foreground">
                {visiblePage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                title="Next page"
                disabled={visiblePage >= totalPages}
                onClick={() => setPageNumber((current) => Math.min(totalPages, current + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" title="Zoom out" onClick={() => setScale((current) => Math.max(0.6, current - 0.15))}>
                <Minus className="h-4 w-4" />
              </Button>
              <span className="hidden min-w-10 text-center text-xs text-muted-foreground sm:inline">{Math.round(scale * 100)}%</span>
              <Button variant="ghost" size="icon" title="Zoom in" onClick={() => setScale((current) => Math.min(2.4, current + 0.15))}>
                <Plus className="h-4 w-4" />
              </Button>
              <a
                className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={pdfUrl}
                download
                title="Download PDF"
              >
                <Download className="h-4 w-4" />
              </a>
            </>
          )}
          <Button variant="outline" size="sm" onClick={onReload}>
            <RefreshCw className="h-4 w-4" />
            Reload
          </Button>
        </div>
      </div>
      {compileJob?.status === "success" ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {compileJob.diagnostics.length > 0 && <CompileDiagnosticsPanel compileJob={compileJob} onDiagnosticSelected={onDiagnosticSelected} />}
          {loading && <div className="rounded-md border border-border bg-white p-4 text-sm text-muted-foreground">Loading PDF...</div>}
          {error && <div className="rounded-md bg-destructive p-4 text-sm text-destructive-foreground">{error}</div>}
          {document && !loading && (
            <div className="mx-auto mt-4 flex w-fit min-w-0 flex-col items-center first:mt-0">
              <PdfPageCanvas document={document} pageNumber={visiblePage} scale={scale} onSourceRequest={(input) => void locateSource(input)} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
          <div className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
            Recompile the project to generate a PDF preview.
          </div>
          {compileJob?.status === "error" && (
            <CompileDiagnosticsPanel compileJob={compileJob} onDiagnosticSelected={onDiagnosticSelected} />
          )}
        </div>
      )}
    </div>
  );
}
