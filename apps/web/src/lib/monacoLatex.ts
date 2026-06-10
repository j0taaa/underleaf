import type { Monaco } from "@monaco-editor/react";

let registered = false;

export function registerLatexLanguage(monaco: Monaco) {
  if (registered) return;
  registered = true;

  monaco.languages.register({
    id: "latex",
    aliases: ["LaTeX", "latex", "tex"],
    extensions: [".tex", ".sty", ".cls"]
  });

  monaco.languages.setLanguageConfiguration("latex", {
    comments: {
      lineComment: "%"
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"]
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "`", close: "'" },
      { open: "``", close: "''" },
      { open: "$", close: "$", notIn: ["comment"] }
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "$", close: "$" }
    ]
  });

  monaco.languages.setMonarchTokensProvider("latex", {
    defaultToken: "",
    tokenPostfix: ".tex",
    tokenizer: {
      root: [
        [/%.*$/, "comment"],
        [/\\(begin|end)(\s*)(\{)([A-Za-z*]+)(\})/, ["keyword.control", "", "delimiter.bracket", "tag", "delimiter.bracket"]],
        [
          /\\(documentclass|usepackage|title|author|date|maketitle|tableofcontents|section|subsection|subsubsection|paragraph|chapter|part|item|label|ref|cite|bibliography|bibliographystyle)\b/,
          "keyword"
        ],
        [/\\[A-Za-z@]+[*]?/, "type.identifier"],
        [/\\./, "type.identifier"],
        [/\$\$/, { token: "string.math", next: "@displayMath" }],
        [/\$/, { token: "string.math", next: "@inlineMath" }],
        [/[{}()[\]]/, "delimiter.bracket"],
        [/[&_^~#]/, "operator"],
        [/\d+(\.\d+)?/, "number"],
        [/[A-Za-z]+/, "identifier"]
      ],
      inlineMath: [
        [/\\[A-Za-z@]+[*]?/, "type.identifier"],
        [/[{}()[\]]/, "delimiter.bracket"],
        [/[+\-*/=<>|^_]/, "operator"],
        [/\d+(\.\d+)?/, "number"],
        [/\$/, { token: "string.math", next: "@pop" }],
        [/[^$\\{}()[\]+\-*/=<>|^_\d]+/, "string.math"]
      ],
      displayMath: [
        [/\\[A-Za-z@]+[*]?/, "type.identifier"],
        [/[{}()[\]]/, "delimiter.bracket"],
        [/[+\-*/=<>|^_]/, "operator"],
        [/\d+(\.\d+)?/, "number"],
        [/\$\$/, { token: "string.math", next: "@pop" }],
        [/[^$\\{}()[\]+\-*/=<>|^_\d]+/, "string.math"]
      ]
    }
  });

  monaco.editor.defineTheme("underleaf-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7d8799", fontStyle: "italic" },
      { token: "keyword", foreground: "74d3ae", fontStyle: "bold" },
      { token: "keyword.control", foreground: "7cc7ff", fontStyle: "bold" },
      { token: "type.identifier", foreground: "f0c674" },
      { token: "tag", foreground: "f78c6c" },
      { token: "string.math", foreground: "c3e88d" },
      { token: "operator", foreground: "89ddff" },
      { token: "number", foreground: "f78c6c" },
      { token: "delimiter.bracket", foreground: "d7dce8" }
    ],
    colors: {
      "editor.background": "#1f2430",
      "editorLineNumber.foreground": "#6b7280",
      "editorLineNumber.activeForeground": "#d1d5db"
    }
  });
}
