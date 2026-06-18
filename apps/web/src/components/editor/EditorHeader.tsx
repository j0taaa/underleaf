import { BarChart3, ChevronLeft, Download, GitBranch, History, LayoutPanelLeft, Maximize2, PanelRightOpen, Pencil, Play } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { api, type CompileEngine, type CompileJob, type Project, type ProjectFile, type ProjectFileWithContent } from "../../api";
import type { LayoutMode } from "../../types/editor";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ProjectSettingsMenu } from "./ProjectSettingsMenu";

export function EditorHeader({
  project,
  activeFile,
  files,
  projectName,
  renaming,
  layout,
  compileJob,
  compiling,
  updatingRootFile,
  statusText,
  onProjectNameChange,
  onRenameStart,
  onRenameSubmit,
  onRootFileChange,
  onCompileEngineChange,
  onAutoCompileChange,
  onHistoryToggle,
  onSourceControlToggle,
  onWordCountToggle,
  onLayoutChange,
  onCompile
}: {
  project: Project;
  activeFile: ProjectFileWithContent | null;
  files: ProjectFile[];
  projectName: string;
  renaming: boolean;
  layout: LayoutMode;
  compileJob: CompileJob | null;
  compiling: boolean;
  updatingRootFile: boolean;
  statusText: string;
  onProjectNameChange: (name: string) => void;
  onRenameStart: () => void;
  onRenameSubmit: () => void;
  onRootFileChange: (rootFilePath: string | null) => void;
  onCompileEngineChange: (compileEngine: CompileEngine) => void;
  onAutoCompileChange: (autoCompile: boolean) => void;
  onHistoryToggle: () => void;
  onSourceControlToggle: () => void;
  onWordCountToggle: () => void;
  onLayoutChange: (layout: LayoutMode) => void;
  onCompile: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-3">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          to="/"
          aria-label="Back to projects"
          title="Back to projects"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        {renaming ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onRenameSubmit();
            }}
          >
            <Input className="w-56" value={projectName} onChange={(event) => onProjectNameChange(event.target.value)} />
            <Button size="sm" type="submit">
              Save
            </Button>
          </form>
        ) : (
          <button className="min-w-0 text-left" onClick={onRenameStart}>
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold">{project.name}</h1>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-xs text-muted-foreground">{activeFile?.path ?? "No file selected"}</div>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className={cn("hidden text-xs sm:inline", compileJob?.status === "error" ? "text-destructive" : "text-muted-foreground")}>
          {statusText}
        </span>
        <a
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={api.projectDownloadUrl(project.id)}
          download
          title="Download project"
        >
          <Download className="h-4 w-4" />
        </a>
        <Button variant="outline" size="sm" title="History" onClick={onHistoryToggle}>
          <History className="h-4 w-4" />
          History
        </Button>
        <Button variant="outline" size="sm" title="Source control" onClick={onSourceControlToggle}>
          <GitBranch className="h-4 w-4" />
          Git
        </Button>
        <Button variant="outline" size="sm" title="Word count" onClick={onWordCountToggle}>
          <BarChart3 className="h-4 w-4" />
          Words
        </Button>
        <ProjectSettingsMenu
          rootFilePath={project.rootFilePath}
          compileEngine={project.compileEngine}
          autoCompile={project.autoCompile}
          files={files}
          updating={updatingRootFile}
          onRootFileChange={onRootFileChange}
          onCompileEngineChange={onCompileEngineChange}
          onAutoCompileChange={onAutoCompileChange}
        />
        <div className="hidden items-center rounded-md border border-border p-0.5 md:flex">
          <Button variant={layout === "split" ? "secondary" : "ghost"} size="icon" title="Split view" onClick={() => onLayoutChange("split")}>
            <LayoutPanelLeft className="h-4 w-4" />
          </Button>
          <Button variant={layout === "editor" ? "secondary" : "ghost"} size="icon" title="Editor only" onClick={() => onLayoutChange("editor")}>
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button variant={layout === "pdf" ? "secondary" : "ghost"} size="icon" title="PDF only" onClick={() => onLayoutChange("pdf")}>
            <PanelRightOpen className="h-4 w-4" />
          </Button>
        </div>
        <Button onClick={onCompile} disabled={compiling}>
          <Play className="h-4 w-4" />
          {compiling ? "Compiling" : "Recompile"}
        </Button>
      </div>
    </header>
  );
}
