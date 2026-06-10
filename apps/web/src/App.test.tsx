import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("@monaco-editor/react", () => ({
  default: () => <div data-testid="monaco-editor" />
}));

describe("App", () => {
  it("renders the project dashboard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => []
      }))
    );

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("Underleaf")).toBeInTheDocument();
    expect(await screen.findByText("Create project")).toBeInTheDocument();
  });
});
