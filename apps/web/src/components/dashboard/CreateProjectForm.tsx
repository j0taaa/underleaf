import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";

const templateOptions = [
  { value: "article", label: "Article" },
  { value: "report", label: "Report" },
  { value: "beamer", label: "Beamer" }
];

export function CreateProjectForm({
  onCreate
}: {
  onCreate: (input: { name: string; template: string }) => Promise<void>;
}) {
  const [name, setName] = useState("Untitled Project");
  const [template, setTemplate] = useState("article");
  const [creating, setCreating] = useState(false);

  const createProject = async () => {
    setCreating(true);
    try {
      await onCreate({ name, template });
    } finally {
      setCreating(false);
    }
  };

  return (
    <form
      className="rounded-md border border-border bg-card p-4 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void createProject();
      }}
    >
      <h2 className="mb-4 text-base font-semibold">Create project</h2>
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
    </form>
  );
}
