"use client";
import { useEffect, useState } from "react";
import { ACCENTS, TEMPLATES, type Doc, type Template } from "@/lib/model";
import { DEFAULT_ACCENT } from "@/lib/pdf";
import { thumbnailDoc } from "@/lib/sample";
import { Check, Select, useForm } from "./fields";

async function renderThumb(doc: Doc): Promise<string> {
  const [{ buildPdf }, pdfjs] = await Promise.all([import("@/lib/pdf"), import("pdfjs-dist")]);
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
  const bytes = await buildPdf(doc);
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 0.42 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
  void task.destroy();
  return canvas.toDataURL("image/png");
}

export function DesignPanel() {
  const { doc, setNow } = useForm();
  const [thumbs, setThumbs] = useState<Partial<Record<Template, string>>>({});
  const { docType } = doc;
  const { accent } = doc.design;
  const { logo } = doc.business;

  // Thumbnails show the real layouts, redrawn only when something visible in them changes.
  useEffect(() => {
    let stale = false;
    (async () => {
      for (const key of Object.keys(TEMPLATES) as Template[]) {
        const url = await renderThumb(thumbnailDoc(docType, key, accent, logo));
        if (stale) return;
        setThumbs((t) => ({ ...t, [key]: url }));
      }
    })().catch(() => { /* the labels still work without thumbnails */ });
    return () => { stale = true; };
  }, [docType, accent, logo]);

  const effective = accent || DEFAULT_ACCENT[doc.template];
  return (
    <div className="design">
      <div className="tpl-strip" role="radiogroup" aria-label="Template">
        {(Object.entries(TEMPLATES) as [Template, string][]).map(([key, name]) => (
          <button key={key} type="button" role="radio" aria-checked={doc.template === key} className="tpl" onClick={() => setNow("template", key)}>
            <span className="tpl-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {thumbs[key] && <img src={thumbs[key]} alt="" />}
            </span>
            <span className="tpl-name">{name}</span>
          </button>
        ))}
      </div>
      <div className="design-row">
        <div className="swatches" role="radiogroup" aria-label="Accent colour">
          <button type="button" role="radio" aria-checked={!accent} aria-label="Template colour" className="swatch swatch-auto" style={{ "--c": DEFAULT_ACCENT[doc.template] } as React.CSSProperties} onClick={() => setNow("design.accent", "")} />
          {ACCENTS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={accent === c} aria-label={`Colour ${c}`} className="swatch" style={{ "--c": c } as React.CSSProperties} onClick={() => setNow("design.accent", c)} />
          ))}
          <label className="swatch swatch-custom" title="Custom colour">
            <span className="sr-only">Custom colour</span>
            <input type="color" value={effective} onChange={(e) => setNow("design.accent", e.target.value)} />
          </label>
        </div>
        <details className="popover">
          <summary className="btn outline sm">Page options</summary>
          <div className="popover-body">
            <div className="grid-2">
              <Select path="meta.paper" label="Paper size" options={[["a4", "A4"], ["letter", "US Letter"]]} />
              <Select path="meta.copies" label="Document copies" options={[["original", "Original only"], ["duplicate", "Original + Duplicate"], ["triplicate", "Original + Duplicate + Triplicate"]]} />
            </div>
            <Check path="design.showWords" label="Amount in words" />
            <Check path="design.showHsnSummary" label="HSN tax summary" />
            <Check path="design.showSignatures" label="Signature lines" />
            <Check path="design.showStamp" label="PAID or CANCELLED mark from status" />
            {doc.bank.upiId && doc.meta.currency === "INR" && <Check path="bank.upiQr" label="UPI QR code with the amount filled in" />}
          </div>
        </details>
      </div>
    </div>
  );
}
