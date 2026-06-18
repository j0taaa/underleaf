import { ChevronLeft, ChevronRight, Download, Minus, Plus, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function PdfPreviewToolbar({
  hasDocument,
  pageNumber,
  totalPages,
  scale,
  pdfUrl,
  onPageChange,
  onScaleChange,
  onReload
}: {
  hasDocument: boolean;
  pageNumber: number;
  totalPages: number;
  scale: number;
  pdfUrl: string;
  onPageChange: (pageNumber: number) => void;
  onScaleChange: (scale: number) => void;
  onReload: () => void;
}) {
  const visiblePage = clampPage(pageNumber, totalPages);

  return (
    <div className="flex items-center gap-1">
      {hasDocument && (
        <>
          <Button
            variant="ghost"
            size="icon"
            title="Previous page"
            disabled={visiblePage <= 1}
            onClick={() => onPageChange(visiblePage - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <Input
              className="h-8 w-14 px-2 text-center"
              aria-label="PDF page"
              min={1}
              max={totalPages}
              type="number"
              value={visiblePage}
              onChange={(event) => onPageChange(Number(event.target.value))}
            />
            <span className="whitespace-nowrap">/ {totalPages}</span>
          </label>
          <Button
            variant="ghost"
            size="icon"
            title="Next page"
            disabled={visiblePage >= totalPages}
            onClick={() => onPageChange(visiblePage + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Zoom out" onClick={() => onScaleChange(clampScale(scale - 0.15))}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="hidden min-w-10 text-center text-xs text-muted-foreground sm:inline">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" title="Zoom in" onClick={() => onScaleChange(clampScale(scale + 0.15))}>
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
  );
}

function clampPage(pageNumber: number, totalPages: number): number {
  if (!Number.isFinite(pageNumber)) return 1;
  return Math.min(Math.max(1, Math.round(pageNumber)), Math.max(totalPages, 1));
}

function clampScale(scale: number): number {
  return Math.min(2.4, Math.max(0.6, scale));
}
