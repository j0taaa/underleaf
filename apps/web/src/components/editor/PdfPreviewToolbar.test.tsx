import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PdfPreviewToolbar } from "./PdfPreviewToolbar";

describe("PdfPreviewToolbar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders page navigation, zoom controls, and download link for loaded PDFs", () => {
    const onPageChange = vi.fn();
    const onScaleChange = vi.fn();
    const onReload = vi.fn();

    render(
      <PdfPreviewToolbar
        hasDocument
        pageNumber={2}
        totalPages={5}
        scale={0.75}
        pdfUrl="http://localhost:3001/api/projects/project/pdf?t=1"
        onPageChange={onPageChange}
        onScaleChange={onScaleChange}
        onReload={onReload}
      />
    );

    expect(screen.getByLabelText("PDF page")).toHaveValue(2);
    expect(screen.getByText("/ 5")).toBeInTheDocument();
    expect(screen.getByTitle("Download PDF")).toHaveAttribute("href", "http://localhost:3001/api/projects/project/pdf?t=1");

    fireEvent.click(screen.getByTitle("Previous page"));
    expect(onPageChange).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByTitle("Next page"));
    expect(onPageChange).toHaveBeenCalledWith(3);

    fireEvent.change(screen.getByLabelText("PDF page"), { target: { value: "4" } });
    expect(onPageChange).toHaveBeenCalledWith(4);

    fireEvent.click(screen.getByTitle("Zoom in"));
    expect(onScaleChange).toHaveBeenCalledWith(0.9);

    fireEvent.click(screen.getByTitle("Zoom out"));
    expect(onScaleChange).toHaveBeenCalledWith(0.6);

    fireEvent.click(screen.getByText("Reload"));
    expect(onReload).toHaveBeenCalled();
  });

  it("hides PDF controls before a document is loaded", () => {
    render(
      <PdfPreviewToolbar
        hasDocument={false}
        pageNumber={1}
        totalPages={0}
        scale={0.75}
        pdfUrl="http://localhost:3001/api/projects/project/pdf?t=1"
        onPageChange={vi.fn()}
        onScaleChange={vi.fn()}
        onReload={vi.fn()}
      />
    );

    expect(screen.queryByLabelText("PDF page")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Download PDF")).not.toBeInTheDocument();
    expect(screen.getByText("Reload")).toBeInTheDocument();
  });
});
