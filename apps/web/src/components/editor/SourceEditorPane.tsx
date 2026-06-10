import Editor, { type OnMount } from "@monaco-editor/react";
import { Save } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ProjectFileWithContent } from "../../api";
import type { SaveState } from "../../types/editor";
import { registerLatexLanguage } from "../../lib/monacoLatex";
import { cn } from "../../lib/utils";

export function SourceEditorPane({
  activeFile,
  content,
  saveState,
  sourceTarget,
  onContentChange
}: {
  activeFile: ProjectFileWithContent | null;
  content: string;
  saveState: SaveState;
  sourceTarget: { line: number; column: number; nonce: number } | null;
  onContentChange: (content: string) => void;
}) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const decorationsRef = useRef<string[]>([]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !sourceTarget) return;

    const lineNumber = Math.max(1, sourceTarget.line);
    const column = Math.max(1, sourceTarget.column);
    editor.setPosition({ lineNumber, column });
    editor.revealLineInCenter(lineNumber);
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
      {
        range: {
          startLineNumber: lineNumber,
          startColumn: 1,
          endLineNumber: lineNumber,
          endColumn: 1
        },
        options: {
          isWholeLine: true,
          className: "underleaf-source-hit"
        }
      }
    ]);
    editor.focus();

    window.setTimeout(() => {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
    }, 1800);
  }, [activeFile?.id, sourceTarget]);

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
          onMount={(editor) => {
            editorRef.current = editor;
          }}
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
