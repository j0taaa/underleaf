import Editor from "@monaco-editor/react";
import { Save } from "lucide-react";
import type { ProjectFileWithContent } from "../../api";
import type { SaveState } from "../../types/editor";
import { registerLatexLanguage } from "../../lib/monacoLatex";
import { cn } from "../../lib/utils";

export function SourceEditorPane({
  activeFile,
  content,
  saveState,
  onContentChange
}: {
  activeFile: ProjectFileWithContent | null;
  content: string;
  saveState: SaveState;
  onContentChange: (content: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col border-r border-border bg-[#1f2430]">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-700 px-3 text-xs text-slate-300">
        <span>{activeFile?.path ?? "Select a file"}</span>
        <span className={cn(saveState === "error" ? "text-red-300" : "text-slate-400")}>
          {saveState === "saving" && "Saving..."}
          {saveState === "saved" && (
            <span className="inline-flex items-center gap-1">
              <Save className="h-3 w-3" />
              Saved
            </span>
          )}
          {saveState === "error" && "Save failed"}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          language="latex"
          theme="underleaf-dark"
          value={content}
          beforeMount={registerLatexLanguage}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true
          }}
          onChange={(value) => onContentChange(value ?? "")}
        />
      </div>
    </div>
  );
}
