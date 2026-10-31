"use client";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronDown, Copy, Mail, MessageCircle, Plus, Printer, Share2, SlidersHorizontal, Trash2 } from "lucide-react";
import {
  blankDoc, blankItem, DOC_TYPES, GST_TYPES, normalizeDoc, PAYMENT_METHODS, PAYMENT_TERMS, STATUSES, SUPPLY_TYPES,
  type Company, type Doc, type DocType, type Item, type Product, type Status, type Template,
} from "@/lib/model";
import { pathFor } from "@/lib/routes";
import { previewDoc } from "@/lib/sample";
import { mailLink, shareMessage, whatsappLink } from "@/lib/share";
import {
  addDaysTo, applyCompany, clearDraft, downloadBlob, getDoc, loadClients, loadCompany, loadProducts, nextNumber, putDoc, readDraft, readTemplate,
  recoveryOn, rememberFromDoc, saveCompany, setRecovery, writeDraft, writeTemplate, type Client,
} from "@/lib/storage";
import { computeTotals, money } from "@/lib/totals";
import { GST_STATES, validateDoc, type Errors } from "@/lib/validate";
import { DesignPanel } from "./DesignPanel";
import { Check, Disclosure, Field, FormCtx, ImageField, Select, setIn } from "./fields";
import { Preview } from "./Preview";

