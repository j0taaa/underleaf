import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectSearchPanel } from "./ProjectSearchPanel";

describe("ProjectSearchPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows replace controls and triggers replace all when matches exist", () => {
    const onQueryChange = vi.fn();
    const onReplacementChange = vi.fn();
    const onReplaceAll = vi.fn();

    render(
      <ProjectSearchPanel
        query="alpha"
        replacement="beta"
        results={[
          {
            fileId: "file-1",
            path: "main.tex",
            line: 3,
            column: 4,
            preview: "Alpha text"
          }
        ]}
        searching={false}
        replacing={false}
        replaceSummary="1 match replaced in 1 file."
        onQueryChange={onQueryChange}
        onReplacementChange={onReplacementChange}
        onReplaceAll={onReplaceAll}
        onOpenResult={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Search project")).toHaveValue("alpha");
    expect(screen.getByLabelText("Replace in project")).toHaveValue("beta");
    expect(screen.getByText("1 match replaced in 1 file.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Replace in project"), { target: { value: "gamma" } });
    expect(onReplacementChange).toHaveBeenCalledWith("gamma");

    fireEvent.click(screen.getByTitle("Replace all matches"));
    expect(onReplaceAll).toHaveBeenCalled();
  });

  it("disables replace all without matches", () => {
    render(
      <ProjectSearchPanel
        query="alpha"
        replacement="beta"
        results={[]}
        searching={false}
        replacing={false}
        replaceSummary={null}
        onQueryChange={vi.fn()}
        onReplacementChange={vi.fn()}
        onReplaceAll={vi.fn()}
        onOpenResult={vi.fn()}
      />
    );

    expect(screen.getByTitle("Replace all matches")).toBeDisabled();
  });
});
