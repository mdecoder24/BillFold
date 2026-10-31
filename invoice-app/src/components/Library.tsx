"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { blankDoc, normalizeProduct, type Product } from "@/lib/model";
import { listDocs, loadClients, loadProducts, saveClients, saveProducts, type Client } from "@/lib/storage";
import { computeTotals, money } from "@/lib/totals";
import { gstinProblem } from "@/lib/validate";

type Row = Record<string, string | number | null> & { id: string };
interface Column { key: string; label: string; numeric?: boolean; wide?: boolean; upper?: boolean }

function Manager<T extends Row>({ rows, columns, blank, nameKey, noun, onSave, check, summary, rowActions }: {
  rows: T[]; columns: Column[]; blank: () => T; nameKey: string; noun: string; onSave: (rows: T[]) => void;
  check?: (row: T) => string | null; summary: (row: T) => React.ReactNode; rowActions?: (row: T) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<T | null>(null);
  const [confirming, setConfirming] = useState("");
  const [problem, setProblem] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => !q || columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q)));
  }, [rows, columns, query]);

  const commit = () => {
    if (!editing) return;
    if (!String(editing[nameKey] ?? "").trim()) return setProblem(`Enter a name for this ${noun}.`);
    const bad = check?.(editing);
    if (bad) return setProblem(bad);
    const exists = rows.some((r) => r.id === editing.id);
    onSave(exists ? rows.map((r) => (r.id === editing.id ? editing : r)) : [...rows, editing]);
    setEditing(null); setProblem("");
  };

  return (
    <div className="library">
      <div className="doc-tools">
        <input aria-label={`Search ${noun}s`} type="search" placeholder={`Search ${noun}s`} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="btn primary" onClick={() => { setProblem(""); setEditing(blank()); }}><Plus size={16} aria-hidden /> Add {noun}</button>
      </div>
      {editing && (
        <form className="card" onSubmit={(e) => { e.preventDefault(); commit(); }} noValidate>
          <header className="card-head"><h2>{rows.some((r) => r.id === editing.id) ? `Edit ${noun}` : `New ${noun}`}</h2></header>
          <div className="grid">
            {columns.map((c) => (
              <div className={c.wide ? "field span" : "field"} key={c.key}>
                <label htmlFor={`lib-${c.key}`}>{c.label}</label>
                {c.wide
                  ? <textarea id={`lib-${c.key}`} rows={2} value={String(editing[c.key] ?? "")} onChange={(e) => setEditing({ ...editing, [c.key]: e.target.value })} />
                  : <input id={`lib-${c.key}`} type={c.numeric ? "number" : "text"} step="any" value={editing[c.key] ?? ""} onChange={(e) => {
                      const v = e.target.value;
                      setEditing({ ...editing, [c.key]: c.numeric ? (v === "" ? null : Number(v)) : c.upper ? v.toUpperCase() : v });
                    }} />}
              </div>
            ))}
          </div>
          {problem && <p role="alert" className="err">{problem}</p>}
          <div className="row">
            <button type="submit" className="btn primary sm">Save {noun}</button>
            <button type="button" className="btn ghost sm" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}
      {!shown.length ? (
        <div className="empty">
          <p>{rows.length ? "Nothing matches that search." : `No ${noun}s yet. Saving a document remembers its ${noun}s here, or add one now.`}</p>
        </div>
      ) : (
        <ul className="doc-list">
          {shown.map((r) => (
            <li key={r.id} className="lib-row">
              <div className="doc-main">{summary(r)}</div>
              <div className="row lib-actions">
                {rowActions?.(r)}
                <button type="button" className="icon-btn" aria-label={`Edit ${r[nameKey]}`} title="Edit" onClick={() => { setProblem(""); setEditing(r); }}><Pencil size={16} aria-hidden /></button>
                {confirming === r.id ? (
                  <>
                    <button type="button" className="btn danger sm" onClick={() => { onSave(rows.filter((x) => x.id !== r.id)); setConfirming(""); }}>Confirm delete</button>
                    <button type="button" className="btn ghost sm" onClick={() => setConfirming("")}>Keep</button>
                  </>
                ) : <button type="button" className="icon-btn" aria-label={`Delete ${r[nameKey]}`} title="Delete" onClick={() => setConfirming(r.id)}><Trash2 size={16} aria-hidden /></button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CLIENT_COLUMNS: Column[] = [
  { key: "organization", label: "Company name" }, { key: "contact", label: "Contact name" }, { key: "gstin", label: "GSTIN", upper: true },
  { key: "phone", label: "Phone" }, { key: "email", label: "Client email" }, { key: "city", label: "City" }, { key: "state", label: "State" }, { key: "pincode", label: "Postal / ZIP code" },
  { key: "address", label: "Billing address", wide: true }, { key: "shipping", label: "Shipping address", wide: true },
];

export function Clients() {
  const [rows, setRows] = useState<Client[]>([]);
  const [balances, setBalances] = useState<Record<string, { amount: number; count: number }>>({});
  useEffect(() => {
    try { setRows(loadClients()); } catch { /* unreadable storage is treated as empty */ }
    listDocs().then((docs) => {
      const out: Record<string, { amount: number; count: number }> = {};
      for (const d of docs) {
        const key = d.client.organization.trim().toLowerCase();
        if (!key) continue;
        out[key] ??= { amount: 0, count: 0 };
        out[key].count++;
        if (d.docType === "invoice" && d.meta.currency === "INR" && !["paid", "cancelled", "draft"].includes(d.status)) out[key].amount += computeTotals(d).balance;
      }
      setBalances(out);
    }).catch(() => {});
  }, []);
  const save = (next: Client[]) => { setRows(next); saveClients(next); };
  return (
    <Manager<Client & Row> rows={rows as (Client & Row)[]} columns={CLIENT_COLUMNS} nameKey="organization" noun="client" onSave={save}
      blank={() => ({ ...blankDoc("invoice").client, id: crypto.randomUUID() }) as Client & Row}
      check={(c) => gstinProblem(String(c.gstin))}
      summary={(c) => {
        const b = balances[String(c.organization).trim().toLowerCase()];
        return <>
          <span className="doc-title">{c.organization}</span>
          <span className="small muted">{[c.gstin, c.contact, c.phone].filter(Boolean).join(" · ") || "No details yet"}{b ? ` · ${b.count} ${b.count === 1 ? "document" : "documents"}` : ""}{b?.amount ? ` · ${money(b.amount, "INR")} outstanding` : ""}</span>
        </>;
      }}
      rowActions={(c) => <Link className="btn ghost sm" href={`/invoice?client=${encodeURIComponent(c.id)}`}>New invoice</Link>} />
  );
}

const PRODUCT_COLUMNS: Column[] = [
  { key: "description", label: "Name" }, { key: "hsn", label: "HSN/SAC" }, { key: "unit", label: "Unit" }, { key: "rate", label: "Rate", numeric: true },
  { key: "taxRate", label: "Tax Rate (%)", numeric: true }, { key: "details", label: "Details", wide: true },
];

export function Products() {
  const [rows, setRows] = useState<Product[]>([]);
  useEffect(() => { try { setRows(loadProducts()); } catch { /* unreadable storage is treated as empty */ } }, []);
  const save = (next: Product[]) => { setRows(next); saveProducts(next.map(normalizeProduct)); };
  return (
    <Manager<Product & Row> rows={rows as (Product & Row)[]} columns={PRODUCT_COLUMNS} nameKey="description" noun="product" onSave={save}
      blank={() => normalizeProduct({ unit: "pcs" }) as Product & Row}
      check={(p) => (p.hsn && !/^[0-9]{4,8}$/.test(String(p.hsn)) ? "HSN/SAC must be 4 to 8 digits." : null)}
      summary={(p) => <>
        <span className="doc-title">{p.description}</span>
        <span className="small muted">{[p.hsn && `HSN ${p.hsn}`, p.rate !== null && `${money(Number(p.rate), "INR")} / ${p.unit}`, p.taxRate !== null && `${p.taxRate}% tax`].filter(Boolean).join(" · ") || "No details yet"}</span>
      </>} />
  );
}
