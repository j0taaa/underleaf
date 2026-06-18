import type { ProjectFile, ProjectSymbols } from "../api";

export type LatexCompletion = {
  label: string;
  kind: "snippet" | "reference" | "file";
  insertText: string;
  insertAsSnippet?: boolean;
  detail?: string;
  documentation?: string;
};

export function buildLatexCompletions(input: { linePrefix: string; files: ProjectFile[]; symbols: ProjectSymbols | null }): LatexCompletion[] {
  return [
    ...latexCommandSuggestions(input.linePrefix),
    ...symbolSuggestions(input.linePrefix, input.symbols),
    ...filePathSuggestions(input.linePrefix, input.files)
  ];
}

function latexCommandSuggestions(linePrefix: string): LatexCompletion[] {
  if (!/\\[A-Za-z]*$/.test(linePrefix)) return [];

  return LATEX_COMMANDS.map((command) => ({
    label: command.label,
    kind: "snippet",
    insertText: command.insertText,
    insertAsSnippet: true,
    detail: command.detail,
    documentation: command.documentation
  }));
}

function symbolSuggestions(linePrefix: string, symbols: ProjectSymbols | null): LatexCompletion[] {
  if (isReferenceContext(linePrefix)) {
    return (symbols?.labels ?? []).map((label) => ({
      label: label.key,
      kind: "reference",
      insertText: label.key,
      detail: label.path,
      documentation: `Line ${label.line}`
    }));
  }

  if (isCitationContext(linePrefix)) {
    return (symbols?.citations ?? []).map((citation) => ({
      label: citation.key,
      kind: "reference",
      insertText: citation.key,
      detail: citation.path,
      documentation: `Line ${citation.line}`
    }));
  }

  return [];
}

function filePathSuggestions(linePrefix: string, files: ProjectFile[]): LatexCompletion[] {
  const context = filePathContext(linePrefix);
  if (!context) return [];

  return files
    .filter((file) => isSuggestedFileForContext(file.path, context))
    .map((file) => {
      const insertText = context.omitTexExtension && file.path.toLowerCase().endsWith(".tex") ? file.path.slice(0, -4) : file.path;
      return {
        label: insertText,
        kind: "file" as const,
        insertText,
        detail: file.path,
        documentation: file.updatedAt ? `Updated ${new Date(file.updatedAt).toLocaleString()}` : undefined
      };
    });
}

function filePathContext(linePrefix: string): { kind: "tex" | "image" | "bibliography"; omitTexExtension: boolean } | null {
  if (/\\(?:input|include|subfile)\s*\{[^{}]*$/.test(linePrefix)) return { kind: "tex", omitTexExtension: true };
  if (/\\includegraphics(?:\[[^\]]*])?\s*\{[^{}]*$/.test(linePrefix)) return { kind: "image", omitTexExtension: false };
  if (/\\(?:bibliography|addbibresource)\s*\{[^{}]*$/.test(linePrefix)) return { kind: "bibliography", omitTexExtension: false };
  return null;
}

function isSuggestedFileForContext(filePath: string, context: { kind: "tex" | "image" | "bibliography" }): boolean {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";

  if (context.kind === "tex") return extension === "tex";
  if (context.kind === "bibliography") return extension === "bib";
  return IMAGE_EXTENSIONS.has(extension);
}

function isReferenceContext(linePrefix: string): boolean {
  return /\\(?:ref|eqref|pageref|autoref|cref|Cref)\*?(?:\[[^\]]*])?\{[^{}]*$/.test(linePrefix);
}

function isCitationContext(linePrefix: string): boolean {
  return /\\cite[A-Za-z*]*(?:\[[^\]]*]){0,2}\{[^{}]*$/.test(linePrefix);
}

const IMAGE_EXTENSIONS = new Set(["apng", "avif", "bmp", "eps", "gif", "jpg", "jpeg", "pdf", "png", "svg", "tif", "tiff", "webp"]);

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
