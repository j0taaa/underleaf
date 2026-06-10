import { FileSearch, Search, X } from "lucide-react";
import type { ProjectSearchResult } from "../../api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function ProjectSearchPanel({
  query,
  results,
  searching,
  onQueryChange,
  onOpenResult
}: {
  query: string;
  results: ProjectSearchResult[];
  searching: boolean;
  onQueryChange: (query: string) => void;
  onOpenResult: (result: ProjectSearchResult) => void;
}) {
  const trimmedQuery = query.trim();
  const groupedResults = groupSearchResults(results);

  return (
    <section className="border-b border-border bg-[#f6f8fa]">
      <div className="flex h-9 items-center gap-2 border-b border-border px-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          aria-label="Search project"
          className="h-7 min-w-0 flex-1 rounded-sm bg-white px-2 text-xs"
          placeholder="Search project"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {query && (
          <Button variant="ghost" size="icon" title="Clear search" className="h-7 w-7" onClick={() => onQueryChange("")}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {trimmedQuery.length > 0 && (
        <div className="max-h-56 overflow-auto py-1 text-xs">
          {trimmedQuery.length < 2 && <div className="px-3 py-2 text-muted-foreground">Type at least 2 characters</div>}
          {trimmedQuery.length >= 2 && searching && <div className="px-3 py-2 text-muted-foreground">Searching...</div>}
          {trimmedQuery.length >= 2 && !searching && results.length === 0 && <div className="px-3 py-2 text-muted-foreground">No results</div>}
          {groupedResults.map((group) => (
            <div key={group.path} className="py-1">
              <div className="flex items-center gap-1 px-3 py-1 font-medium text-muted-foreground">
                <FileSearch className="h-3.5 w-3.5" />
                <span className="truncate">{group.path}</span>
                <span className="ml-auto">{group.results.length}</span>
              </div>
              {group.results.map((result) => (
                <button
                  key={`${result.path}:${result.line}:${result.column}:${result.preview}`}
                  type="button"
                  className="flex w-full gap-2 px-6 py-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onOpenResult(result)}
                >
                  <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{result.line}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{result.preview}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function groupSearchResults(results: ProjectSearchResult[]): Array<{ path: string; results: ProjectSearchResult[] }> {
  const groups = new Map<string, ProjectSearchResult[]>();
  for (const result of results) {
    groups.set(result.path, [...(groups.get(result.path) ?? []), result]);
  }
  return [...groups.entries()].map(([path, grouped]) => ({ path, results: grouped }));
}
