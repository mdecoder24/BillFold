"use client";
import { createContext, useContext, useState } from "react";
import { type Doc } from "@/lib/model";
import { fileToImage } from "@/lib/storage";
import { gstinProblem, panFromGstin, stateFromGstin } from "@/lib/validate";

export interface Ctx {
  doc: Doc;
  set: (path: string, value: unknown) => void;
  /** Same as set, for options: the preview rebuilds right away instead of waiting for typing to stop. */
  setNow: (path: string, value: unknown) => void;
  error: (path: string) => string | undefined;
  touch: (path: string) => void;
}
export const FormCtx = createContext<Ctx>(null!);
export const useForm = () => useContext(FormCtx);

export function setIn(doc: Doc, path: string, value: unknown): Doc {
  const [group, key] = path.split(".");
  if (!key) return { ...doc, [group]: value };
  const next = { ...doc, [group]: { ...(doc as unknown as Record<string, Record<string, unknown>>)[group], [key]: value } };
  // A valid GSTIN already contains the state and PAN, so empty fields fill themselves.
  if (key === "gstin" && typeof value === "string" && value && !gstinProblem(value)) {
    const party = next[group as "business"] as Doc["business"];
    if (!party.state) party.state = stateFromGstin(value);
    if (!party.country) party.country = "IN";
    if (group === "business" && !party.pan) party.pan = panFromGstin(value);
  }
  return next;
}
function getIn(doc: Doc, path: string): unknown {
  const [group, key] = path.split(".");
  const top = (doc as unknown as Record<string, unknown>)[group];
  return key ? (top as Record<string, unknown>)[key] : top;
}

export function Field({ path, label, required, numeric, area, upper, hint, type, list, placeholder, wide }: {
  path: string; label: string; required?: boolean; numeric?: boolean; area?: boolean; upper?: boolean;
  hint?: string; type?: string; list?: string; placeholder?: string; wide?: boolean;
}) {
  const { doc, set, error, touch } = useForm();
  const value = getIn(doc, path) as string | number | null;
  const err = error(path);
  const common = {
    id: path, name: path, "aria-required": required || undefined, "aria-invalid": !!err || undefined,
    "aria-describedby": err ? `${path}-err` : undefined, onBlur: () => touch(path), placeholder,
  };
  return (
    <div className={area || wide ? "field span" : "field"}>
      <label htmlFor={path}>{label}{required && <span className="req" aria-hidden> *</span>}</label>
      {area ? (
        <textarea {...common} rows={3} value={(value as string) ?? ""} onChange={(e) => set(path, e.target.value)} />
      ) : numeric ? (
        <input {...common} type="number" step="any" inputMode="decimal" value={value ?? ""}
          onChange={(e) => set(path, e.target.value === "" ? null : Number(e.target.value))} />
      ) : (
        <input {...common} type={type ?? "text"} list={list} value={(value as string) ?? ""}
          autoCapitalize={upper ? "characters" : undefined}
          onChange={(e) => set(path, upper ? e.target.value.toUpperCase() : e.target.value)} />
      )}
      {hint && !err && <p className="hint">{hint}</p>}
      {err && <p className="err" id={`${path}-err`}>{err}</p>}
    </div>
  );
}

export function Select({ path, label, options, required }: { path: string; label: string; options: readonly (readonly [string, string])[]; required?: boolean }) {
  const { doc, setNow, error } = useForm();
  const err = error(path);
  return (
    <div className="field">
      <label htmlFor={path}>{label}{required && <span className="req" aria-hidden> *</span>}</label>
      <select id={path} value={(getIn(doc, path) as string) ?? ""} aria-invalid={!!err || undefined} onChange={(e) => setNow(path, e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

export function Check({ path, label }: { path: string; label: string }) {
  const { doc, setNow } = useForm();
  return (
    <label className="check">
      <input type="checkbox" checked={!!getIn(doc, path)} onChange={(e) => setNow(path, e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

const IMAGE_LABEL = { logo: "Company logo", signature: "Authorized signature", stamp: "Company stamp" } as const;

export function ImageField({ kind }: { kind: keyof typeof IMAGE_LABEL }) {
  const { doc, setNow } = useForm();
  const [problem, setProblem] = useState("");
  const src = doc.business[kind];
  return (
    <div className="image-field">
      <div className="image-box" data-empty={!src || undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt={`${IMAGE_LABEL[kind]} preview`} /> : <span className="small muted">None</span>}
      </div>
      <div className="image-actions">
        <label htmlFor={`upload-${kind}`} className="image-label">{IMAGE_LABEL[kind]}</label>
        <input id={`upload-${kind}`} type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          if (!file) return;
          setProblem("");
          try { setNow(`business.${kind}`, await fileToImage(file)); }
          catch (err) { setProblem(err instanceof Error ? err.message : "That image couldn't be used."); }
          finally { input.value = ""; }
        }} />
        {src && <button type="button" className="btn ghost sm" onClick={() => setNow(`business.${kind}`, "")}>Remove</button>}
        {problem && <p role="alert" className="err">{problem}</p>}
      </div>
    </div>
  );
}

export function Disclosure({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="disclosure" open={open}>
      <summary>{title}</summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
