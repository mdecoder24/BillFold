import type { Doc, Item, TaxMode } from "./model";

export interface Row { item: Item; gross: number; taxable: number; rate: number; central: number; state: number; tax: number; cess: number; lineDiscount: number }
export interface TaxGroup { hsn: string; rate: number; taxable: number; central: number; state: number; tax: number }
export interface Totals {
  digits: number; mode: Exclude<TaxMode, "auto">; rows: Row[]; subtotal: number; discount: number; taxable: number;
  tax: number; central: number; state: number; cess: number; shipping: number; other: number; roundOff: number; grandTotal: number; groups: TaxGroup[];
  groupTaxable: number; paid: number; balance: number;
}

export function currencyDigits(code: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}
const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function resolveTaxMode(doc: Doc): Exclude<TaxMode, "auto"> {
  if (doc.business.gstType !== "regular" && doc.meta.currency === "INR") return "none";
  if (doc.meta.supplyType !== "regular") return "none";
  const chosen = doc.meta.taxMode;
  if (chosen !== "auto") return chosen;
  const isGst = doc.meta.currency === "INR" && (doc.totals.taxLabel || "GST").trim().toUpperCase() === "GST";
  if (!isGst) return "generic";
  const seller = doc.business.gstin.slice(0, 2);
  const buyer = doc.meta.placeOfSupply.match(/^\d{2}/)?.[0] || doc.client.gstin.slice(0, 2);
  return seller && buyer && seller !== buyer ? "igst" : "split";
}

export function computeTotals(doc: Doc): Totals {
  const digits = currencyDigits(doc.meta.currency);
  const scale = 10 ** digits;
  const round = (v: number) => Math.round((v + Number.EPSILON * Math.sign(v)) * scale) / scale;
  const mode = resolveTaxMode(doc);
  const t = doc.totals;

  const lineDiscounts = doc.items.map((item) => round((num(item.quantity) * num(item.rate) * Math.min(100, Math.max(0, num(item.discount)))) / 100));
  const gross = doc.items.map((item, i) => round(num(item.quantity) * num(item.rate) - lineDiscounts[i]));
  const subtotal = round(gross.reduce((a, b) => a + b, 0));
  const shipping = round(num(t.shipping));
  const other = round(num(t.other));

  const rawDiscount = (base: number) =>
    Math.min(base, Math.max(0, round(t.discountType === "percentage" ? (base * num(t.discountValue)) / 100 : num(t.discountValue))));

  // A discount shown on the document reduces the taxable value, so it is shared across lines by value.
  const before = t.discountTiming === "before" ? rawDiscount(subtotal) : 0;
  let allocated = 0;
  let lastLine = -1;
  gross.forEach((g, i) => { if (g > 0) lastLine = i; });

  const rows: Row[] = doc.items.map((item, i) => {
    let share = 0;
    if (before && subtotal) {
      share = i === lastLine ? round(before - allocated) : round((before * gross[i]) / subtotal);
      allocated = round(allocated + share);
    }
    const rate = mode === "none" ? 0 : Math.max(0, num(item.taxRate));
    const cessRate = mode === "none" ? 0 : Math.max(0, num(item.cess));
    // Tax-inclusive prices carry their tax inside the line, so the taxable value is worked backwards.
    const taxable = round(t.taxInclusive ? ((gross[i] - share) * 100) / (100 + rate + cessRate) : gross[i] - share);
    const central = mode === "split" ? round((taxable * rate) / 200) : 0;
    const tax = mode === "split" ? round(central * 2) : round((taxable * rate) / 100);
    return { item, gross: gross[i], taxable, rate, central, state: central, tax, cess: round((taxable * cessRate) / 100), lineDiscount: lineDiscounts[i] };
  });

  const sum = (k: "tax" | "central" | "state" | "taxable" | "cess") => round(rows.reduce((a, r) => a + r[k], 0));
  const chargesBase = round(shipping + other);
  const chargesRate = mode === "none" ? 0 : Math.max(0, num(t.chargesTaxRate));
  const chargesCentral = mode === "split" ? round((chargesBase * chargesRate) / 200) : 0;
  const chargesTax = mode === "split" ? round(chargesCentral * 2) : round((chargesBase * chargesRate) / 100);
  const tax = round(sum("tax") + chargesTax);
  const cess = sum("cess");
  const preDiscount = round(sum("taxable") + tax + cess + shipping + other);
  const after = t.discountTiming === "after" ? rawDiscount(preDiscount) : 0;
  const net = round(preDiscount - after);
  const roundOff = t.autoRound ? round(Math.round(net) - net) : round(num(t.roundOff));

  const groups = new Map<string, TaxGroup>();
  for (const r of rows) {
    const hsn = r.item.hsn || "-";
    const key = `${hsn}:${r.rate}`;
    const g = groups.get(key) ?? { hsn, rate: r.rate, taxable: 0, central: 0, state: 0, tax: 0 };
    g.taxable = round(g.taxable + r.taxable);
    g.central = round(g.central + r.central);
    g.state = round(g.state + r.state);
    g.tax = round(g.tax + r.tax);
    groups.set(key, g);
  }

  if (chargesTax) groups.set("charges", { hsn: "Charges", rate: chargesRate, taxable: chargesBase, central: chargesCentral, state: chargesCentral, tax: chargesTax });
  const groupTaxable = round([...groups.values()].reduce((a, g) => a + g.taxable, 0));
  const grandTotal = round(net + roundOff);
  const paid = doc.meta.amountReceived ?? (doc.docType === "receipt" ? grandTotal : 0);

  return {
    digits, mode, rows, subtotal, discount: round(before + after), taxable: sum("taxable"), tax,
    central: round(sum("central") + chargesCentral), state: round(sum("state") + chargesCentral), cess, shipping, other, roundOff,
    grandTotal, groups: [...groups.values()], groupTaxable, paid, balance: round(grandTotal - paid),
  };
}

