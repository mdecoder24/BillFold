"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ACCENTS, TEMPLATES, GST_TYPES, blankCompany, blankDoc, type Company as CompanyData, type Doc, type Settings, type Template } from "@/lib/model";
import { clearLocalData, loadCompany, numberHead, saveCompany } from "@/lib/storage";
import { GST_STATES, gstinProblem, stateFromGstin, validateDoc } from "@/lib/validate";
import { PasscodeFields, useAccess } from "./Access";
import { Field, FormCtx, ImageField, setIn } from "./fields";

const COUNTRIES = [["", "Not specified"], ["IN", "India"], ["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["DE", "Germany"]] as const;

const toDoc = (c: CompanyData): Doc => {
  const d = blankDoc("invoice");
  return { ...d, business: c.business, bank: c.bank, template: c.template, design: c.design, terms: c.terms, notes: c.notes, footer: c.footer, meta: { ...d.meta, currency: c.currency, paper: c.paper } };
};

export function Company() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [settings, setSettings] = useState<Settings>(blankCompany().settings);
  const [message, setMessage] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);
  const [changing, setChanging] = useState(false);
  const { signOut } = useAccess();

  useEffect(() => {
    let c = blankCompany();
    try { c = loadCompany() ?? c; } catch { setMessage("Saved company details couldn't be read."); }
    setDoc(toDoc(c));
    setSettings(c.settings);
  }, []);

  const set = useCallback((path: string, value: unknown) => setDoc((d) => (d ? setIn(d, path, value) : d)), []);
  const touch = useCallback((p: string) => setTouched((s) => new Set(s).add(p)), []);
  const errors = useMemo(() => {
    if (!doc) return {};
    const all = validateDoc(doc);
    return Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith("business.") || k.startsWith("bank.")));
  }, [doc]);
  const error = useCallback((p: string) => (showAll || touched.has(p) ? errors[p] : undefined), [errors, showAll, touched]);
  const ctx = useMemo(() => (doc ? { doc, set, setNow: set, error, touch } : null), [doc, set, error, touch]);

  if (!doc || !ctx) return <div className="editor-skeleton" aria-busy="true" />;

  const b = doc.business;
  const data = (): CompanyData => ({ business: doc.business, bank: doc.bank, template: doc.template, design: doc.design, terms: doc.terms, notes: doc.notes, footer: doc.footer, currency: doc.meta.currency, paper: doc.meta.paper, settings });
  const save = () => {
    if (Object.keys(errors).length) {
      setShowAll(true);
      setMessage("Fix the highlighted fields to save.");
      setTimeout(() => (document.querySelector("[aria-invalid='true']") as HTMLElement | null)?.focus(), 60);
      return;
    }
    try { saveCompany(data()); setMessage("Saved. New documents will use these details."); }
    catch { setMessage("Browser storage is full or unavailable."); }
  };

  const example = `${numberHead("invoice", data(), new Date().toISOString().slice(0, 10))}0001`;
  const state = b.gstin && !gstinProblem(b.gstin) ? stateFromGstin(b.gstin) : "";

  return (
    <FormCtx.Provider value={ctx}>
      <form className="settings" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <section className="card">
          <header className="card-head"><h2>Identity</h2></header>
          <p className="hint">Printed on every document. Change it here once and new documents follow.</p>
          <div className="grid">
            <Field path="business.name" label="Business name" />
            <Field path="business.website" label="Website" />
          </div>
          <div className="images"><ImageField kind="logo" /><ImageField kind="signature" /><ImageField kind="stamp" /></div>
        </section>

        <section className="card">
          <header className="card-head"><h2>GST registration</h2></header>
          <div className="seg-cards" role="radiogroup" aria-label="GST registration">
            {(Object.entries(GST_TYPES) as [Doc["business"]["gstType"], string][]).map(([k, v]) => (
              <button key={k} type="button" role="radio" aria-checked={b.gstType === k} onClick={() => set("business.gstType", k)}>
                <strong>{v}</strong>
                <span className="small muted">{k === "regular" ? "Charges GST and issues tax invoices." : k === "composition" ? "Issues a bill of supply. No tax is charged." : "Issues plain invoices with no GST."}</span>
              </button>
            ))}
          </div>
          <div className="grid">
            {b.gstType !== "unregistered" && <Field path="business.gstin" label="GSTIN" upper hint={state ? `State: ${state}` : "Checked for typos. Fills in your state and PAN."} />}
            <Field path="business.pan" label="PAN" upper />
            <Field path="business.cin" label="CIN" upper />
            <Field path="business.taxId" label="Other tax / VAT ID" />
          </div>
        </section>

        <section className="card">
          <header className="card-head"><h2>Address & contact</h2></header>
          <div className="grid">
            <Field path="business.address" label="Business address" area />
            <div className="field">
              <label htmlFor="company-country">Country</label>
              <select id="company-country" value={b.country} onChange={(e) => set("business.country", e.target.value)}>
                {COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <Field path="business.city" label="City" />
            <div className="field">
              <label htmlFor="company-state">State</label>
              <input id="company-state" list="gst-states" value={b.state} onChange={(e) => set("business.state", e.target.value)} />
              <datalist id="gst-states">{GST_STATES.map(([c, n]) => <option key={c} value={n} />)}</datalist>
            </div>
            <Field path="business.pincode" label="Postal / ZIP code" />
            <Field path="business.phone" label="Phone" type="tel" />
            <Field path="business.email" label="Business email" type="email" />
          </div>
        </section>

        <section className="card">
          <header className="card-head"><h2>Bank & UPI</h2></header>
          <div className="grid">
            <Field path="bank.bankName" label="Bank name" />
            <Field path="bank.accountNumber" label="Account number" />
            <Field path="bank.ifsc" label="IFSC" upper />
            <Field path="bank.branch" label="Branch" />
            <Field path="bank.upiId" label="UPI ID" hint="Adds a QR code with the amount filled in." />
          </div>
        </section>

        <section className="card">
          <header className="card-head"><h2>Defaults for new documents</h2></header>
          <div className="grid">
            <div className="field">
              <label htmlFor="default-template">Template</label>
              <select id="default-template" value={doc.template} onChange={(e) => set("template", e.target.value as Template)}>
                {(Object.entries(TEMPLATES) as [Template, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="default-accent">Colour</label>
              <select id="default-accent" value={doc.design.accent} onChange={(e) => set("design", { ...doc.design, accent: e.target.value })}>
                <option value="">Template colour</option>
                {ACCENTS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="default-days">Payment due after (days)</label>
              <input id="default-days" type="number" min="0" value={settings.paymentDays ?? ""} onChange={(e) => setSettings({ ...settings, paymentDays: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor="default-tax">Item tax rate (%)</label>
              <input id="default-tax" type="number" min="0" list="tax-rates-co" value={settings.taxRate ?? ""} onChange={(e) => setSettings({ ...settings, taxRate: e.target.value === "" ? null : Number(e.target.value) })} />
              <datalist id="tax-rates-co">{[0, 3, 5, 12, 18, 28, 40].map((r) => <option key={r} value={r} />)}</datalist>
            </div>
            <div className="field">
              <label htmlFor="default-numbering">Numbering</label>
              <select id="default-numbering" value={settings.numbering} onChange={(e) => setSettings({ ...settings, numbering: e.target.value as Settings["numbering"] })}>
                <option value="plain">Running number</option>
                <option value="fy">With financial year</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="default-prefix">Invoice prefix</label>
              <input id="default-prefix" maxLength={5} placeholder="INV" value={settings.prefix} onChange={(e) => setSettings({ ...settings, prefix: e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() })} />
              <p className="hint">Next looks like {example}</p>
            </div>
            <Field path="notes" label="Payment details / notes" area />
            <Field path="terms" label="Terms & conditions" area />
            <Field path="footer" label="Footer note" area />
          </div>
        </section>

        <div className="settings-bar">
          <span role="status" className="small muted">{message}</span>
          <button type="submit" className="btn primary">Save company</button>
        </div>

        <section className="card">
          <header className="card-head"><h2>Data on this device</h2></header>
          <p className="hint">Your company, clients, products and templates are stored in this browser without encryption. Anyone using this browser profile can read them.</p>
          <div className="row">
            {confirmClear ? <>
              <span className="small">Delete your company, clients, products, templates and drafts? Saved documents stay.</span>
              <button type="button" className="btn danger sm" onClick={() => {
                try { clearLocalData(); const c = blankCompany(); setDoc(toDoc(c)); setSettings(c.settings); setMessage("Local data cleared."); } catch { setMessage("Browser storage is unavailable."); }
                setConfirmClear(false);
              }}>Yes, clear</button>
              <button type="button" className="btn ghost sm" onClick={() => setConfirmClear(false)}>Cancel</button>
            </> : <button type="button" className="btn outline sm" onClick={() => setConfirmClear(true)}>Clear local data</button>}
          </div>
        </section>
      </form>
      <div className="settings settings-after">
        <section className="card">
          <header className="card-head"><h2>Admin access</h2></header>
          <p className="hint">Admin sessions end when you close the tab or after 30 minutes without activity. This protects against casual use of a shared browser. It doesn&apos;t encrypt your data, and someone with technical skills could still read it.</p>
          {changing
            ? <PasscodeFields submitLabel="Change passcode" onDone={() => { setChanging(false); setMessage("Passcode changed."); }} />
            : <div className="row">
                <button type="button" className="btn outline sm" onClick={() => setChanging(true)}>Change passcode</button>
                <button type="button" className="btn ghost sm" onClick={signOut}>Sign out</button>
              </div>}
        </section>
      </div>
    </FormCtx.Provider>
  );
}
