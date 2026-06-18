import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { api, type CompileDiagnostic, type CompileJob } from "../../api";
import { CompileDiagnosticsPanel } from "./CompileDiagnosticsPanel";
import { PdfPageCanvas } from "./PdfPageCanvas";
import { PdfPreviewToolbar } from "./PdfPreviewToolbar";

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
  const pageRefs = useRef(new Map<number, HTMLDivElement | null>());

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
  const pageNumbers = useMemo(() => Array.from({ length: totalPages }, (_, index) => index + 1), [totalPages]);

  const goToPage = (nextPageNumber: number) => {
    const clampedPage = clampPage(nextPageNumber, totalPages);
    setPageNumber(clampedPage);
    window.requestAnimationFrame(() => {
      pageRefs.current.get(clampedPage)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };

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
        <PdfPreviewToolbar
          hasDocument={Boolean(document)}
          pageNumber={visiblePage}
          totalPages={totalPages}
          scale={scale}
          pdfUrl={pdfUrl}
          onPageChange={goToPage}
          onScaleChange={setScale}
          onReload={onReload}
        />
      </div>
      {compileJob?.status === "success" ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {compileJob.diagnostics.length > 0 && <CompileDiagnosticsPanel compileJob={compileJob} onDiagnosticSelected={onDiagnosticSelected} />}
          {loading && <div className="rounded-md border border-border bg-white p-4 text-sm text-muted-foreground">Loading PDF...</div>}
          {error && <div className="rounded-md bg-destructive p-4 text-sm text-destructive-foreground">{error}</div>}
          {document && !loading && (
            <div className="mx-auto mt-4 flex w-fit min-w-0 flex-col items-center gap-5 first:mt-0">
              {pageNumbers.map((page) => (
                <div
                  key={page}
                  ref={(element) => {
                    pageRefs.current.set(page, element);
                  }}
                >
                  <PdfPageCanvas document={document} pageNumber={page} scale={scale} onSourceRequest={(input) => void locateSource(input)} />
                </div>
              ))}
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

function clampPage(pageNumber: number, totalPages: number): number {
  if (!Number.isFinite(pageNumber)) return 1;
  return Math.min(Math.max(1, Math.round(pageNumber)), Math.max(totalPages, 1));
}
