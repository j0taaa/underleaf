import { FilePlus2, FileText, FolderOpen, Trash2 } from "lucide-react";
import type { ProjectFile, ProjectFileWithContent } from "../../api";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function FileSidebar({
  files,
  activeFile,
  newFilePath,
  onNewFilePathChange,
  onCreateFile,
  onOpenFile,
  onDeleteFile
}: {
  files: ProjectFile[];
  activeFile: ProjectFileWithContent | null;
  newFilePath: string;
  onNewFilePathChange: (path: string) => void;
  onCreateFile: () => void;
  onOpenFile: (file: ProjectFile) => void;
  onDeleteFile: (file: ProjectFile) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-b border-border bg-card md:border-b-0 md:border-r">
      <div className="flex h-11 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FolderOpen className="h-4 w-4" />
          Files
        </div>
      </div>
      <div className="flex gap-2 border-b border-border p-2">
        <Input placeholder="sections/intro.tex" value={newFilePath} onChange={(event) => onNewFilePathChange(event.target.value)} />
        <Button size="icon" variant="outline" title="Create file" onClick={onCreateFile}>
          <FilePlus2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {files.map((file) => (
          <div className="group flex items-center gap-1" key={file.id}>
            <button
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted",
                activeFile?.id === file.id && "bg-muted font-medium"
              )}
              onClick={() => onOpenFile(file)}
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{file.path}</span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              title="Delete file"
              className="h-8 w-8 opacity-70 md:opacity-0 md:group-hover:opacity-100"
              onClick={() => onDeleteFile(file)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </aside>
  );
}
