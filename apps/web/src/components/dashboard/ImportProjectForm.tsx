import { Archive, Upload } from "lucide-react";
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
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const importProject = async () => {
    if (!file) return;
    await onImport({ file, name });
    setName("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Archive className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Import Project</h2>
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
          {importing ? "Importing" : "Import Archive"}
        </Button>
      </div>
    </div>
  );
}
