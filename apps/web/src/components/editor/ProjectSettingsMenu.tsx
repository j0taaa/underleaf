import { Settings } from "lucide-react";
import { useMemo, useState } from "react";
import type { CompileEngine, ProjectFile } from "../../api";
import { Button } from "../ui/button";
import { Select } from "../ui/select";

export function ProjectSettingsMenu({
  rootFilePath,
  compileEngine,
  autoCompile,
  files,
  updating,
  onRootFileChange,
  onCompileEngineChange,
  onAutoCompileChange
}: {
  rootFilePath: string | null;
  compileEngine: CompileEngine;
  autoCompile: boolean;
  files: ProjectFile[];
  updating: boolean;
  onRootFileChange: (rootFilePath: string | null) => void;
  onCompileEngineChange: (compileEngine: CompileEngine) => void;
  onAutoCompileChange: (autoCompile: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const texFiles = useMemo(
    () => files.filter((file) => file.path.toLowerCase().endsWith(".tex")).sort((left, right) => left.path.localeCompare(right.path)),
    [files]
  );

  return (
    <div className="relative">
      <Button variant="outline" size="icon" title="Project settings" onClick={() => setOpen((current) => !current)}>
        <Settings className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-72 rounded-md border border-border bg-card p-3 shadow-lg">
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Root document
              <Select
                value={rootFilePath ?? ""}
                disabled={updating || texFiles.length === 0}
                onChange={(event) => onRootFileChange(event.target.value || null)}
              >
                <option value="">Auto detect</option>
                {texFiles.length === 0 ? (
                  <option value="" disabled>
                    No .tex files
                  </option>
                ) : (
                  texFiles.map((file) => (
                    <option key={file.id} value={file.path}>
                      {file.path}
                    </option>
                  ))
                )}
              </Select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Compiler
              <Select
                value={compileEngine}
                disabled={updating}
                onChange={(event) => onCompileEngineChange(event.target.value as CompileEngine)}
              >
                <option value="pdflatex">pdfLaTeX</option>
                <option value="xelatex">XeLaTeX</option>
                <option value="lualatex">LuaLaTeX</option>
              </Select>
            </label>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground">
              <span className="min-w-0">
                <span className="block">Auto compile</span>
                <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">Recompile after autosave</span>
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={autoCompile}
                disabled={updating}
                onChange={(event) => onAutoCompileChange(event.target.checked)}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
