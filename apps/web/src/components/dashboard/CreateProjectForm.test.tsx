import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateProjectForm } from "./CreateProjectForm";

describe("CreateProjectForm", () => {
  it("opens a modal and previews the selected template", () => {
    render(<CreateProjectForm onCreate={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Create project"));
    expect(screen.getByRole("form", { name: "Create project" })).toBeInTheDocument();
    expect(screen.getByText("Article template")).toBeInTheDocument();
    expect(screen.getByText(/\\documentclass\{article}/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Template"), { target: { value: "beamer" } });
    expect(screen.getByText("Beamer template")).toBeInTheDocument();
    expect(screen.getByText(/\\documentclass\{beamer}/)).toBeInTheDocument();
  });
});
