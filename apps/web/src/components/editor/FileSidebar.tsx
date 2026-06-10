import {
  ChevronDown,
  ChevronRight,
  File,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Check,
  Trash2,
  Upload,
  X
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import type { ProjectFile, ProjectFileWithContent, ProjectFolder, ProjectSearchResult } from "../../api";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ProjectSearchPanel } from "./ProjectSearchPanel";

type ExplorerNode =
  | { kind: "folder"; id?: string; name: string; path: string; children: ExplorerNode[] }
  | { kind: "file"; id: string; name: string; path: string; file: ProjectFile };

type DraftAction = { kind: "file" | "folder"; parentPath: string } | null;
type RenameAction = { kind: "file"; id: string; path: string } | { kind: "folder"; id: string; path: string } | null;

export function FileSidebar({
  files,
  folders,
  activeFile,
  onCreateFile,
  onCreateFolder,
  onRenameFile,
  onRenameFolder,
  onOpenFile,
  onDeleteFile,
  onDeleteFolder,
  onUploadItems,
  searchQuery,
  searchResults,
  searching,
  onSearchQueryChange,
  onOpenSearchResult
}: {
  files: ProjectFile[];
  folders: ProjectFolder[];
  activeFile: ProjectFileWithContent | null;
  onCreateFile: (path: string) => void;
  onCreateFolder: (path: string) => void;
  onRenameFile: (file: ProjectFile, path: string) => void;
  onRenameFolder: (folder: ProjectFolder, path: string) => void;
  onOpenFile: (file: ProjectFile) => void;
  onDeleteFile: (file: ProjectFile) => void;
  onDeleteFolder: (folder: ProjectFolder) => void;
  onUploadItems: (dataTransfer: DataTransfer, parentPath: string) => void;
  searchQuery: string;
  searchResults: ProjectSearchResult[];
  searching: boolean;
  onSearchQueryChange: (query: string) => void;
  onOpenSearchResult: (result: ProjectSearchResult) => void;
}) {
  const tree = useMemo(() => buildTree(files, folders), [files, folders]);
  const folderByPath = useMemo(() => new Map(folders.map((folder) => [folder.path, folder])), [folders]);
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set([""]));
  const [draft, setDraft] = useState<DraftAction>(null);
  const [draftName, setDraftName] = useState("");
  const [rename, setRename] = useState<RenameAction>(null);
  const [renameName, setRenameName] = useState("");
  const [draggingRoot, setDraggingRoot] = useState(false);

  const startDraft = (kind: "file" | "folder", parentPath = "") => {
    setDraft({ kind, parentPath });
    setDraftName(kind === "file" ? "untitled.tex" : "new-folder");
    if (parentPath) setOpenFolders((current) => new Set(current).add(parentPath));
  };

  const submitDraft = () => {
    if (!draft || !draftName.trim()) return;
    const nextPath = joinPath(draft.parentPath, draftName);
    if (draft.kind === "file") onCreateFile(nextPath);
    else onCreateFolder(nextPath);
    setDraft(null);
    setDraftName("");
  };

  const startRename = (action: RenameAction) => {
    if (!action) return;
    setRename(action);
    setRenameName(action.path.split("/").at(-1) ?? action.path);
  };

  const submitRename = () => {
    if (!rename || !renameName.trim()) return;
    const parent = parentPath(rename.path);
    const nextPath = joinPath(parent, renameName);

    if (rename.kind === "file") {
      const file = files.find((item) => item.id === rename.id);
      if (file) onRenameFile(file, nextPath);
    } else {
      const folder = folders.find((item) => item.id === rename.id);
      if (folder) onRenameFolder(folder, nextPath);
    }

    setRename(null);
    setRenameName("");
  };

  return (
    <aside
      className={cn("relative flex min-h-0 flex-col border-b border-border bg-[#f6f8fa] md:border-b-0 md:border-r", draggingRoot && "ring-2 ring-inset ring-primary")}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) setDraggingRoot(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingRoot(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDraggingRoot(false);
        onUploadItems(event.dataTransfer, "");
      }}
    >
      {draggingRoot && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex items-center gap-2 rounded border border-primary/30 bg-white px-2 py-1.5 text-xs text-muted-foreground shadow-sm">
          <Upload className="h-3.5 w-3.5 text-primary" />
          Drop files to add them
        </div>
      )}
      <div className="flex h-9 items-center justify-between border-b border-border px-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Explorer</div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" title="New file" className="h-7 w-7" onClick={() => startDraft("file")}>
            <FilePlus2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="New folder" className="h-7 w-7" onClick={() => startDraft("folder")}>
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex h-8 items-center gap-1 border-b border-border px-2 text-[11px] font-semibold uppercase tracking-wide">
        <ChevronDown className="h-3.5 w-3.5" />
        Underleaf Project
      </div>

      <ProjectSearchPanel
        query={searchQuery}
        results={searchResults}
        searching={searching}
        onQueryChange={onSearchQueryChange}
        onOpenResult={onOpenSearchResult}
      />

      <div className="min-h-0 flex-1 overflow-auto py-1 text-sm">
        {draft?.parentPath === "" && (
          <ExplorerInput
            depth={0}
            icon={draft.kind === "file" ? <File className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
            value={draftName}
            onChange={setDraftName}
            onSubmit={submitDraft}
            onCancel={() => setDraft(null)}
          />
        )}
        {tree.map((node) => (
          <ExplorerNodeRow
            activeFileId={activeFile?.id}
            draft={draft}
            draftName={draftName}
            folderByPath={folderByPath}
            key={`${node.kind}:${node.path}`}
            node={node}
            openFolders={openFolders}
            rename={rename}
            renameName={renameName}
            setDraftName={setDraftName}
            setOpenFolders={setOpenFolders}
            setRenameName={setRenameName}
            startDraft={startDraft}
            startRename={startRename}
            submitDraft={submitDraft}
            submitRename={submitRename}
            onCancelDraft={() => setDraft(null)}
            onCancelRename={() => setRename(null)}
            onDeleteFile={onDeleteFile}
            onDeleteFolder={onDeleteFolder}
            onOpenFile={onOpenFile}
            onUploadItems={onUploadItems}
          />
        ))}
      </div>
    </aside>
  );
}

