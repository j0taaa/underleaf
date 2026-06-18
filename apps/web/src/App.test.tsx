import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("@monaco-editor/react", () => ({
  default: () => <div data-testid="monaco-editor" />
}));

vi.mock("./authClient", () => ({
  authClient: {
    useSession: () => ({
      data: {
        user: {
          id: "test-user",
          email: "test@example.com",
          name: "Test User"
        }
      },
      isPending: false,
      refetch: vi.fn()
    }),
    signOut: vi.fn(async () => ({ data: null, error: null }))
  }
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

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });

    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Underleaf")).toBeInTheDocument();
    expect(await screen.findByText("Create project")).toBeInTheDocument();
  });
});
