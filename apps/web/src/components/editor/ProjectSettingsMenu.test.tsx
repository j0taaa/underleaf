import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectSettingsMenu } from "./ProjectSettingsMenu";

const files = [
  {
    id: "main",
    projectId: "project",
    path: "main.tex",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
];

describe("ProjectSettingsMenu", () => {
  it("renders compiler and auto compile controls", () => {
    const onRootFileChange = vi.fn();
    const onCompileEngineChange = vi.fn();
    const onAutoCompileChange = vi.fn();

    render(
      <ProjectSettingsMenu
        rootFilePath="main.tex"
        compileEngine="pdflatex"
        autoCompile={false}
        files={files}
        updating={false}
        onRootFileChange={onRootFileChange}
        onCompileEngineChange={onCompileEngineChange}
        onAutoCompileChange={onAutoCompileChange}
      />
    );

    fireEvent.click(screen.getByTitle("Project settings"));
    fireEvent.change(screen.getByLabelText("Compiler"), { target: { value: "xelatex" } });
    fireEvent.click(screen.getByRole("checkbox"));

    expect(onCompileEngineChange).toHaveBeenCalledWith("xelatex");
    expect(onAutoCompileChange).toHaveBeenCalledWith(true);
  });
});
