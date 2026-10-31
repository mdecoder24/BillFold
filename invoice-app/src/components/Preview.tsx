"use client";
import { useEffect, useRef, useState } from "react";

const ZOOMS = [["fit", "Fit"], ["75", "75%"], ["100", "100%"]] as const;
type Zoom = (typeof ZOOMS)[number][0];

export function Preview({ bytes, error, sample, updating }: { bytes: ArrayBuffer | null; error: string; sample: boolean; updating: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    if (!bytes) return;
    let stale = false;
    let destroy: (() => void) | undefined;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (stale) return;
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
      const task = pdfjs.getDocument({ data: bytes.slice(0), isEvalSupported: false });
      destroy = () => void task.destroy();
      const pdf = await task.promise;
      const fragment = document.createDocumentFragment();
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        if (stale) return;
        const viewport = page.getViewport({ scale: 2 });
        const sheet = document.createElement("section");
        sheet.className = "sheet";
        sheet.setAttribute("aria-label", `Page ${n} of ${pdf.numPages}`);
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.setAttribute("aria-hidden", "true");
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
        const text = await page.getTextContent();
        const reader = document.createElement("p");
        reader.className = "sr-only";
        reader.textContent = text.items.map((i) => ("str" in i ? i.str : "")).join(" ");
        sheet.append(canvas, reader);
        fragment.append(sheet);
      }
      if (stale) return;
      // Swap only once every page is painted, so the preview never flashes empty while typing.
      host.current?.replaceChildren(fragment);
      setPages(pdf.numPages);
      setRenderError("");
    })().catch((err) => {
      if (!stale) setRenderError(err instanceof Error ? err.message : "Please retry.");
    });
    return () => {
      stale = true;
      destroy?.();
    };
  }, [bytes]);

  const shown = error || renderError;
  return (
    <div className="preview" aria-label="Document preview">
      <div className="preview-bar">
        <div className="segmented" role="group" aria-label="Preview zoom">
          {ZOOMS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={zoom === key} onClick={() => setZoom(key)}>{label}</button>
          ))}
        </div>
        {sample && <span className="chip">Sample items shown</span>}
        <span role="status" className="muted small">{updating ? "Updating…" : pages ? `${pages} ${pages === 1 ? "page" : "pages"}` : "Preparing…"}</span>
      </div>
      {shown && <p role="alert" className="alert">Preview unavailable: {shown}</p>}
      <div className="preview-scroll" tabIndex={0} aria-label="PDF pages, scroll to view more">
        <div ref={host} className="sheets" data-updating={updating || undefined} style={{ "--sheet": zoom === "fit" ? "100%" : zoom === "75" ? "595px" : "794px" } as React.CSSProperties} />
      </div>
    </div>
  );
}
