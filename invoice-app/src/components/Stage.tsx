"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { TEMPLATES, type Template } from "@/lib/model";
import { LogoMark } from "./Logo";

const OPEN = "/invoice";

const TEMPLATE_NOTES: Record<Template, string> = {
  gst: "A boxed ledger, the familiar format for GST invoices.",
  classic: "A centred letterhead with a formal, banded table.",
  modern: "Open and quiet, with a large title and no boxes.",
  bold: "A full-colour header with the amount due up top.",
  sidebar: "Your details and payment in a side column.",
};
const TEMPLATE_ORDER: Template[] = ["gst", "classic", "modern", "bold", "sidebar"];

const SCREENS = [
  { key: "editor", title: "Write on the left. See it on the right.", body: "Every change redraws the real PDF beside your form, so what you see is what you send.", alt: "The invoice editor with a live PDF preview." },
  { key: "documents", title: "See what you're owed.", body: "Billed, received, outstanding and overdue totals sit above every document you've saved.", alt: "The Documents page with totals and saved invoices." },
  { key: "company", title: "Set up your company once.", body: "GST registration, logo, signature, stamp and bank details carry into every new document.", alt: "The Company page with GST registration options." },
];

const opacity = (p: number, a: number, b: number, first: boolean, last: boolean) => {
  const fade = 0.016;
  const inn = first ? 1 : Math.min(1, Math.max(0, (p - a) / fade));
  const out = last ? 1 : Math.min(1, Math.max(0, (b - p) / fade));
  return Math.min(inn, out);
};

export function Stage() {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let stale = false;
    const root = document.documentElement;
    const start = async () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { delete root.dataset.stage; return; }
      root.dataset.stage = "3d";
      try {
        const { BEATS, createShowcase } = await import("@/lib/scene");
        if (stale || !section.current || !canvas.current) return;
        const el = section.current;
        const chapters = [...el.querySelectorAll<HTMLElement>("[data-chapter]")].map((node) => {
          const [kind, n] = (node.dataset.chapter as string).split(":");
          const range = kind === "hero" ? BEATS.hero : kind === "end" ? BEATS.end : kind === "template" ? BEATS.template(Number(n)) : BEATS.screen(Number(n));
          return { node, range, first: kind === "hero", last: kind === "end" };
        });
        const hint = el.querySelector<HTMLElement>(".stage-hint");
        const target = () => {
          const rect = el.getBoundingClientRect();
          const travel = rect.height - window.innerHeight;
          return travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 0;
        };
        const show = await createShowcase(canvas.current, {
          target,
          onFrame: (p) => {
            for (const c of chapters) {
              const o = opacity(p, c.range[0], c.range[1], c.first, c.last);
              c.node.style.opacity = String(o);
              c.node.style.transform = `translateY(${(1 - o) * 12}px)`;
              c.node.style.visibility = o < 0.02 ? "hidden" : "visible";
            }
            if (hint) hint.style.opacity = p < 0.015 ? "1" : "0";
          },
        });
        dispose = show.dispose;
        if (stale) show.dispose();
      } catch {
        // No WebGL or the scene failed: the page falls back to its plain layout.
        delete root.dataset.stage;
      }
    };
    void start();
    return () => {
      stale = true;
      dispose?.();
      delete root.dataset.stage;
    };
  }, []);

  return (
    <section ref={section} className="stage" aria-label={`${APP_NAME} showcase`}>
      <span id="templates" className="stage-anchor" />
      <div className="stage-pin">
        <div ref={canvas} className="stage-canvas" aria-hidden />

        <div className="chapter chapter-hero" data-chapter="hero">
          <h1>GST invoices, ready in minutes, right in your browser.</h1>
          <p className="land-lead">{APP_NAME} creates tax invoices, quotations, receipts and more, with your logo and GST details. It&apos;s free, needs no account and adds no watermark.</p>
          <div className="land-actions">
            <Link href={OPEN} className="btn primary land-cta">Open {APP_NAME} <ArrowRight size={17} aria-hidden /></Link>
            <a href="#features" className="btn outline land-cta">See all features</a>
          </div>
        </div>

        {TEMPLATE_ORDER.map((key, i) => (
          <div key={key} className="chapter chapter-item" data-chapter={`template:${i}`}>
            <p className="chapter-kicker">Template {i + 1} of 5</p>
            <h2>{TEMPLATES[key]}</h2>
            <p className="land-lead">{TEMPLATE_NOTES[key]} Any colour you like.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="chapter-img" src={`/landing/tpl-${key}.jpg`} width={1190} height={1684} loading="lazy" alt={`Sample invoice in the ${TEMPLATES[key]} template.`} />
          </div>
        ))}

        {SCREENS.map((s, i) => (
          <div key={s.key} className="chapter chapter-item" data-chapter={`screen:${i}`}>
            <p className="chapter-kicker">Inside {APP_NAME}</p>
            <h2>{s.title}</h2>
            <p className="land-lead">{s.body}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="chapter-img chapter-img-wide" src={`/landing/${s.key}.jpg`} width={1440} height={900} loading="lazy" alt={s.alt} />
          </div>
        ))}

        <div className="chapter chapter-item chapter-end" data-chapter="end">
          <span className="chapter-logo"><LogoMark size={56} /></span>
          <h2>All your billing, folded into one place.</h2>
          <div className="land-actions">
            <Link href={OPEN} className="btn primary land-cta">Open {APP_NAME} <ArrowRight size={17} aria-hidden /></Link>
          </div>
        </div>

        <p className="stage-hint small muted" aria-hidden>Scroll to explore</p>
      </div>
    </section>
  );
}
