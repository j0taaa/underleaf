import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportProjectForm } from "./ImportProjectForm";

describe("ImportProjectForm", () => {
  it("opens the import modal from an icon button", () => {
    render(<ImportProjectForm importing={false} onImport={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Import project"));
    expect(screen.getByText("Import project")).toBeInTheDocument();
    expect(screen.getByLabelText("Imported project name")).toBeInTheDocument();
    expect(screen.getByLabelText("Project archive")).toBeInTheDocument();
  });
});
