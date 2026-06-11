import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectFileWithContent } from "../../api";
import { OpenFileTabs } from "./OpenFileTabs";

const files = [
  {
    id: "main",
    projectId: "project",
    path: "main.tex",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "chapter",
    projectId: "project",
    path: "chapters/intro.tex",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
];

describe("OpenFileTabs", () => {
  it("renders open file tabs and dispatches open and close actions", () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const activeFile: ProjectFileWithContent = { ...files[0], content: "hello" };

    render(
      <OpenFileTabs
        files={files}
        activeFile={activeFile}
        openFileIds={["main", "chapter"]}
        dirtyFileId="chapter"
        onOpen={onOpen}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "intro.tex" }));
    expect(onOpen).toHaveBeenCalledWith(files[1]);

    fireEvent.click(screen.getAllByTitle("Close tab")[1]);
    expect(onClose).toHaveBeenCalledWith("chapter");

    expect(screen.getByTitle("Unsaved changes")).toBeInTheDocument();
  });
});
