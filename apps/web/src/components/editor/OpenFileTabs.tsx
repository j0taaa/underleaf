import { FileText, X } from "lucide-react";
import type { ProjectFile, ProjectFileWithContent } from "../../api";
import { cn } from "../../lib/utils";

export function OpenFileTabs({
  files,
  activeFile,
  openFileIds,
  dirtyFileId,
  onOpen,
  onClose
}: {
  files: ProjectFile[];
  activeFile: ProjectFileWithContent | null;
  openFileIds: string[];
  dirtyFileId: string | null;
  onOpen: (file: ProjectFile) => void;
  onClose: (fileId: string) => void;
}) {
  const openFiles = openFileIds
    .map((fileId) => files.find((file) => file.id === fileId))
    .filter((file): file is ProjectFile => Boolean(file));

  if (openFiles.length === 0) {
    return (
      <div className="flex h-10 shrink-0 items-center border-b border-slate-700 px-3 text-xs text-slate-400">
        Select a file
      </div>
    );
  }

  return (
    <div className="flex h-10 shrink-0 items-stretch overflow-x-auto border-b border-slate-700 bg-[#252b38]">
      {openFiles.map((file) => {
        const active = activeFile?.id === file.id;
        const dirty = dirtyFileId === file.id;

        return (
          <div
            className={cn(
              "group flex max-w-56 shrink-0 items-center gap-2 border-r border-slate-700 px-3 text-left text-xs text-slate-300 hover:bg-[#2d3443]",
              active && "bg-[#1f2430] text-white"
            )}
            key={file.id}
            title={file.path}
          >
            <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onOpen(file)}>
              <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="truncate">{file.path.split("/").at(-1) ?? file.path}</span>
              {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="Unsaved changes" />}
            </button>
            <button
              className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-700 hover:text-slate-100"
              title="Close tab"
              onClick={() => onClose(file.id)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
