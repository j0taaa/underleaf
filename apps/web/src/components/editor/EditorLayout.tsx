import type { CompileJob, ProjectFileWithContent } from "../../api";
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
  onContentChange,
  onPdfReload
}: {
  layout: LayoutMode;
  projectId: string;
  activeFile: ProjectFileWithContent | null;
  content: string;
  saveState: SaveState;
  compileJob: CompileJob | null;
  pdfNonce: number;
  onContentChange: (content: string) => void;
  onPdfReload: () => void;
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
      {layout !== "pdf" && (
        <SourceEditorPane activeFile={activeFile} content={content} saveState={saveState} onContentChange={onContentChange} />
      )}
      {layout !== "editor" && (
        <PdfPreviewPane projectId={projectId} compileJob={compileJob} pdfNonce={pdfNonce} onReload={onPdfReload} />
      )}
    </section>
  );
}
