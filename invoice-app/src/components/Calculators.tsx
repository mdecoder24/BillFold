"use client";
import { useState } from "react";
import { money } from "@/lib/totals";

const inr = (v: number) => money(Number.isFinite(v) ? v : 0, "INR");
const pct = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2)}%` : "—");

function Num({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" step="any" min="0" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function GstCalc() {
  const [amount, setAmount] = useState("1000");
  const [rate, setRate] = useState("18");
  const [inclusive, setInclusive] = useState(false);
  const a = Number(amount) || 0;
  const r = Number(rate) || 0;
  const base = inclusive ? (a * 100) / (100 + r) : a;
  const gst = (base * r) / 100;
  return (
    <section className="card">
      <h2>GST</h2>
      <div className="segmented" role="group" aria-label="Amount type">
        <button type="button" aria-pressed={!inclusive} onClick={() => setInclusive(false)}>Add GST</button>
        <button type="button" aria-pressed={inclusive} onClick={() => setInclusive(true)}>Remove GST</button>
      </div>
      <div className="grid">
        <Num id="gst-amount" label={inclusive ? "Amount including GST" : "Amount before GST"} value={amount} onChange={setAmount} />
        <Num id="gst-rate" label="GST rate (%)" value={rate} onChange={setRate} />
      </div>
      <dl className="summary num">
        <div><dt>Taxable value</dt><dd>{inr(base)}</dd></div>
        <div><dt>CGST ({r / 2}%)</dt><dd>{inr(gst / 2)}</dd></div>
        <div><dt>SGST ({r / 2}%)</dt><dd>{inr(gst / 2)}</dd></div>
        <div><dt>IGST, if interstate ({r}%)</dt><dd>{inr(gst)}</dd></div>
        <div className="grand"><dt>Total</dt><dd>{inr(base + gst)}</dd></div>
      </dl>
    </section>
  );
}

function ProfitCalc() {
  const [cost, setCost] = useState("700");
  const [price, setPrice] = useState("1000");
  const c = Number(cost) || 0;
  const p = Number(price) || 0;
  return (
    <section className="card">
      <h2>Profit margin</h2>
      <div className="grid">
        <Num id="cost" label="Cost" value={cost} onChange={setCost} />
        <Num id="price" label="Selling price" value={price} onChange={setPrice} />
      </div>
      <dl className="summary num">
        <div><dt>Profit</dt><dd>{inr(p - c)}</dd></div>
        <div><dt>Margin</dt><dd>{p ? pct(((p - c) / p) * 100) : "—"}</dd></div>
        <div className="grand"><dt>Markup</dt><dd>{c ? pct(((p - c) / c) * 100) : "—"}</dd></div>
      </dl>
    </section>
  );
}

function BusinessCalc() {
  const [revenue, setRevenue] = useState("1000000");
  const [cogs, setCogs] = useState("600000");
  const [expenses, setExpenses] = useState("250000");
  const r = Number(revenue) || 0;
  const gross = r - (Number(cogs) || 0);
  const net = gross - (Number(expenses) || 0);
  return (
    <section className="card">
      <h2>Business margin</h2>
      <div className="grid">
        <Num id="revenue" label="Revenue" value={revenue} onChange={setRevenue} />
        <Num id="cogs" label="Cost of goods sold" value={cogs} onChange={setCogs} />
        <Num id="expenses" label="Operating expenses" value={expenses} onChange={setExpenses} />
      </div>
      <dl className="summary num">
        <div><dt>Gross profit</dt><dd>{inr(gross)}</dd></div>
        <div><dt>Gross margin</dt><dd>{r ? pct((gross / r) * 100) : "—"}</dd></div>
        <div><dt>Net profit</dt><dd>{inr(net)}</dd></div>
        <div className="grand"><dt>Net margin</dt><dd>{r ? pct((net / r) * 100) : "—"}</dd></div>
      </dl>
    </section>
  );
}

function DepreciationCalc() {
  const [method, setMethod] = useState<"slm" | "wdv">("slm");
  const [cost, setCost] = useState("100000");
  const [salvage, setSalvage] = useState("10000");
  const [life, setLife] = useState("5");
  const [rate, setRate] = useState("15");
  const c = Number(cost) || 0;
  const s = Math.min(Number(salvage) || 0, c);
  const years = Math.min(Math.max(1, Math.round(Number(life) || 1)), 50);
  const schedule: { year: number; charge: number; closing: number }[] = [];
  let book = c;
  for (let year = 1; year <= years; year++) {
    const charge = method === "slm" ? (c - s) / years : Math.max(0, Math.min(book - s, (book * (Number(rate) || 0)) / 100));
    book -= charge;
    schedule.push({ year, charge, closing: book });
  }
  return (
    <section className="card">
      <h2>Depreciation</h2>
      <div className="segmented" role="group" aria-label="Method">
        <button type="button" aria-pressed={method === "slm"} onClick={() => setMethod("slm")}>Straight line</button>
        <button type="button" aria-pressed={method === "wdv"} onClick={() => setMethod("wdv")}>Written down</button>
      </div>
      <div className="grid">
        <Num id="dep-cost" label="Asset cost" value={cost} onChange={setCost} />
        <Num id="dep-salvage" label="Residual value" value={salvage} onChange={setSalvage} />
        <Num id="dep-life" label="Useful life (years)" value={life} onChange={setLife} />
        {method === "wdv" && <Num id="dep-rate" label="Rate (%)" value={rate} onChange={setRate} />}
      </div>
      <dl className="summary num scroll-y">
        {schedule.map((row) => <div key={row.year}><dt>Year {row.year}: {inr(row.charge)}</dt><dd>{inr(row.closing)}</dd></div>)}
      </dl>
    </section>
  );
}

function PfCalc() {
  const [basic, setBasic] = useState("25000");
  const [ceiling, setCeiling] = useState("15000");
  const [capped, setCapped] = useState(true);
  const b = Number(basic) || 0;
  const wage = capped ? Math.min(b, Number(ceiling) || b) : b;
  const pensionWage = Math.min(b, Number(ceiling) || b);
  const employee = wage * 0.12;
  const eps = pensionWage * 0.0833;
  const employerEpf = wage * 0.12 - eps;
  return (
    <section className="card">
      <h2>Employee PF</h2>
      <div className="grid">
        <Num id="pf-basic" label="Monthly basic + DA" value={basic} onChange={setBasic} />
        <Num id="pf-ceiling" label="Wage ceiling" value={ceiling} onChange={setCeiling} />
      </div>
      <label className="check"><input type="checkbox" checked={capped} onChange={(e) => setCapped(e.target.checked)} /><span>Contribute on the ceiling only</span></label>
      <dl className="summary num">
        <div><dt>Employee PF (12%)</dt><dd>{inr(employee)}</dd></div>
        <div><dt>Employer EPF</dt><dd>{inr(employerEpf)}</dd></div>
        <div><dt>Employer EPS (8.33%)</dt><dd>{inr(eps)}</dd></div>
        <div className="grand"><dt>Total a month</dt><dd>{inr(employee + employerEpf + eps)}</dd></div>
      </dl>
      <p className="hint">Excludes admin and EDLI charges. Check current EPFO rules before relying on these figures.</p>
    </section>
  );
}

export function Calculators() {
  return (
    <div className="calcs">
      <GstCalc />
      <ProfitCalc />
      <BusinessCalc />
      <DepreciationCalc />
      <PfCalc />
    </div>
  );
}
