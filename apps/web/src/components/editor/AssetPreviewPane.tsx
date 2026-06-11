import { Download, FileBox, Image as ImageIcon } from "lucide-react";
import { api, type ProjectFile } from "../../api";
import { isImageFile } from "../../lib/fileTypes";

export function AssetPreviewPane({ projectId, file }: { projectId: string; file: ProjectFile }) {
  const rawUrl = api.fileRawUrl(projectId, file.id);
  const image = isImageFile(file.path);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#1f2430] text-slate-200">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-700 px-3 text-xs">
        <span className="truncate">{file.path}</span>
        <a
          className="inline-flex h-7 items-center gap-1 rounded border border-slate-600 px-2 text-slate-300 hover:bg-slate-700 hover:text-white"
          href={rawUrl}
          download
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      </div>
      {image ? (
        <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-[#161a22] p-6">
          <div className="flex max-h-full max-w-full flex-col items-center gap-3">
            <img className="max-h-[70vh] max-w-full rounded border border-slate-700 bg-white object-contain" src={rawUrl} alt={file.path} />
            <div className="inline-flex items-center gap-2 text-xs text-slate-400">
              <ImageIcon className="h-4 w-4" />
              {file.path}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div className="max-w-sm">
            <FileBox className="mx-auto h-12 w-12 text-slate-500" />
            <h2 className="mt-4 text-sm font-semibold text-slate-100">{file.path.split("/").at(-1) ?? file.path}</h2>
            <p className="mt-2 text-sm text-slate-400">This asset is stored in the project and can be downloaded or referenced from LaTeX.</p>
            <a
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              href={rawUrl}
              download
            >
              <Download className="h-4 w-4" />
              Download asset
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