const LOCALES: Record<string, string> = { INR: "en-IN", EUR: "de-DE", GBP: "en-GB", CAD: "en-CA", AUD: "en-AU", JPY: "ja-JP" };
export const localeFor = (code: string) => LOCALES[code] || "en-US";
export function money(value: number, code: string, display: "symbol" | "code" = "symbol") {
  try {
    return new Intl.NumberFormat(localeFor(code), { style: "currency", currency: code, currencyDisplay: display }).format(value);
  } catch {
    return `${code} ${value.toFixed(2)}`;
  }
}

const ONES = ["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const TENS = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
const INDIAN: [number, string][] = [[1e7,"Crore"],[1e5,"Lakh"],[1e3,"Thousand"],[100,"Hundred"]];
const WESTERN: [number, string][] = [[1e12,"Trillion"],[1e9,"Billion"],[1e6,"Million"],[1e3,"Thousand"],[100,"Hundred"]];

function spell(n: number, indian: boolean): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  const [size, name] = (indian ? INDIAN : WESTERN).find(([s]) => n >= s)!;
  return `${spell(Math.floor(n / size), indian)} ${name}${n % size ? ` ${spell(n % size, indian)}` : ""}`;
}

export function amountInWords(value: number, code: string) {
  if (!Number.isFinite(value)) return "";
  const scale = 10 ** currencyDigits(code);
  const minor = Math.round(Math.abs(value) * scale);
  const whole = Math.floor(minor / scale);
  const part = minor % scale;
  const sign = value < 0 ? "Minus " : "";
  if (code === "INR") return `${sign}Rupees ${spell(whole, true)}${part ? ` and ${spell(part, false)} Paise` : ""} Only`;
  return `${sign}${code} ${spell(whole, false)}${part ? ` and ${part}/${scale}` : ""} Only`;
}
