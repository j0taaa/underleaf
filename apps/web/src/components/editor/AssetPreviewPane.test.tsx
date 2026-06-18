import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssetPreviewPane } from "./AssetPreviewPane";

describe("AssetPreviewPane", () => {
  it("renders an image asset preview and download link", () => {
    render(
      <AssetPreviewPane
        projectId="project"
        file={{
          id: "logo",
          projectId: "project",
          path: "figures/logo.png",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }}
      />
    );

    expect(screen.getByRole("img", { name: "figures/logo.png" })).toHaveAttribute(
      "src",
      "/api/projects/project/files/logo/raw"
    );
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "/api/projects/project/files/logo/raw"
    );
  });
});