function ExplorerNodeRow({
  node,
  activeFileId,
  draft,
  draftName,
  folderByPath,
  openFolders,
  rename,
  renameName,
  setDraftName,
  setOpenFolders,
  setRenameName,
  startDraft,
  startRename,
  submitDraft,
  submitRename,
  onCancelDraft,
  onCancelRename,
  onDeleteFile,
  onDeleteFolder,
  onOpenFile,
  onUploadItems,
  depth = 0
}: {
  node: ExplorerNode;
  activeFileId?: string;
  draft: DraftAction;
  draftName: string;
  folderByPath: Map<string, ProjectFolder>;
  openFolders: Set<string>;
  rename: RenameAction;
  renameName: string;
  setDraftName: (value: string) => void;
  setOpenFolders: React.Dispatch<React.SetStateAction<Set<string>>>;
  setRenameName: (value: string) => void;
  startDraft: (kind: "file" | "folder", parentPath?: string) => void;
  startRename: (action: RenameAction) => void;
  submitDraft: () => void;
  submitRename: () => void;
  onCancelDraft: () => void;
  onCancelRename: () => void;
  onDeleteFile: (file: ProjectFile) => void;
  onDeleteFolder: (folder: ProjectFolder) => void;
  onOpenFile: (file: ProjectFile) => void;
  onUploadItems: (dataTransfer: DataTransfer, parentPath: string) => void;
  depth?: number;
}) {
  const [isDropTarget, setIsDropTarget] = useState(false);

  if (node.kind === "file") {
    const isRenaming = rename?.kind === "file" && rename.id === node.id;
    if (isRenaming) {
      return (
        <ExplorerInput
          depth={depth}
          icon={<File className="h-4 w-4" />}
          value={renameName}
          onChange={setRenameName}
          onSubmit={submitRename}
          onCancel={onCancelRename}
        />
      );
    }

    return (
      <div className={cn("group flex h-7 items-center gap-1 pr-1", activeFileId === node.id && "bg-[#dbeafe]")} style={{ paddingLeft: depth * 14 + 8 }}>
        <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => onOpenFile(node.file)}>
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{node.name}</span>
        </button>
        <RowIcon title="Rename file" onClick={() => startRename({ kind: "file", id: node.id, path: node.path })}>
          <Pencil className="h-3.5 w-3.5" />
        </RowIcon>
        <RowIcon title="Delete file" onClick={() => onDeleteFile(node.file)}>
          <Trash2 className="h-3.5 w-3.5" />
        </RowIcon>
      </div>
    );
  }

  const isOpen = openFolders.has(node.path);
  const folder = folderByPath.get(node.path);
  const isRenaming = folder && rename?.kind === "folder" && rename.id === folder.id;

  if (isRenaming) {
    return (
      <ExplorerInput
        depth={depth}
        icon={<Folder className="h-4 w-4" />}
        value={renameName}
        onChange={setRenameName}
        onSubmit={submitRename}
        onCancel={onCancelRename}
      />
    );
  }

  return (
    <div>
      <div
        className={cn("group flex h-7 items-center gap-1 pr-1 hover:bg-muted", isDropTarget && "bg-primary/10")}
        style={{ paddingLeft: depth * 14 + 4 }}
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.stopPropagation();
          setIsDropTarget(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDropTarget(false);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.stopPropagation();
          setIsDropTarget(false);
          setOpenFolders((current) => new Set(current).add(node.path));
          onUploadItems(event.dataTransfer, node.path);
        }}
      >
        <button
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          onClick={() => {
            setOpenFolders((current) => {
              const next = new Set(current);
              if (next.has(node.path)) next.delete(node.path);
              else next.add(node.path);
              return next;
            });
          }}
        >
          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          {isOpen ? <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="truncate">{node.name}</span>
        </button>
        <RowIcon title="New file" onClick={() => startDraft("file", node.path)}>
          <FilePlus2 className="h-3.5 w-3.5" />
        </RowIcon>
        <RowIcon title="New folder" onClick={() => startDraft("folder", node.path)}>
          <FolderPlus className="h-3.5 w-3.5" />
        </RowIcon>
        {folder && (
          <>
            <RowIcon title="Rename folder" onClick={() => startRename({ kind: "folder", id: folder.id, path: folder.path })}>
              <Pencil className="h-3.5 w-3.5" />
            </RowIcon>
            <RowIcon title="Delete folder" onClick={() => onDeleteFolder(folder)}>
              <Trash2 className="h-3.5 w-3.5" />
            </RowIcon>
          </>
        )}
      </div>
      {isOpen && (
        <div>
          {draft?.parentPath === node.path && (
            <ExplorerInput
              depth={depth + 1}
              icon={draft.kind === "file" ? <File className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
              value={draftName}
              onChange={setDraftName}
              onSubmit={submitDraft}
              onCancel={onCancelDraft}
            />
          )}
          {node.children.map((child) => (
            <ExplorerNodeRow
              activeFileId={activeFileId}
              depth={depth + 1}
              draft={draft}
              draftName={draftName}
              folderByPath={folderByPath}
              key={`${child.kind}:${child.path}`}
              node={child}
              openFolders={openFolders}
              rename={rename}
              renameName={renameName}
              setDraftName={setDraftName}
              setOpenFolders={setOpenFolders}
              setRenameName={setRenameName}
              startDraft={startDraft}
              startRename={startRename}
              submitDraft={submitDraft}
              submitRename={submitRename}
              onCancelDraft={onCancelDraft}
              onCancelRename={onCancelRename}
              onDeleteFile={onDeleteFile}
              onDeleteFolder={onDeleteFolder}
              onOpenFile={onOpenFile}
              onUploadItems={onUploadItems}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExplorerInput({
  depth,
  icon,
  value,
  onChange,
  onSubmit,
  onCancel
}: {
  depth: number;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="flex h-8 items-center gap-1 pr-1"
      style={{ paddingLeft: depth * 14 + 8 }}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <Input
        autoFocus
        className="h-6 min-w-0 rounded-sm border-primary bg-white px-1.5 text-xs"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <Button type="button" variant="ghost" size="icon" title="Save" className="h-6 w-6" onMouseDown={(event) => event.preventDefault()} onClick={onSubmit}>
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" title="Cancel" className="h-6 w-6" onMouseDown={(event) => event.preventDefault()} onClick={onCancel}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </form>
  );
}

function RowIcon({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100 focus:opacity-100"
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function buildTree(files: ProjectFile[], folders: ProjectFolder[]): ExplorerNode[] {
  const root: ExplorerNode[] = [];
  const foldersByPath = new Map<string, Extract<ExplorerNode, { kind: "folder" }>>();

  const ensureFolder = (folderPath: string): Extract<ExplorerNode, { kind: "folder" }> => {
    const existing = foldersByPath.get(folderPath);
    if (existing) return existing;

    const parts = folderPath.split("/");
    const parent = parts.length > 1 ? ensureFolder(parts.slice(0, -1).join("/")) : null;
    const folderRow = folders.find((folder) => folder.path === folderPath);
    const node: Extract<ExplorerNode, { kind: "folder" }> = {
      kind: "folder",
      id: folderRow?.id,
      name: parts.at(-1) ?? folderPath,
      path: folderPath,
      children: []
    };

    foldersByPath.set(folderPath, node);
    if (parent) parent.children.push(node);
    else root.push(node);
    return node;
  };

  for (const folder of folders) ensureFolder(folder.path);

  for (const file of files) {
    const parts = file.path.split("/");
    const fileNode: ExplorerNode = {
      kind: "file",
      id: file.id,
      name: parts.at(-1) ?? file.path,
      path: file.path,
      file
    };
    const parent = parts.length > 1 ? ensureFolder(parts.slice(0, -1).join("/")) : null;
    if (parent) parent.children.push(fileNode);
    else root.push(fileNode);
  }

  const sortNodes = (nodes: ExplorerNode[]) => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.kind === "folder") sortNodes(node.children);
    }
  };

  sortNodes(root);
  return root;
}

function joinPath(parent: string, name: string): string {
  const cleanName = name.trim().replace(/^\/+|\/+$/g, "");
  return parent ? `${parent}/${cleanName}` : cleanName;
}

function parentPath(itemPath: string): string {
  const parts = itemPath.split("/");
  parts.pop();
  return parts.join("/");
}