const COUNTRIES = [["", "Not specified"], ["IN", "India"], ["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["DE", "Germany"]] as const;
const PRIORITY = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "AED"];
const NOTE_PRESETS = ["Thank you for your business.", "Please quote the invoice number when paying.", "Goods once sold will not be taken back.", "Interest at 18% a year applies to overdue amounts.", "Subject to local jurisdiction."];

function currencies(): [string, string][] {
  const names = new Intl.DisplayNames(["en"], { type: "currency" });
  const all = Intl.supportedValuesOf("currency");
  return [...PRIORITY, ...all.filter((c) => !PRIORITY.includes(c))].map((c) => [c, `${c} — ${names.of(c)}`]);
}

const dueLabel = (type: DocType) =>
  type === "purchase-order" ? "Expected delivery" : ["quotation", "estimate", "project-estimate"].includes(type) ? "Valid until" : "Due date";

function Items({ errors, showAll, touched, touch, onChange, currency, doc, products, defaultTax, hideTax }: {
  errors: Errors; showAll: boolean; touched: Set<string>; touch: (p: string) => void; onChange: (items: Item[]) => void;
  currency: string; doc: Doc; products: Product[]; defaultTax: number | null; hideTax: boolean;
}) {
  const [undo, setUndo] = useState<{ item: Item; index: number } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const items = doc.items;
  const patch = (id: string, change: Partial<Item>) => onChange(items.map((it) => (it.id === id ? { ...it, ...change } : it)));
  const add = () => {
    const it = { ...blankItem(), taxRate: defaultTax };
    onChange([...items, it]);
    setTimeout(() => document.getElementById(`item-${it.id}-description`)?.focus(), 0);
  };
  const move = (i: number, by: number) => {
    const next = [...items];
    const [it] = next.splice(i, 1);
    next.splice(i + by, 0, it);
    onChange(next);
  };
  return (
    <div className="items">
      {items.map((it, i) => {
        const key = (f: string) => `item.${it.id}.${f}`;
        const err = (f: string) => (showAll || touched.has(key(f)) ? errors[key(f)] : undefined);
        const num = (f: "quantity" | "rate" | "taxRate" | "discount" | "cess", label: string) => (
          <div className="field">
            <label htmlFor={`item-${it.id}-${f}`}>{label}</label>
            <input id={`item-${it.id}-${f}`} type="number" step="any" min="0" inputMode="decimal" value={it[f] ?? ""} aria-invalid={!!err(f) || undefined}
              list={f === "taxRate" ? "tax-rates" : undefined} onBlur={() => touch(key(f))}
              onChange={(e) => patch(it.id, { [f]: e.target.value === "" ? null : Number(e.target.value) })} />
            {err(f) && <p className="err">{err(f)}</p>}
          </div>
        );
        const open = expanded.has(it.id) || !!it.details || !!it.discount || !!it.cess || showAll;
        const amount = (it.quantity ?? 0) * (it.rate ?? 0) * (1 - (it.discount ?? 0) / 100);
        return (
          <div className="item" key={it.id}>
            <div className="item-head">
              <div className="field grow">
                <label htmlFor={`item-${it.id}-description`}>Item {i + 1} description<span className="req" aria-hidden> *</span></label>
                <input id={`item-${it.id}-description`} list="product-list" value={it.description} aria-invalid={!!err("description") || undefined} placeholder="What did you sell or do?"
                  onBlur={() => touch(key("description"))} onChange={(e) => {
                    const found = products.find((p) => p.description === e.target.value);
                    patch(it.id, found ? { description: found.description, details: found.details, unit: found.unit, rate: found.rate, hsn: found.hsn, taxRate: found.taxRate } : { description: e.target.value });
                  }} />
                {err("description") && <p className="err">{err("description")}</p>}
              </div>
            </div>
            <div className="item-nums">
              {num("quantity", "Quantity")}
              <div className="field">
                <label htmlFor={`item-${it.id}-unit`}>Unit</label>
                <input id={`item-${it.id}-unit`} maxLength={20} value={it.unit} onChange={(e) => patch(it.id, { unit: e.target.value })} />
              </div>
              {num("rate", `Rate (${currency})`)}
              {!hideTax && num("taxRate", "Tax Rate (%)")}
              <div className="field">
                <label htmlFor={`item-${it.id}-hsn`}>HSN/SAC</label>
                <input id={`item-${it.id}-hsn`} inputMode="numeric" value={it.hsn} aria-invalid={!!err("hsn") || undefined}
                  onBlur={() => touch(key("hsn"))} onChange={(e) => patch(it.id, { hsn: e.target.value })} />
                {err("hsn") && <p className="err">{err("hsn")}</p>}
              </div>
            </div>
            {open && (
              <div className="item-more">
                <div className="field span">
                  <label htmlFor={`item-${it.id}-details`}>Details</label>
                  <textarea id={`item-${it.id}-details`} rows={2} value={it.details} onChange={(e) => patch(it.id, { details: e.target.value })} />
                </div>
                {num("discount", "Item discount (%)")}
                {!hideTax && num("cess", "Cess (%)")}
              </div>
            )}
            <div className="item-foot">
              <span className="small muted">Amount before tax <strong className="num item-amount">{money(amount, currency)}</strong></span>
              <span className="item-tools">
                <button type="button" className="icon-btn" aria-label={`More options for item ${i + 1}`} aria-expanded={open} title="Details, discount, cess"
                  onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })}><SlidersHorizontal size={16} aria-hidden /></button>
                <button type="button" className="icon-btn" aria-label={`Move item ${i + 1} up`} title="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} aria-hidden /></button>
                <button type="button" className="icon-btn" aria-label={`Move item ${i + 1} down`} title="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} aria-hidden /></button>
                <button type="button" className="icon-btn" aria-label={`Duplicate item ${i + 1}`} title="Duplicate" onClick={() => {
                  const copy = { ...it, id: blankItem().id };
                  onChange([...items.slice(0, i + 1), copy, ...items.slice(i + 1)]);
                }}><Copy size={16} aria-hidden /></button>
                <button type="button" className="icon-btn" aria-label={`Remove item ${i + 1}`} title="Remove" onClick={() => {
                  setUndo({ item: it, index: i });
                  onChange(items.filter((x) => x.id !== it.id));
                }}><Trash2 size={16} aria-hidden /></button>
              </span>
            </div>
          </div>
        );
      })}
      {undo && (
        <p role="status" className="undo">
          Item removed.
          <button type="button" className="btn outline sm" onClick={() => {
            const at = Math.min(undo.index, items.length);
            onChange([...items.slice(0, at), undo.item, ...items.slice(at)]);
            setUndo(null);
          }}>Undo</button>
        </p>
      )}
      <button type="button" className="btn outline wide" onClick={add}><Plus size={16} aria-hidden /> Add item</button>
      <datalist id="tax-rates">{[0, 3, 5, 12, 18, 28, 40].map((r) => <option key={r} value={r} />)}</datalist>
      <datalist id="product-list">{products.map((p) => <option key={p.id} value={p.description} />)}</datalist>
    </div>
  );
}

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      <header className="card-head"><h2>{title}</h2>{aside}</header>
      {children}
    </section>
  );
}

