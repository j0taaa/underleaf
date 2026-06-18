import Editor, { type OnMount } from "@monaco-editor/react";
import type { Monaco } from "@monaco-editor/react";
import { Save } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ProjectFile, ProjectFileWithContent, ProjectSymbols } from "../../api";
import type { SaveState } from "../../types/editor";
import { buildLatexCompletions, type LatexCompletion } from "../../lib/latexCompletions";
import { isEditableTextFile } from "../../lib/fileTypes";
import { registerLatexLanguage } from "../../lib/monacoLatex";
import { cn } from "../../lib/utils";
import { AssetPreviewPane } from "./AssetPreviewPane";
import { OpenFileTabs } from "./OpenFileTabs";

type MonacoPosition = { lineNumber: number; column: number };
type MonacoRange = { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
type CompletionModel = {
  getWordUntilPosition: (position: MonacoPosition) => { startColumn: number; endColumn: number };
  getValueInRange: (range: MonacoRange) => string;
};

export function SourceEditorPane({
  activeFile,
  files,
  openFileIds,
  dirtyFileId,
  content,
  saveState,
  sourceTarget,
  symbols,
  onContentChange,
  onOpenTab,
  onCloseTab
}: {
  activeFile: ProjectFileWithContent | null;
  files: ProjectFile[];
  openFileIds: string[];
  dirtyFileId: string | null;
  content: string;
  saveState: SaveState;
  sourceTarget: { line: number; column: number; nonce: number } | null;
  symbols: ProjectSymbols | null;
  onContentChange: (content: string) => void;
  onOpenTab: (file: ProjectFile) => void;
  onCloseTab: (fileId: string) => void;
}) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const completionProviderRef = useRef<{ dispose: () => void } | null>(null);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;

    completionProviderRef.current?.dispose();
    completionProviderRef.current = registerProjectCompletionProvider(monaco, files, symbols);

    return () => {
      completionProviderRef.current?.dispose();
      completionProviderRef.current = null;
    };
  }, [files, symbols]);

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
      <OpenFileTabs
        files={files}
        activeFile={activeFile}
        openFileIds={openFileIds}
        dirtyFileId={dirtyFileId}
        onOpen={onOpenTab}
        onClose={onCloseTab}
      />
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-slate-700 px-3 text-xs text-slate-300">
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
        {activeFile && !isEditableTextFile(activeFile.path) ? (
          <AssetPreviewPane projectId={activeFile.projectId} file={activeFile} />
        ) : (
          <Editor
            height="100%"
            language="latex"
            theme="underleaf-dark"
            value={content}
            beforeMount={registerLatexLanguage}
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              monacoRef.current = monaco;
              completionProviderRef.current?.dispose();
              completionProviderRef.current = registerProjectCompletionProvider(monaco, files, symbols);
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
        )}
      </div>
    </div>
  );
}

function registerProjectCompletionProvider(monaco: Monaco, files: ProjectFile[], symbols: ProjectSymbols | null) {
  return monaco.languages.registerCompletionItemProvider("latex", {
    triggerCharacters: ["\\", "{", ","],
    provideCompletionItems(model: CompletionModel, position: MonacoPosition) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };
      const linePrefix = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });

      const suggestions = buildLatexCompletions({ linePrefix, files, symbols }).map((completion) => toMonacoCompletion(monaco, range, completion));

      return { suggestions };
    }
  });
}

function toMonacoCompletion(monaco: Monaco, range: MonacoRange, completion: LatexCompletion) {
  return {
    label: completion.label,
    kind: completionKind(monaco, completion.kind),
    insertText: completion.insertText,
    insertTextRules: completion.insertAsSnippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
    detail: completion.detail,
    documentation: completion.documentation,
    range
  };
}

function completionKind(monaco: Monaco, kind: LatexCompletion["kind"]) {
  if (kind === "snippet") return monaco.languages.CompletionItemKind.Snippet;
  if (kind === "file") return monaco.languages.CompletionItemKind.File;
  return monaco.languages.CompletionItemKind.Reference;
}
