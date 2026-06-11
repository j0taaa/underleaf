import { FileText, ListTree } from "lucide-react";
import type { ProjectOutlineItem } from "../../api";

export function DocumentOutlinePanel({
  items,
  loading,
  onOpenItem
}: {
  items: ProjectOutlineItem[];
  loading: boolean;
  onOpenItem: (item: ProjectOutlineItem) => void;
}) {
  const groupedItems = groupOutlineItems(items);

  return (
    <section className="border-b border-border bg-[#f6f8fa]">
      <div className="flex h-8 items-center gap-2 border-b border-border px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <ListTree className="h-3.5 w-3.5" />
        Outline
        {items.length > 0 && <span className="ml-auto tabular-nums">{items.length}</span>}
      </div>
      <div className="max-h-52 overflow-auto py-1 text-xs">
        {loading ? (
          <div className="px-3 py-2 text-muted-foreground">Loading outline...</div>
        ) : items.length === 0 ? (
          <div className="px-3 py-2 text-muted-foreground">No sections found</div>
        ) : (
          groupedItems.map((group) => (
            <div key={group.path} className="py-1">
              <div className="flex items-center gap-1 px-3 py-1 font-medium text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <span className="truncate">{group.path}</span>
              </div>
              {group.items.map((item) => (
                <button
                  className="flex h-7 w-full min-w-0 items-center gap-2 pr-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  key={`${item.path}:${item.line}:${item.kind}:${item.title}`}
                  onClick={() => onOpenItem(item)}
                  style={{ paddingLeft: Math.min(item.level, 6) * 10 + 14 }}
                  type="button"
                >
                  <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">{item.line}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{item.title}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function groupOutlineItems(items: ProjectOutlineItem[]): Array<{ path: string; items: ProjectOutlineItem[] }> {
  const groups = new Map<string, ProjectOutlineItem[]>();
  for (const item of items) {
    groups.set(item.path, [...(groups.get(item.path) ?? []), item]);
  }
  return [...groups.entries()].map(([path, grouped]) => ({ path, items: grouped }));
}