export function Editor({ docType: initialType, template }: { docType: DocType; template?: Template }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [openAll, setOpenAll] = useState(0);
  const [recovery, setRecoveryState] = useState(false);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [pdfError, setPdfError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [company, setCompany] = useState<Company | null>(null);
  const [editFrom, setEditFrom] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [confirmLoad, setConfirmLoad] = useState(false);
  const [hasTemplate, setHasTemplate] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const buildSeq = useRef(0);
  const instant = useRef(false);
  const savedJson = useRef("");

  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3600);
  }, []);

  const fresh = useCallback(async (type: DocType) => {
    let d = blankDoc(type);
    if (template) d.template = template;
    try {
      const c = loadCompany();
      if (c) { d = applyCompany(d, c); if (template) d.template = template; }
    } catch { /* a broken profile shouldn't block a new document */ }
    d.meta.number = await nextNumber(type, d.meta.date);
    return d;
  }, [template]);

  const refreshLibraries = useCallback(() => {
    try { setCompany(loadCompany()); setClients(loadClients()); setProducts(loadProducts()); } catch { /* unreadable storage is treated as empty */ }
  }, []);

  // The document starts on mount, because dates, storage and numbering only exist in the browser.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      refreshLibraries();
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      const from = params.get("from");
      const clientId = params.get("client");
      let start: Doc | null = null;
      try {
        setRecoveryState(recoveryOn());
        if (id) start = await getDoc(id);
        else if (from) {
          const source = await getDoc(from);
          if (source) {
            start = normalizeDoc({ ...source, id: "", status: "draft", updatedAt: "" }, initialType);
            start.docType = initialType;
            start.meta.date = blankDoc(initialType).meta.date;
            start.meta.due = blankDoc(initialType).meta.due;
            start.meta.number = await nextNumber(initialType, start.meta.date);
            if (initialType === "credit-note" || initialType === "debit-note") {
              start.meta.originalRef = source.meta.number;
              start.meta.originalDate = source.meta.date;
            }
          }
        } else {
          start = readDraft(initialType);
          // A draft with nothing typed into it shouldn't hide company details saved since.
          if (start && !start.items.length && !start.client.organization.trim() && !start.business.name.trim()) start = null;
          else if (start && !start.business.name.trim()) {
            const c = loadCompany();
            if (c) start = { ...start, business: c.business, bank: c.bank };
          }
        }
        if (start && !id && !from) setDraftNote("Draft restored");
      } catch {
        setDraftNote("Saved data couldn't be read. Starting fresh.");
      }
      if (!start) start = await fresh(initialType);
      if (clientId && !id) {
        try {
          const found = loadClients().find((c) => c.id === clientId);
          if (found) { const { id: _id, ...client } = found; start = { ...start, client }; }
        } catch { /* unreadable storage is treated as empty */ }
      }
      if (cancelled) return;
      savedJson.current = start.id ? JSON.stringify(start) : "";
      setDoc(start);
    })();
    return () => { cancelled = true; };
  }, [initialType, fresh, refreshLibraries]);

  const docType = doc?.docType ?? initialType;
  useEffect(() => { try { setHasTemplate(!!readTemplate(docType)); } catch { setHasTemplate(false); } }, [docType]);

  const sample = !!doc && !doc.items.length;

  // Rebuild the PDF and keep the draft. Options apply at once; typing waits for a pause. Stale builds are discarded.
  useEffect(() => {
    if (!doc) return;
    const seq = ++buildSeq.current;
    setUpdating(true);
    const delay = instant.current ? 0 : 320;
    instant.current = false;
    const timer = setTimeout(async () => {
      if (!doc.id) {
        try { writeDraft(doc); setDraftNote(recoveryOn() ? "Draft saved on this device" : "Draft kept in this tab"); }
        catch { setDraftNote("Couldn't keep a draft. Download your PDF before leaving."); }
      }
      try {
        const { buildPdf } = await import("@/lib/pdf");
        const out = await buildPdf(previewDoc(doc).doc);
        if (seq === buildSeq.current) { setBytes(out); setPdfError(""); setUpdating(false); }
      } catch (err) {
        if (seq === buildSeq.current) { setPdfError(err instanceof Error ? err.message : "The PDF couldn't be built."); setUpdating(false); }
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [doc]);

  const set = useCallback((path: string, value: unknown) => setDoc((d) => (d ? setIn(d, path, value) : d)), []);
  const setNow = useCallback((path: string, value: unknown) => { instant.current = true; set(path, value); }, [set]);
  const touch = useCallback((path: string) => setTouched((s) => (s.has(path) ? s : new Set(s).add(path))), []);
  const errors = useMemo(() => (doc ? validateDoc(doc) : {}), [doc]);
  const error = useCallback((p: string) => (showAll || touched.has(p) ? errors[p] : undefined), [errors, showAll, touched]);
  const ctx = useMemo(() => (doc ? { doc, set, setNow, error, touch } : null), [doc, set, setNow, error, touch]);
  const totals = useMemo(() => (doc ? computeTotals(doc) : null), [doc]);
  const currencyOptions = useMemo(() => (doc ? currencies() : []), [!!doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!doc?.id && JSON.stringify(doc) !== savedJson.current;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!doc || !ctx || !totals) return <div className="editor-skeleton" aria-busy="true" aria-label="Loading editor" />;

  const label = DOC_TYPES[docType];
  const cur = doc.meta.currency;
  const india = doc.business.country === "IN" || (!doc.business.country && cur === "INR");
  const registered = doc.business.gstType === "regular";
  const taxOff = totals.mode === "none" && (doc.meta.supplyType !== "regular" || (india && !registered));
  const due = dueLabel(docType);
  const partyTitle = docType === "purchase-order" ? "Supplier" : docType === "delivery-challan" ? "Consignee" : "Bill to";
  const fromTitle = docType === "purchase-order" ? "From (buyer)" : "From";
  const isNote = docType === "credit-note" || docType === "debit-note";
  const defaultTax = company?.settings.taxRate ?? (cur === "INR" ? 18 : null);
  const showFrom = editFrom || !doc.business.name.trim() || openAll > 0;
  const hasExtra = (k: string, value: unknown) => extras.has(k) || (value !== null && value !== "" && value !== undefined);
  const addExtra = (k: string) => setExtras((s) => new Set(s).add(k));

  const switchType = async (type: DocType) => {
    instant.current = true;
    const number = await nextNumber(type, doc.meta.date);
    setDoc({ ...doc, docType: type, id: "", status: "draft", updatedAt: "", meta: { ...doc.meta, number, due: type === "receipt" ? "" : doc.meta.due || blankDoc(type).meta.due, paymentMethod: type === "receipt" ? doc.meta.paymentMethod || "Cash" : doc.meta.paymentMethod } });
    savedJson.current = "";
    window.history.replaceState(null, "", pathFor(type));
  };

  const pdfBlob = async () => {
    const { buildPdf, documentFilename } = await import("@/lib/pdf");
    return { blob: new Blob([await buildPdf(doc)], { type: "application/pdf" }), name: documentFilename(doc) };
  };
  const download = async () => {
    try { const { blob, name } = await pdfBlob(); downloadBlob(blob, name); }
    catch (err) { notify(err instanceof Error ? err.message : "The PDF couldn't be built."); }
  };
  const closeMenus = () => document.querySelectorAll<HTMLDetailsElement>("details.menu[open]").forEach((d) => { d.open = false; });
  const sendVia = async (link: string) => {
    closeMenus();
    await download();
    notify("PDF downloaded. Attach it to your message.");
    window.open(link, "_blank", "noopener");
  };
  const nativeShare = async () => {
    closeMenus();
    try {
      const { blob, name } = await pdfBlob();
      const file = new File([blob], name, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: shareMessage(doc) });
      else { downloadBlob(blob, name); notify("Sharing isn't available here, so the PDF was downloaded."); }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) notify("The PDF couldn't be shared.");
    }
  };
  const printPdf = async () => {
    closeMenus();
    try {
      const { blob } = await pdfBlob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) { notify(err instanceof Error ? err.message : "The PDF couldn't be built."); }
  };

  const save = async () => {
    if (busy) return;
    if (Object.keys(errors).length) {
      setShowAll(true); setView("edit"); setOpenAll((k) => k + 1);
      notify("Fix the highlighted fields to save.");
      setTimeout(() => (document.querySelector("[aria-invalid='true']") as HTMLElement | null)?.focus(), 60);
      return;
    }
    setBusy(true);
    try {
      const stored = await putDoc(doc);
      setDoc(stored);
      savedJson.current = JSON.stringify(stored);
      clearDraft(docType);
      window.history.replaceState(null, "", `${pathFor(docType)}?id=${encodeURIComponent(stored.id)}`);
      try {
        rememberFromDoc(stored);
        if (!loadCompany()) saveCompany(companyFrom(stored));
        refreshLibraries();
      } catch { /* the document is saved even if the library can't be updated */ }
      notify(`${label} saved on this device.`);
    } catch {
      notify("Saving failed. Browser storage may be full. You can still download the PDF.");
    } finally {
      setBusy(false);
    }
  };
  saveRef.current = save;

  const companyFrom = (d: Doc): Company => ({
    business: d.business, bank: d.bank, template: d.template, design: d.design, terms: d.terms, notes: d.notes, footer: d.footer,
    currency: d.meta.currency, paper: d.meta.paper, settings: company?.settings ?? { paymentDays: 15, taxRate: 18, numbering: "plain", prefix: "" },
  });
  const saveAsCompany = () => {
    try {
      const c = { ...(company ?? companyFrom(doc)), business: doc.business, bank: doc.bank };
      saveCompany(c); setCompany(c); setEditFrom(false);
      notify("Company details updated for new documents.");
    } catch { notify("Browser storage is full or unavailable."); }
  };

  const reset = async () => {
    clearDraft(docType);
    window.history.replaceState(null, "", pathFor(docType));
    instant.current = true;
    savedJson.current = "";
    setDoc(await fresh(docType)); setTouched(new Set()); setShowAll(false); setExtras(new Set());
  };

  const saveTemplate = () => {
    try { writeTemplate(doc); setHasTemplate(true); notify("Template saved on this device."); }
    catch { notify("Browser storage is full or unavailable."); }
  };
  const loadTemplate = async () => {
    setConfirmLoad(false);
    try {
      const saved = readTemplate(docType);
      if (!saved) return notify("No template saved yet.");
      const base = blankDoc(docType);
      saved.id = ""; saved.status = "draft"; saved.updatedAt = "";
      saved.meta.date = base.meta.date; saved.meta.due = base.meta.due;
      saved.meta.number = await nextNumber(docType, base.meta.date);
      window.history.replaceState(null, "", pathFor(docType));
      instant.current = true;
      savedJson.current = "";
      setDoc(saved); setTouched(new Set()); setShowAll(false);
      notify("Template loaded.");
    } catch { notify("The template couldn't be read."); }
  };

  const applyTerms = (days: string) => {
    instant.current = true;
    setDoc((d) => {
      if (!d) return d;
      const meta = { ...d.meta, paymentTerms: days };
      if (days !== "") meta.due = addDaysTo(d.meta.date, Number(days));
      return { ...d, meta };
    });
  };
  const addNote = (text: string) => set("terms", doc.terms.trim() ? `${doc.terms.trim()}\n${text}` : text);

  const actions = (saveLabel: string) => (
    <>
      <button type="button" className="btn outline" onClick={save} disabled={busy} title="Ctrl or Cmd + S">{saveLabel}</button>
      <button type="button" className="btn primary" onClick={download}>Download PDF</button>
    </>
  );

  return (
    <FormCtx.Provider value={ctx}>
      <div className="editor" data-view={view}>
        <h1 className="sr-only">{label}</h1>
        <div className="toolbar">
          <div className="type-picker">
            <label htmlFor="doc-type" className="sr-only">Document type</label>
            <select id="doc-type" value={docType} onChange={(e) => void switchType(e.target.value as DocType)}>
              {(Object.entries(DOC_TYPES) as [DocType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden />
          </div>
          <span className="toolbar-status small muted" role="status">{doc.id ? (dirty ? "Unsaved changes" : "Saved") : draftNote}</span>
          <div className="segmented mobile-only" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "edit"} onClick={() => setView("edit")}>Edit</button>
            <button type="button" aria-pressed={view === "preview"} onClick={() => setView("preview")}>Preview</button>
          </div>
          <div className="toolbar-end">
            {doc.id && (
              <select aria-label="Document status" className="status-select" value={doc.status} onChange={(e) => setNow("status", e.target.value as Status)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
              </select>
            )}
            <button type="button" className="btn ghost" onClick={reset}>New {label}</button>
            <details className="menu">
              <summary className="btn ghost">Send <ChevronDown size={14} aria-hidden /></summary>
              <div className="menu-body">
                <button type="button" onClick={() => void sendVia(whatsappLink(doc.client.phone, shareMessage(doc)))}><MessageCircle size={16} aria-hidden /> WhatsApp</button>
                <button type="button" onClick={() => void sendVia(mailLink(doc.client.email, `${label} ${doc.meta.number} from ${doc.business.name}`, shareMessage(doc)))}><Mail size={16} aria-hidden /> Email</button>
                <button type="button" onClick={() => void nativeShare()}><Share2 size={16} aria-hidden /> Share PDF</button>
                <button type="button" onClick={() => void printPdf()}><Printer size={16} aria-hidden /> Open to print</button>
              </div>
            </details>
            <div className="toolbar-actions">{actions(`Save ${label}`)}</div>
          </div>
        </div>

        <div className="panes">
          <form className="form" onSubmit={(e) => e.preventDefault()} noValidate key={openAll}>
            <div className="parties">
              <Card title={fromTitle} aside={!showFrom ? <button type="button" className="btn ghost sm" onClick={() => setEditFrom(true)}>Edit</button> : null}>
                {!showFrom ? (
                  <div className="from-summary">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {doc.business.logo && <img src={doc.business.logo} alt="" />}
                    <div>
                      <strong>{doc.business.name}</strong>
                      <p className="small muted">{doc.business.gstin ? `GSTIN ${doc.business.gstin}` : india ? GST_TYPES[doc.business.gstType] : doc.business.taxId}</p>
                      {doc.business.address && <p className="small muted clamp">{doc.business.address}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="stack-sm">
                    {!company && <p className="hint">Enter once. <Link href="/company">Set up your company</Link> to add GST, logo, signature and bank details to every new document.</p>}
                    <Field path="business.name" label="Business name" required />
                    {india && <Select path="business.gstType" label="GST registration" options={Object.entries(GST_TYPES)} />}
                    {india && registered ? <Field path="business.gstin" label="GSTIN" upper hint="Fills in your state and PAN." /> : !india && <Field path="business.taxId" label="Tax / VAT ID" />}
                    <Field path="business.address" label="Business address" area />
                    <Disclosure title="More company details" open={openAll > 0}>
                      <div className="grid">
                        <Select path="business.country" label="Country" options={COUNTRIES} />
                        <Field path="business.city" label="City" />
                        <Field path="business.state" label="State" />
                        <Field path="business.pincode" label="Postal / ZIP code" />
                        <Field path="business.phone" label="Phone" type="tel" />
                        <Field path="business.email" label="Business email" type="email" />
                        <Field path="business.website" label="Website" />
                        {india && <Field path="business.pan" label="PAN" upper />}
                        {india && <Field path="business.cin" label="CIN" upper />}
                      </div>
                      <div className="images"><ImageField kind="logo" /><ImageField kind="signature" /><ImageField kind="stamp" /></div>
                    </Disclosure>
                    {doc.business.name.trim() && (
                      <div className="row">
                        <button type="button" className="btn outline sm" onClick={saveAsCompany}>Use for all new documents</button>
                        {editFrom && <button type="button" className="btn ghost sm" onClick={() => setEditFrom(false)}>Done</button>}
                      </div>
                    )}
                  </div>
                )}
              </Card>
              <Card title={partyTitle}>
                <div className="stack-sm">
                  <Field path="client.organization" label="Company name" required list="client-list" />
                  <datalist id="client-list">{clients.map((c) => <option key={c.id} value={c.organization} />)}</datalist>
                  <ClientAutofill clients={clients} />
                  {india ? <Field path="client.gstin" label="GSTIN" upper /> : <Field path="client.taxId" label="Tax / VAT ID" />}
                  <Field path="client.address" label="Billing address" area />
                  <Disclosure title="More client details" open={openAll > 0}>
                    <div className="grid">
                      <Field path="client.contact" label="Contact name" />
                      <Select path="client.country" label="Country" options={COUNTRIES} />
                      <Field path="client.city" label="City" />
                      <Field path="client.state" label="State" />
                      <Field path="client.pincode" label="Postal / ZIP code" />
                      <Field path="client.phone" label="Phone" type="tel" />
                      <Field path="client.email" label="Client email" type="email" />
                      <Field path="client.shipping" label="Shipping address" area />
                    </div>
                  </Disclosure>
                </div>
              </Card>
            </div>

            <Card title={`${label} details`}>
              <div className="grid">
                <Field path="meta.number" label={`${label} number`} required />
                <Field path="meta.date" label={docType === "receipt" ? "Payment date" : "Issue date"} type="date" required />
                {docType !== "receipt" && docType !== "delivery-challan" && <Field path="meta.due" label={due} type="date" required={docType === "purchase-order" || docType === "quotation"} />}
                {(docType === "invoice" || docType === "debit-note" || docType === "proforma-invoice") && (
                  <div className="field">
                    <label htmlFor="payment-terms">Payment terms</label>
                    <select id="payment-terms" value={doc.meta.paymentTerms} onChange={(e) => applyTerms(e.target.value)}>
                      {PAYMENT_TERMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                )}
                <Select path="meta.currency" label="Currency" options={currencyOptions} />
                {docType === "project-estimate" && <Field path="meta.project" label="Project name" required />}
                {docType === "receipt" && <>
                  <Select path="meta.paymentMethod" label="Payment method" required options={PAYMENT_METHODS.map((m) => [m, m])} />
                  <Field path="meta.amountReceived" label="Amount received (defaults to total)" numeric />
                  <Field path="meta.paymentReference" label="Payment reference" />
                </>}
                {isNote && <>
                  <Field path="meta.originalRef" label="Original invoice number" required />
                  <Field path="meta.originalDate" label="Original invoice date" type="date" />
                  <Field path="meta.reason" label="Reason" wide placeholder="Sales return, price correction…" />
                </>}
              </div>
              <Disclosure title="More details" open={openAll > 0}>
                <div className="grid">
                  {india && <Select path="meta.placeOfSupply" label="Place of supply" options={[["", "Same as client's GSTIN state"], ...GST_STATES.map(([c, n]) => [`${c}-${n}`, `${c} — ${n}`] as [string, string])]} />}
                  {india && <Select path="meta.supplyType" label="Supply type" options={Object.entries(SUPPLY_TYPES)} />}
                  <Field path="meta.reference" label="PO / reference number" />
                  {docType !== "project-estimate" && <Field path="meta.project" label="Project name" />}
                  <Field path="meta.ewayBill" label="E-way bill number" />
                  <Field path="meta.vehicle" label="Vehicle number" upper />
                  <Field path="meta.transport" label="Transport / carrier" />
                </div>
                {india && totals.mode !== "none" && <Check path="meta.reverseCharge" label="Tax payable on reverse charge" />}
                <CustomFields />
              </Disclosure>
            </Card>

            <Card title="Products / Services">
              <Items errors={errors} showAll={showAll} touched={touched} touch={touch} doc={doc} currency={cur} products={products} defaultTax={defaultTax} hideTax={taxOff}
                onChange={(v) => setNow("items", v)} />
            </Card>

            <Card title="Tax & Discounts">
              <div className="grid">
                {!taxOff && <Select path="meta.taxMode" label="Tax structure" options={india
                  ? [["auto", `Automatic (${totals.mode === "igst" ? "IGST" : totals.mode === "split" ? "CGST + SGST" : "other tax"})`], ["split", "CGST + SGST / UTGST"], ["igst", "IGST"], ["generic", "Other tax / VAT"], ["none", "No tax"]]
                  : [["auto", "Automatic"], ["generic", "Other tax / VAT"], ["none", "No tax"]]} />}
                {totals.mode === "generic" && <Field path="totals.taxLabel" label="Tax label" />}
                {hasExtra("discount", doc.totals.discountValue) && <>
                  <Field path="totals.discountValue" label="Discount" numeric />
                  <Select path="totals.discountType" label="Discount type" options={[["percentage", "Percentage (%)"], ["flat", "Flat amount"]]} />
                  {!!doc.totals.discountValue && <Select path="totals.discountTiming" label="Apply discount" options={[["before", "Before tax (reduces taxable value)"], ["after", "After tax"]]} />}
                </>}
                {hasExtra("shipping", doc.totals.shipping) && <Field path="totals.shipping" label="Shipping" numeric />}
                {hasExtra("other", doc.totals.other) && <Field path="totals.other" label="Other charges" numeric />}
                {(doc.totals.shipping || doc.totals.other) && !taxOff ? <Field path="totals.chargesTaxRate" label="Tax on charges (%)" numeric /> : null}
                {!doc.totals.autoRound && hasExtra("round", doc.totals.roundOff) && <Field path="totals.roundOff" label="Round off" numeric />}
                {docType !== "receipt" && hasExtra("paid", doc.meta.amountReceived) && <Field path="meta.amountReceived" label="Amount paid" numeric hint="Shows a balance due on the document." />}
              </div>
              <div className="add-row">
                {!hasExtra("discount", doc.totals.discountValue) && <button type="button" className="btn ghost sm" onClick={() => addExtra("discount")}><Plus size={14} aria-hidden /> Discount</button>}
                {!hasExtra("shipping", doc.totals.shipping) && <button type="button" className="btn ghost sm" onClick={() => addExtra("shipping")}><Plus size={14} aria-hidden /> Shipping</button>}
                {!hasExtra("other", doc.totals.other) && <button type="button" className="btn ghost sm" onClick={() => addExtra("other")}><Plus size={14} aria-hidden /> Other charges</button>}
                {docType !== "receipt" && !hasExtra("paid", doc.meta.amountReceived) && <button type="button" className="btn ghost sm" onClick={() => addExtra("paid")}><Plus size={14} aria-hidden /> Amount paid</button>}
                {!doc.totals.autoRound && !hasExtra("round", doc.totals.roundOff) && <button type="button" className="btn ghost sm" onClick={() => addExtra("round")}><Plus size={14} aria-hidden /> Round off</button>}
              </div>
              <div className="checks">
                <Check path="totals.autoRound" label="Round the total to the nearest whole amount" />
                {!taxOff && <Check path="totals.taxInclusive" label="Rates already include tax" />}
              </div>
              {taxOff && <p className="hint">No tax is charged because {doc.meta.supplyType !== "regular" ? "this is an LUT supply" : `your company is ${doc.business.gstType === "composition" ? "on the composition scheme" : "not registered for GST"}`}.</p>}
              <dl className="summary num">
                <div><dt>Subtotal</dt><dd>{money(totals.subtotal, cur)}</dd></div>
                {totals.discount > 0 && <div><dt>Discount</dt><dd>-{money(totals.discount, cur)}</dd></div>}
                {totals.mode === "split" && <><div><dt>CGST</dt><dd>{money(totals.central, cur)}</dd></div><div><dt>SGST</dt><dd>{money(totals.state, cur)}</dd></div></>}
                {totals.mode !== "split" && <div><dt>{totals.mode === "igst" ? "IGST" : "Tax"}</dt><dd>{money(totals.tax, cur)}</dd></div>}
                {totals.cess > 0 && <div><dt>Cess</dt><dd>{money(totals.cess, cur)}</dd></div>}
                {totals.shipping + totals.other > 0 && <div><dt>Charges</dt><dd>{money(totals.shipping + totals.other, cur)}</dd></div>}
                <div className="grand"><dt>Total</dt><dd>{money(totals.grandTotal, cur)}</dd></div>
                {totals.paid > 0 && <div><dt>Balance due</dt><dd>{money(totals.balance, cur)}</dd></div>}
              </dl>
            </Card>

            <Card title="Payment, Notes & Terms">
              <Disclosure title="Bank and UPI details" open={openAll > 0 || !!doc.bank.bankName || !!doc.bank.upiId}>
                <div className="grid">
                  <Field path="bank.bankName" label="Bank name" />
                  <Field path="bank.accountNumber" label="Account number" />
                  {india && <Field path="bank.ifsc" label="IFSC" upper />}
                  <Field path="bank.branch" label="Branch" />
                  {india && <Field path="bank.upiId" label="UPI ID" hint="Adds a QR code with the amount filled in." />}
                </div>
              </Disclosure>
              <Disclosure title="Notes and terms" open={openAll > 0 || !!doc.notes || !!doc.terms}>
                <div className="grid">
                  <Field path="notes" label="Payment details / notes" area />
                  <Field path="terms" label="Terms & conditions" area />
                </div>
                <div className="presets" aria-label="Add a common term">
                  {NOTE_PRESETS.filter((p) => !doc.terms.includes(p)).map((p) => <button key={p} type="button" className="chip-btn" onClick={() => addNote(p)}><Plus size={12} aria-hidden /> {p}</button>)}
                </div>
                <div className="grid">
                  <Field path="timeline" label="Project timeline / delivery terms" area />
                  <Field path="footer" label="Footer note" area />
                </div>
              </Disclosure>
              <Disclosure title="Templates and privacy">
                <div className="row">
                  <button type="button" className="btn outline sm" onClick={saveTemplate}>Save as Template</button>
                  {confirmLoad ? <>
                    <span className="small">Replace this form with your template?</span>
                    <button type="button" className="btn outline sm" onClick={loadTemplate}>Yes, load</button>
                    <button type="button" className="btn ghost sm" onClick={() => setConfirmLoad(false)}>Cancel</button>
                  </> : <button type="button" className="btn outline sm" disabled={!hasTemplate} onClick={() => setConfirmLoad(true)}>Load Template</button>}
                </div>
                <label className="check">
                  <input type="checkbox" checked={recovery} onChange={(e) => { setRecovery(e.target.checked); setRecoveryState(e.target.checked); }} />
                  <span>Remember unfinished {label.toLowerCase()} after closing this browser. Avoid this on a shared device.</span>
                </label>
              </Disclosure>
            </Card>
            <p className="hint">* Required to save a document. You can preview and download a draft at any time.</p>
          </form>

          <aside className="preview-pane" aria-label="Design and preview">
            <DesignPanel />
            <Preview bytes={bytes} error={pdfError} sample={sample} updating={updating} />
          </aside>
        </div>

        <div className="mobile-bar">
          <span className="num"><span className="small muted">Total </span><strong>{money(totals.grandTotal, cur)}</strong></span>
          <div className="row">{actions("Save")}</div>
        </div>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </FormCtx.Provider>
  );
}

const useFormCtx = () => useContext(FormCtx);

function ClientAutofill({ clients }: { clients: Client[] }) {
  const { doc, setNow } = useFormCtx();
  const name = doc.client.organization;
  const lastApplied = useRef("");
  useEffect(() => {
    if (name === lastApplied.current) return;
    const found = clients.find((c) => c.organization === name);
    if (found && !doc.client.address && !doc.client.gstin) {
      lastApplied.current = name;
      const { id: _id, ...client } = found;
      setNow("client", client);
    }
  }, [name, clients, doc.client.address, doc.client.gstin, setNow]);
  return null;
}

function CustomFields() {
  const { doc, setNow, set } = useFormCtx();
  const fields = doc.customFields;
  const change = (i: number, key: "label" | "value", value: string) => set("customFields", fields.map((f, n) => (n === i ? { ...f, [key]: value } : f)));
  return (
    <div className="stack-sm">
      {fields.map((f, i) => (
        <div className="custom-row" key={i}>
          <input aria-label={`Custom field ${i + 1} name`} placeholder="Field name" value={f.label} onChange={(e) => change(i, "label", e.target.value)} />
          <input aria-label={`Custom field ${i + 1} value`} placeholder="Value" value={f.value} onChange={(e) => change(i, "value", e.target.value)} />
          <button type="button" className="icon-btn" aria-label={`Remove custom field ${i + 1}`} onClick={() => setNow("customFields", fields.filter((_, n) => n !== i))}><Trash2 size={16} aria-hidden /></button>
        </div>
      ))}
      {fields.length < 8 && <button type="button" className="btn ghost sm start" onClick={() => setNow("customFields", [...fields, { label: "", value: "" }])}><Plus size={14} aria-hidden /> Custom field</button>}
    </div>
  );
}

