import { useEffect, useRef, useState } from "react";
import type React from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

type TextHit = {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export function PdfPageCanvas({
  document,
  pageNumber,
  scale,
  onSourceRequest
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  onSourceRequest: (input: { page: number; x: number; y: number; text?: string }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const pageLookupRef = useRef<{ convertToPdfPoint: (x: number, y: number) => number[]; textHits: TextHit[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    renderTaskRef.current?.cancel();

    const renderPage = async () => {
      try {
        const page = await document.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;

        const deviceScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * deviceScale);
        canvas.height = Math.floor(viewport.height * deviceScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);

        const textContent = await page.getTextContent();
        const textHits = textContent.items.flatMap((item) => {
          if (!("str" in item) || !item.str.trim()) return [];
          const transform = multiplyTransforms(viewport.transform, item.transform as number[]);
          const left = transform[4];
          const top = transform[5] - item.height * scale;
          return [
            {
              text: item.str,
              left,
              top,
              right: left + item.width * scale,
              bottom: top + item.height * scale
            }
          ];
        });
        pageLookupRef.current = {
          convertToPdfPoint: (x, y) => viewport.convertToPdfPoint(x, y) as number[],
          textHits
        };

        const renderTask = page.render({ canvas, canvasContext: context, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err) {
        if (!cancelled && !(err instanceof Error && err.name === "RenderingCancelledException")) {
          setError(err instanceof Error ? err.message : "Unable to render page");
        }
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [document, pageNumber, scale]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const lookup = pageLookupRef.current;
    if (!canvas || !lookup) return;

    const rect = canvas.getBoundingClientRect();
    const viewportX = event.clientX - rect.left;
    const viewportY = event.clientY - rect.top;
    const [pdfX, pdfY] = lookup.convertToPdfPoint(viewportX, viewportY);
    const hit = findNearestTextHit(lookup.textHits, viewportX, viewportY);
    onSourceRequest({ page: pageNumber, x: pdfX, y: pdfY, text: hit?.text });
  };

  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="max-w-full overflow-auto rounded-sm bg-white shadow-sm ring-1 ring-black/10">
        <canvas ref={canvasRef} className="cursor-crosshair" onClick={handleClick} />
      </div>
      <figcaption className="text-xs text-muted-foreground">{pageNumber}</figcaption>
      {error && <div className="max-w-full rounded-md bg-destructive px-3 py-2 text-xs text-destructive-foreground">{error}</div>}
    </figure>
  );
}

function multiplyTransforms(first: number[], second: number[]): number[] {
  return [
    first[0] * second[0] + first[2] * second[1],
    first[1] * second[0] + first[3] * second[1],
    first[0] * second[2] + first[2] * second[3],
    first[1] * second[2] + first[3] * second[3],
    first[0] * second[4] + first[2] * second[5] + first[4],
    first[1] * second[4] + first[3] * second[5] + first[5]
  ];
}

function findNearestTextHit(textHits: TextHit[], x: number, y: number): TextHit | null {
  let nearest: { hit: TextHit; distance: number } | null = null;
  for (const hit of textHits) {
    const dx = x < hit.left ? hit.left - x : x > hit.right ? x - hit.right : 0;
    const dy = y < hit.top ? hit.top - y : y > hit.bottom ? y - hit.bottom : 0;
    const distance = Math.hypot(dx, dy);
    if (!nearest || distance < nearest.distance) nearest = { hit, distance };
  }
  return nearest && nearest.distance <= 24 ? nearest.hit : null;
}
