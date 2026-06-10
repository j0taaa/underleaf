export type TemplateId = "article" | "report" | "beamer";

export const templates: Record<TemplateId, { name: string; files: Record<string, string> }> = {
  article: {
    name: "Article",
    files: {
      "main.tex": `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{A Fresh Underleaf Article}
\\author{You}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
This is a compact starter document for writing in Underleaf.
\\end{abstract}

\\section{Introduction}
Start writing your paper here. Recompile to update the PDF preview.

\\end{document}
`
    }
  },
  report: {
    name: "Report",
    files: {
      "main.tex": `\\documentclass{report}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{Underleaf Report}
\\author{You}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents

\\chapter{Overview}
Write the first chapter of your report here.

\\end{document}
`
    }
  },
  beamer: {
    name: "Beamer",
    files: {
      "main.tex": `\\documentclass{beamer}
\\usetheme{Madrid}

\\title{Underleaf Presentation}
\\author{You}
\\date{\\today}

\\begin{document}

\\frame{\\titlepage}

\\begin{frame}{First idea}
  \\begin{itemize}
    \\item Write slides in LaTeX.
    \\item Recompile to preview the deck.
  \\end{itemize}
\\end{frame}

\\end{document}
`
    }
  }
};

export function resolveTemplate(template?: string): TemplateId {
  if (template === "report" || template === "beamer" || template === "article") {
    return template;
  }

  return "article";
}
