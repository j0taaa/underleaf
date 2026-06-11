import { Settings } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProjectFile } from "../../api";
import { Button } from "../ui/button";
import { Select } from "../ui/select";

export function ProjectSettingsMenu({
  rootFilePath,
  files,
  updating,
  onRootFileChange
}: {
  rootFilePath: string | null;
  files: ProjectFile[];
  updating: boolean;
  onRootFileChange: (rootFilePath: string | null) => void;
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
        </div>
      )}
    </div>
  );
}
