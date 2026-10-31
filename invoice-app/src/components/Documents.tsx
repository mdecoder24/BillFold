"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { DOC_TYPES, STATUSES, isoDate, type Doc, type DocType, type Status } from "@/lib/model";
import { pathFor } from "@/lib/routes";
import { documentsCsv, isOverdue, mailLink, reminderMessage, whatsappLink } from "@/lib/share";
import { deleteDoc, downloadBlob, exportBackup, financialYear, importBackup, listDocs, putDoc } from "@/lib/storage";
import { computeTotals, money } from "@/lib/totals";

const CONVERTS: DocType[] = ["quotation", "estimate", "project-estimate", "proforma-invoice", "delivery-challan"];
type Period = "all" | "month" | "fy";
const label = (s: string) => s[0].toUpperCase() + s.slice(1);

export function Documents() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | DocType>("all");
  const [status, setStatus] = useState<"all" | "overdue" | Status>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [confirming, setConfirming] = useState("");
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const today = isoDate();

  const refresh = () => listDocs().then(setDocs).catch(() => { setDocs([]); setMessage("Saved documents couldn't be read in this browser."); });
  useEffect(() => { void refresh(); }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (docs ?? []).filter((d) => {
      if (q && ![d.meta.number, d.client.organization, d.client.contact, d.client.gstin, DOC_TYPES[d.docType]].some((v) => v.toLowerCase().includes(q))) return false;
      if (type !== "all" && d.docType !== type) return false;
      if (status === "overdue" ? !isOverdue(d, today) : status !== "all" && d.status !== status) return false;
      if (period === "month" && d.meta.date.slice(0, 7) !== today.slice(0, 7)) return false;
      if (period === "fy" && (!d.meta.date || financialYear(d.meta.date) !== financialYear(today))) return false;
      return true;
    });
  }, [docs, query, type, status, period, today]);

  // Totals add up one currency only, so mixed currencies never produce a meaningless figure.
  const stats = useMemo(() => {
    const invoices = shown.filter((d) => d.docType === "invoice" && d.status !== "cancelled" && d.status !== "draft");
    const counts = new Map<string, number>();
    for (const d of invoices) counts.set(d.meta.currency, (counts.get(d.meta.currency) ?? 0) + 1);
    const currency = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "INR";
    const inCurrency = invoices.filter((d) => d.meta.currency === currency);
    const sum = (rows: Doc[], f: (d: Doc) => number) => rows.reduce((a, d) => a + f(d), 0);
    const open = inCurrency.filter((d) => d.status !== "paid");
    return {
      currency, others: invoices.length - inCurrency.length,
      billed: sum(inCurrency, (d) => computeTotals(d).grandTotal),
      received: sum(inCurrency, (d) => (d.status === "paid" ? computeTotals(d).grandTotal : computeTotals(d).paid)),
      outstanding: sum(open, (d) => computeTotals(d).balance),
      overdue: sum(open.filter((d) => isOverdue(d, today)), (d) => computeTotals(d).balance),
    };
  }, [shown, today]);

  const setDocStatus = async (d: Doc, next: Status) => { await putDoc({ ...d, status: next }); await refresh(); };
  const closeMenus = () => document.querySelectorAll<HTMLDetailsElement>("details.menu[open]").forEach((m) => { m.open = false; });

  return (
    <div className="documents">
      {!!docs?.length && (
        <dl className="stats num">
          <div><dt>Billed</dt><dd>{money(stats.billed, stats.currency)}</dd></div>
          <div><dt>Received</dt><dd>{money(stats.received, stats.currency)}</dd></div>
          <div><dt>Outstanding</dt><dd>{money(stats.outstanding, stats.currency)}</dd></div>
          <div data-alert={stats.overdue > 0 || undefined}><dt>Overdue</dt><dd>{money(stats.overdue, stats.currency)}</dd></div>
        </dl>
      )}
      {stats.others > 0 && <p className="hint">Figures cover {stats.currency} invoices. {stats.others} in other currencies are not included.</p>}
      <div className="doc-tools">
        <input aria-label="Search documents" type="search" placeholder="Search number, client or GSTIN" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="all">All types</option>
          {(Object.entries(DOC_TYPES) as [DocType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">All statuses</option>
          <option value="overdue">Overdue</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select aria-label="Filter by period" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          <option value="all">All time</option>
          <option value="month">This month</option>
          <option value="fy">This financial year</option>
        </select>
        <details className="menu">
          <summary className="btn outline">Data</summary>
          <div className="menu-body menu-right">
            <button type="button" disabled={!shown.length} onClick={() => { closeMenus(); downloadBlob(new Blob([documentsCsv(shown)], { type: "text/csv" }), `billfold-register-${today}.csv`); }}>Export shown as CSV</button>
            <button type="button" onClick={async () => { closeMenus(); downloadBlob(new Blob([await exportBackup()], { type: "application/json" }), `billfold-backup-${today}.json`); }}>Back up everything</button>
            <button type="button" onClick={() => { closeMenus(); fileInput.current?.click(); }}>Restore a backup</button>
          </div>
        </details>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden aria-label="Restore backup file" onChange={async (e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          if (!file) return;
          try { const n = await importBackup(await file.text()); setMessage(`Restored ${n} ${n === 1 ? "document" : "documents"}.`); await refresh(); }
          catch (err) { setMessage(err instanceof SyntaxError ? "That file couldn't be read." : err instanceof Error ? err.message : "Restore failed."); }
          finally { input.value = ""; }
        }} />
      </div>
      {message && <p role="status" className="small muted">{message}</p>}
      {docs === null ? <p className="muted">Loading…</p> : !shown.length ? (
        <div className="empty">
          <p>{docs.length ? "Nothing matches these filters." : "Documents you save appear here. They stay on this device."}</p>
          {!docs.length && <a className="btn primary" href="/invoice">Create an invoice</a>}
        </div>
      ) : (
        <ul className="doc-list">
          {shown.map((d) => {
            const t = computeTotals(d);
            const overdue = isOverdue(d, today);
            return (
              <li key={d.id} className="doc-row">
                <div className="doc-main">
                  <Link href={`${pathFor(d.docType)}?id=${encodeURIComponent(d.id)}`} className="doc-title">{DOC_TYPES[d.docType]} {d.meta.number}</Link>
                  <span className="small muted">{d.client.organization || d.client.contact} · {d.meta.date}{d.meta.due ? ` · due ${d.meta.due}` : ""}</span>
                </div>
                {overdue ? <span className="badge" data-tone="danger">Overdue</span> : <span />}
                <strong className="num doc-amount">{money(t.grandTotal, d.meta.currency)}</strong>
                <select aria-label={`Status of ${d.meta.number}`} value={d.status} onChange={(e) => setDocStatus(d, e.target.value as Status)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </select>
                <details className="menu">
                  <summary className="icon-btn" aria-label={`Actions for ${d.meta.number}`}><MoreHorizontal size={18} aria-hidden /></summary>
                  <div className="menu-body menu-right">
                    {CONVERTS.includes(d.docType) && <Link href={`/invoice?from=${encodeURIComponent(d.id)}`}>Turn into invoice</Link>}
                    {d.docType === "invoice" && <Link href={`/credit-note?from=${encodeURIComponent(d.id)}`}>Issue credit note</Link>}
                    {d.docType === "invoice" && <Link href={`/debit-note?from=${encodeURIComponent(d.id)}`}>Issue debit note</Link>}
                    {d.docType === "invoice" && <Link href={`/receipt?from=${encodeURIComponent(d.id)}`}>Create receipt</Link>}
                    <Link href={`${pathFor(d.docType)}?from=${encodeURIComponent(d.id)}`}>Duplicate</Link>
                    {overdue && d.client.phone && <a href={whatsappLink(d.client.phone, reminderMessage(d))} target="_blank" rel="noopener noreferrer">Remind on WhatsApp</a>}
                    {overdue && d.client.email && <a href={mailLink(d.client.email, `Payment reminder: ${d.meta.number}`, reminderMessage(d))}>Remind by email</a>}
                    {confirming === d.id
                      ? <button type="button" className="danger-text" onClick={async () => { await deleteDoc(d.id); setConfirming(""); await refresh(); }}>Confirm delete</button>
                      : <button type="button" className="danger-text" onClick={() => setConfirming(d.id)}>Delete</button>}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <p className="hint">Saved only in this browser. Clearing site data removes them, so back up regularly.</p>
    </div>
  );
}
