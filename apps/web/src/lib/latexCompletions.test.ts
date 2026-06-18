import { describe, expect, it } from "vitest";
import type { ProjectFile, ProjectSymbols } from "../api";
import { buildLatexCompletions } from "./latexCompletions";

const files: ProjectFile[] = [
  file("main.tex"),
  file("sections/intro.tex"),
  file("figures/chart.png"),
  file("figures/photo.jpg"),
  file("references/library.bib"),
  file("notes.txt")
];

const symbols: ProjectSymbols = {
  labels: [{ key: "sec:intro", fileId: "file-2", path: "sections/intro.tex", line: 3 }],
  citations: [{ key: "knuth1984", fileId: "file-5", path: "references/library.bib", line: 1 }]
};

describe("buildLatexCompletions", () => {
  it("suggests LaTeX command snippets after a command prefix", () => {
    const completions = buildLatexCompletions({ linePrefix: "\\sec", files, symbols });

    expect(completions).toContainEqual(expect.objectContaining({
      label: "\\section",
      kind: "snippet",
      insertAsSnippet: true
    }));
  });

  it("suggests labels inside reference commands", () => {
    const completions = buildLatexCompletions({ linePrefix: "See \\ref{sec", files, symbols });

    expect(completions).toEqual([
      expect.objectContaining({
        label: "sec:intro",
        kind: "reference",
        insertText: "sec:intro"
      })
    ]);
  });

  it("suggests citation keys inside cite commands", () => {
    const completions = buildLatexCompletions({ linePrefix: "As shown by \\cite{kn", files, symbols });

    expect(completions).toEqual([
      expect.objectContaining({
        label: "knuth1984",
        kind: "reference",
        insertText: "knuth1984"
      })
    ]);
  });

  it("suggests tex files without extension for input-like commands", () => {
    const completions = buildLatexCompletions({ linePrefix: "\\input{sections/", files, symbols: null });

    expect(completions.map((completion) => completion.insertText)).toEqual(["main", "sections/intro"]);
  });

  it("suggests image assets for includegraphics", () => {
    const completions = buildLatexCompletions({ linePrefix: "\\includegraphics[width=0.8\\textwidth]{fig", files, symbols: null });

    expect(completions.map((completion) => completion.insertText)).toEqual(["figures/chart.png", "figures/photo.jpg"]);
  });

  it("suggests bibliography files for bibliography commands", () => {
    const completions = buildLatexCompletions({ linePrefix: "\\bibliography{references/", files, symbols: null });

    expect(completions).toEqual([
      expect.objectContaining({
        label: "references/library.bib",
        kind: "file",
        insertText: "references/library.bib"
      })
    ]);
  });
});

function file(path: string): ProjectFile {
  return {
    id: path,
    projectId: "project-1",
    path,
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z"
  };
}
