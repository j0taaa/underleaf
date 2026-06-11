import type { CompileDiagnostic, CompileJob, ProjectFileWithContent, ProjectSymbols } from "../../api";
import type { LayoutMode, SaveState } from "../../types/editor";
import { cn } from "../../lib/utils";
import { PdfPreviewPane } from "./PdfPreviewPane";
import { SourceEditorPane } from "./SourceEditorPane";

export function EditorLayout({
  layout,
  projectId,
  activeFile,
  content,
  saveState,
  compileJob,
  pdfNonce,
  sourceTarget,
  symbols,
  onContentChange,
  onPdfReload,
  onPdfSourceLocated,
  onDiagnosticSelected
}: {
  layout: LayoutMode;
  projectId: string;
  activeFile: ProjectFileWithContent | null;
  content: string;
  saveState: SaveState;
  compileJob: CompileJob | null;
  pdfNonce: number;
  sourceTarget: { line: number; column: number; nonce: number } | null;
  symbols: ProjectSymbols | null;
  onContentChange: (content: string) => void;
  onPdfReload: () => void;
  onPdfSourceLocated: (location: { fileId: string; line: number; column: number }) => void;
  onDiagnosticSelected: (diagnostic: CompileDiagnostic) => void;
}) {
  return (
    <section
      className={cn(
        "grid min-h-0",
        layout === "split" && "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,45%)]",
        layout === "editor" && "grid-cols-1",
        layout === "pdf" && "grid-cols-1"
      )}
    >
      {layout !== "pdf" && <SourceEditorPane activeFile={activeFile} content={content} saveState={saveState} sourceTarget={sourceTarget} symbols={symbols} onContentChange={onContentChange} />}
      {layout !== "editor" && (
        <PdfPreviewPane
          projectId={projectId}
          compileJob={compileJob}
          pdfNonce={pdfNonce}
          onReload={onPdfReload}
          onSourceLocated={onPdfSourceLocated}
          onDiagnosticSelected={onDiagnosticSelected}
        />
      )}
    </section>
  );
}
