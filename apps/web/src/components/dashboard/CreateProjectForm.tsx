import { FilePlus2, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";

const templateOptions = [
  {
    value: "article",
    label: "Article",
    preview: [
      "\\documentclass{article}",
      "\\title{A Fresh Underleaf Article}",
      "\\author{You}",
      "\\begin{document}",
      "\\maketitle",
      "\\section{Introduction}",
      "Start writing your paper here.",
      "\\end{document}"
    ].join("\n")
  },
  {
    value: "report",
    label: "Report",
    preview: [
      "\\documentclass{report}",
      "\\title{Underleaf Report}",
      "\\author{You}",
      "\\begin{document}",
      "\\maketitle",
      "\\chapter{Overview}",
      "\\section{Background}",
      "\\end{document}"
    ].join("\n")
  },
  {
    value: "beamer",
    label: "Beamer",
    preview: [
      "\\documentclass{beamer}",
      "\\title{Underleaf Slides}",
      "\\author{You}",
      "\\begin{document}",
      "\\frame{\\titlepage}",
      "\\begin{frame}{First slide}",
      "\\begin{itemize}",
      "\\item Present your ideas.",
      "\\end{itemize}",
      "\\end{frame}",
      "\\end{document}"
    ].join("\n")
  }
];

export function CreateProjectForm({
  onCreate
}: {
  onCreate: (input: { name: string; template: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Untitled Project");
  const [template, setTemplate] = useState("article");
  const [creating, setCreating] = useState(false);
  const selectedTemplate = templateOptions.find((option) => option.value === template) ?? templateOptions[0];

  const createProject = async () => {
    setCreating(true);
    try {
      await onCreate({ name, template });
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Button aria-label="Create project" title="Create project" size="icon" onClick={() => setOpen(true)}>
        <FilePlus2 className="h-4 w-4" />
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="presentation">
          <form
            aria-label="Create project"
            className="grid max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-md border border-border bg-card shadow-lg md:grid-cols-[280px_minmax(0,1fr)]"
            onSubmit={(event) => {
              event.preventDefault();
              void createProject();
            }}
          >
            <div className="border-b border-border p-4 md:border-b-0 md:border-r">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">Create project</h2>
                <Button type="button" variant="ghost" size="icon" title="Close" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-3">
                <Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Project name" />
                <Select value={template} onChange={(event) => setTemplate(event.target.value)} aria-label="Template">
                  {templateOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Button type="submit" disabled={creating || !name.trim()} className="w-full">
                  <Plus className="h-4 w-4" />
                  {creating ? "Creating..." : "Create"}
                </Button>
              </div>
            </div>
            <div className="min-h-0 bg-[#1f2430] p-4 text-slate-100">
              <div className="mb-3 text-xs font-semibold uppercase text-slate-400">{selectedTemplate.label} template</div>
              <pre className="max-h-[56vh] overflow-auto rounded-sm bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                <code>{selectedTemplate.preview}</code>
              </pre>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
