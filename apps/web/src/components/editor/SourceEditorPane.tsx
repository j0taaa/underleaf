import Editor, { type OnMount } from "@monaco-editor/react";
import type { Monaco } from "@monaco-editor/react";
import { Save } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ProjectFileWithContent, ProjectSymbols } from "../../api";
import type { SaveState } from "../../types/editor";
import { registerLatexLanguage } from "../../lib/monacoLatex";
import { cn } from "../../lib/utils";

type MonacoPosition = { lineNumber: number; column: number };
type MonacoRange = { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
type CompletionModel = {
  getWordUntilPosition: (position: MonacoPosition) => { startColumn: number; endColumn: number };
  getValueInRange: (range: MonacoRange) => string;
};

export function SourceEditorPane({
  activeFile,
  content,
  saveState,
  sourceTarget,
  symbols,
  onContentChange
}: {
  activeFile: ProjectFileWithContent | null;
  content: string;
  saveState: SaveState;
  sourceTarget: { line: number; column: number; nonce: number } | null;
  symbols: ProjectSymbols | null;
  onContentChange: (content: string) => void;
}) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const completionProviderRef = useRef<{ dispose: () => void } | null>(null);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;

    completionProviderRef.current?.dispose();
    completionProviderRef.current = registerProjectCompletionProvider(monaco, symbols);

    return () => {
      completionProviderRef.current?.dispose();
      completionProviderRef.current = null;
    };
  }, [symbols]);

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
          onMount={(editor, monaco) => {
            editorRef.current = editor;
            monacoRef.current = monaco;
            completionProviderRef.current?.dispose();
            completionProviderRef.current = registerProjectCompletionProvider(monaco, symbols);
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

function registerProjectCompletionProvider(monaco: Monaco, symbols: ProjectSymbols | null) {
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

      const suggestions = [
        ...latexCommandSuggestions(monaco, range, linePrefix),
        ...symbolSuggestions(monaco, range, linePrefix, symbols)
      ];

      return { suggestions };
    }
  });
}

function latexCommandSuggestions(monaco: Monaco, range: MonacoRange, linePrefix: string) {
  if (!/\\[A-Za-z]*$/.test(linePrefix)) return [];

  return LATEX_COMMANDS.map((command) => ({
    label: command.label,
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: command.insertText,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: command.detail,
    documentation: command.documentation,
    range
  }));
}

function symbolSuggestions(monaco: Monaco, range: MonacoRange, linePrefix: string, symbols: ProjectSymbols | null) {
  if (isReferenceContext(linePrefix)) {
    return (symbols?.labels ?? []).map((label) => ({
      label: label.key,
      kind: monaco.languages.CompletionItemKind.Reference,
      insertText: label.key,
      detail: label.path,
      documentation: `Line ${label.line}`,
      range
    }));
  }

  if (isCitationContext(linePrefix)) {
    return (symbols?.citations ?? []).map((citation) => ({
      label: citation.key,
      kind: monaco.languages.CompletionItemKind.Reference,
      insertText: citation.key,
      detail: citation.path,
      documentation: `Line ${citation.line}`,
      range
    }));
  }

  return [];
}

function isReferenceContext(linePrefix: string): boolean {
  return /\\(?:ref|eqref|pageref|autoref|cref|Cref)\*?(?:\[[^\]]*])?\{[^{}]*$/.test(linePrefix);
}

function isCitationContext(linePrefix: string): boolean {
  return /\\cite[A-Za-z*]*(?:\[[^\]]*]){0,2}\{[^{}]*$/.test(linePrefix);
}

const LATEX_COMMANDS = [
  { label: "\\section", insertText: "\\section{${1:title}}", detail: "Section", documentation: "Insert a section heading." },
  { label: "\\subsection", insertText: "\\subsection{${1:title}}", detail: "Subsection", documentation: "Insert a subsection heading." },
  { label: "\\subsubsection", insertText: "\\subsubsection{${1:title}}", detail: "Subsubsection", documentation: "Insert a subsubsection heading." },
  { label: "\\paragraph", insertText: "\\paragraph{${1:title}}", detail: "Paragraph", documentation: "Insert a paragraph heading." },
  { label: "\\label", insertText: "\\label{${1:key}}", detail: "Label", documentation: "Define a cross-reference label." },
  { label: "\\ref", insertText: "\\ref{${1:key}}", detail: "Reference", documentation: "Reference a label." },
  { label: "\\eqref", insertText: "\\eqref{${1:key}}", detail: "Equation reference", documentation: "Reference an equation label." },
  { label: "\\cite", insertText: "\\cite{${1:key}}", detail: "Citation", documentation: "Insert a citation." },
  { label: "\\begin", insertText: "\\begin{${1:environment}}\n\t${0}\n\\end{$1}", detail: "Environment", documentation: "Insert a LaTeX environment." },
  { label: "\\item", insertText: "\\item ${1:text}", detail: "List item", documentation: "Insert a list item." },
  { label: "\\textbf", insertText: "\\textbf{${1:text}}", detail: "Bold text", documentation: "Bold inline text." },
  { label: "\\emph", insertText: "\\emph{${1:text}}", detail: "Emphasis", documentation: "Emphasize inline text." },
  { label: "\\includegraphics", insertText: "\\includegraphics[width=${1:0.8}\\textwidth]{${2:path}}", detail: "Graphic", documentation: "Insert an image." },
  { label: "\\caption", insertText: "\\caption{${1:text}}", detail: "Caption", documentation: "Insert a figure or table caption." }
];
