import { Archive, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function ImportProjectForm({
  importing,
  onImport
}: {
  importing: boolean;
  onImport: (input: { file: File; name?: string }) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const importProject = async () => {
    if (!file) return;
    await onImport({ file, name });
    setName("");
    setFile(null);
    setOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <>
      <Button aria-label="Import project" title="Import project" variant="outline" size="icon" onClick={() => setOpen(true)}>
        <Archive className="h-4 w-4" />
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="presentation">
          <div className="w-full max-w-md rounded-md border border-border bg-card p-4 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold">Import project</h2>
              </div>
              <Button type="button" variant="ghost" size="icon" title="Close" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3">
              <Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Imported project name" placeholder="Project name" />
              <Input
                ref={fileInputRef}
                type="file"
                accept=".zip,.tar,.tar.gz,.tgz,application/zip,application/gzip"
                aria-label="Project archive"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <Button disabled={!file || importing} onClick={() => void importProject()}>
                <Upload className="h-4 w-4" />
                {importing ? "Importing" : "Import archive"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
