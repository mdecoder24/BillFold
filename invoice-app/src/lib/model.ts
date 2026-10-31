export const DOC_TYPES = {
  invoice: "Invoice",
  estimate: "Estimate",
  quotation: "Quotation",
  receipt: "Receipt",
  "proforma-invoice": "Proforma Invoice",
  "purchase-order": "Purchase Order",
  "project-estimate": "Project Estimate",
  "credit-note": "Credit Note",
  "debit-note": "Debit Note",
  "delivery-challan": "Delivery Challan",
} as const;
export type DocType = keyof typeof DOC_TYPES;

export const NUMBER_PREFIX: Record<DocType, string> = {
  invoice: "INV", estimate: "EST", quotation: "QUO", receipt: "RCT",
  "proforma-invoice": "PRO", "purchase-order": "PO", "project-estimate": "PE",
  "credit-note": "CN", "debit-note": "DN", "delivery-challan": "DC",
};

export const TEMPLATES = { gst: "GST Ledger", classic: "Letterhead", modern: "Minimal", bold: "Bold", sidebar: "Sidebar" } as const;
export const ACCENTS = ["#0f5f4c", "#1f2d42", "#2f4fb5", "#6b2fb5", "#b3261e", "#b8590a", "#111111"] as const;
export const GST_TYPES = { regular: "Registered", composition: "Composition scheme", unregistered: "Not registered" } as const;
export type GstType = keyof typeof GST_TYPES;
export const SUPPLY_TYPES = { regular: "Regular supply", "export-lut": "Export under LUT (no tax)", "sez-lut": "SEZ under LUT (no tax)" } as const;
export type SupplyType = keyof typeof SUPPLY_TYPES;
export const PAYMENT_TERMS = [["", "Custom date"], ["0", "Due on receipt"], ["7", "Net 7"], ["15", "Net 15"], ["30", "Net 30"], ["45", "Net 45"], ["60", "Net 60"]] as const;
export type Template = keyof typeof TEMPLATES;
export type TaxMode = "auto" | "split" | "igst" | "generic" | "none";
export const PAYMENT_METHODS = ["Cash", "UPI", "Credit/Debit Card", "Bank Transfer", "Check", "Other"] as const;
export const STATUSES = ["draft", "sent", "partial", "paid", "cancelled"] as const;
export type Status = (typeof STATUSES)[number];

export interface Item {
  id: string; description: string; details: string; quantity: number | null;
  unit: string; rate: number | null; hsn: string; taxRate: number | null; discount: number | null; cess: number | null;
}
export interface CustomField { label: string; value: string }
export interface Design { accent: string; showWords: boolean; showHsnSummary: boolean; showSignatures: boolean; showStamp: boolean }
export interface Doc {
  id: string; docType: DocType; status: Status; updatedAt: string; template: Template;
  business: {
    name: string; country: string; address: string; city: string; state: string; pincode: string;
    phone: string; email: string; website: string; gstin: string; pan: string; taxId: string;
    logo: string; signature: string; stamp: string; gstType: GstType; cin: string;
  };
  client: {
    organization: string; contact: string; country: string; address: string; shipping: string; city: string;
    state: string; pincode: string; phone: string; email: string; gstin: string; taxId: string;
  };
  meta: {
    number: string; date: string; due: string; currency: string; paper: "a4" | "letter";
    placeOfSupply: string; taxMode: TaxMode; copies: "original" | "duplicate" | "triplicate"; reference: string;
    project: string; paymentMethod: string; paymentReference: string; amountReceived: number | null;
    paymentTerms: string; reverseCharge: boolean; supplyType: SupplyType; ewayBill: string; vehicle: string; transport: string;
    originalRef: string; originalDate: string; reason: string;
  };
  items: Item[];
  totals: {
    taxLabel: string; shipping: number | null; other: number | null; roundOff: number | null; autoRound: boolean;
    discountType: "percentage" | "flat"; discountValue: number | null; discountTiming: "before" | "after"; taxInclusive: boolean; chargesTaxRate: number | null;
  };
  bank: { bankName: string; accountNumber: string; ifsc: string; branch: string; upiId: string; upiQr: boolean };
  notes: string; terms: string; timeline: string; footer: string;
  design: Design; customFields: CustomField[];
}

export interface Settings { paymentDays: number | null; taxRate: number | null; numbering: "plain" | "fy"; prefix: string }
export interface Company {
  business: Doc["business"]; bank: Doc["bank"]; template: Template; design: Design; terms: string; notes: string; footer: string;
  currency: string; paper: Doc["meta"]["paper"]; settings: Settings;
}
export interface Product { id: string; description: string; details: string; unit: string; rate: number | null; hsn: string; taxRate: number | null }

export const isoDate = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const addDays = (days: number, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return isoDate(d);
};
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

export const blankItem = (): Item => ({ id: uid(), description: "", details: "", quantity: 1, unit: "pcs", rate: null, hsn: "", taxRate: null, discount: null, cess: null });

export function blankDoc(docType: DocType): Doc {
  const validity = ["estimate", "quotation", "project-estimate", "proforma-invoice"].includes(docType) ? 30 : 15;
  return {
    id: "", docType, status: "draft", updatedAt: "", template: "gst",
    business: { name: "", country: "", address: "", city: "", state: "", pincode: "", phone: "", email: "", website: "", gstin: "", pan: "", taxId: "", logo: "", signature: "", stamp: "", gstType: "regular", cin: "" },
    client: { organization: "", contact: "", country: "", address: "", shipping: "", city: "", state: "", pincode: "", phone: "", email: "", gstin: "", taxId: "" },
    meta: {
      number: "", date: isoDate(), due: docType === "receipt" ? "" : addDays(validity), currency: "INR", paper: "a4",
      placeOfSupply: "", taxMode: "auto", copies: "original", reference: "", project: "",
      paymentMethod: docType === "receipt" ? "Cash" : "", paymentReference: "", amountReceived: null,
      paymentTerms: "", reverseCharge: false, supplyType: "regular", ewayBill: "", vehicle: "", transport: "", originalRef: "", originalDate: "", reason: "",
    },
    items: [],
    totals: { taxLabel: "GST", shipping: null, other: null, roundOff: null, autoRound: false, discountType: "percentage", discountValue: null, discountTiming: "before", taxInclusive: false, chargesTaxRate: null },
    bank: { bankName: "", accountNumber: "", ifsc: "", branch: "", upiId: "", upiQr: true },
    notes: "", terms: "", timeline: "", footer: "",
    design: { accent: "", showWords: true, showHsnSummary: true, showSignatures: true, showStamp: true },
    customFields: [],
  };
}

const IMAGE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE = 350_000;
const MAX_TEXT = 20_000;
const MAX_ITEMS = 1000;
const MAX_CUSTOM = 8;

/** Rebuilds a value on the shape of `shape`, so untrusted JSON only ever contributes known keys of the right type. */
function conform<T>(shape: T, input: unknown): T {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, def] of Object.entries(shape as Record<string, unknown>)) {
    const v = Object.prototype.hasOwnProperty.call(src, k) ? src[k] : undefined;
    if (k === "logo" || k === "signature" || k === "stamp") out[k] = typeof v === "string" && v.length <= MAX_IMAGE && IMAGE.test(v) ? v : "";
    else if (Array.isArray(def)) out[k] = def;
    else if (typeof def === "string") out[k] = typeof v === "string" ? v.slice(0, MAX_TEXT) : def;
    else if (typeof def === "boolean") out[k] = typeof v === "boolean" ? v : def;
    else if (def === null || typeof def === "number") out[k] = typeof v === "number" && Number.isFinite(v) ? v : def;
    else out[k] = conform(def, v);
  }
  return out as T;
}
const oneOf = <T extends string>(v: string, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** Accepts anything read back from storage or a backup file and returns a safe Doc. */
export function normalizeDoc(input: unknown, docTypeHint: DocType = "invoice"): Doc {
  const raw = (input && typeof input === "object" ? input : {}) as { docType?: unknown; items?: unknown };
  const docType = typeof raw.docType === "string" && raw.docType in DOC_TYPES ? (raw.docType as DocType) : docTypeHint;
  const doc = conform(blankDoc(docType), input);
  doc.docType = docType;
  doc.status = oneOf(doc.status, STATUSES, "draft");
  doc.template = oneOf(doc.template, Object.keys(TEMPLATES) as Template[], "gst");
  doc.meta.paper = oneOf(doc.meta.paper, ["a4", "letter"], "a4");
  doc.meta.taxMode = oneOf(doc.meta.taxMode, ["auto", "split", "igst", "generic", "none"], "auto");
  doc.meta.copies = oneOf(doc.meta.copies, ["original", "duplicate", "triplicate"], "original");
  doc.business.gstType = oneOf(doc.business.gstType, Object.keys(GST_TYPES) as GstType[], "regular");
  doc.meta.supplyType = oneOf(doc.meta.supplyType, Object.keys(SUPPLY_TYPES) as SupplyType[], "regular");
  if (!/^#[0-9a-fA-F]{6}$/.test(doc.design.accent)) doc.design.accent = "";
  doc.totals.discountType = oneOf(doc.totals.discountType, ["percentage", "flat"], "percentage");
  doc.totals.discountTiming = oneOf(doc.totals.discountTiming, ["before", "after"], "before");
  const custom = (input as { customFields?: unknown } | null)?.customFields;
  doc.customFields = Array.isArray(custom) ? custom.slice(0, MAX_CUSTOM).map((c) => conform({ label: "", value: "" }, c)) : [];
  const items = Array.isArray(raw.items) ? raw.items.slice(0, MAX_ITEMS) : [];
  doc.items = items.map((it) => {
    const item = conform(blankItem(), it);
    return item.id ? item : { ...item, id: uid() };
  });
  return doc;
}

export function blankCompany(): Company {
  const d = blankDoc("invoice");
  return {
    business: d.business, bank: d.bank, template: d.template, design: d.design, terms: "", notes: "", footer: "",
    currency: "INR", paper: "a4", settings: { paymentDays: 15, taxRate: 18, numbering: "plain", prefix: "" },
  };
}

export function normalizeCompany(input: unknown): Company {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const d = normalizeDoc({ business: raw.business, bank: raw.bank, template: raw.template, design: raw.design, terms: raw.terms, notes: raw.notes, footer: raw.footer, meta: { currency: raw.currency, paper: raw.paper } });
  const fallback = blankCompany().settings;
  const s = conform(fallback, raw.settings);
  s.numbering = oneOf(s.numbering, ["plain", "fy"], "plain");
  s.prefix = s.prefix.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5).toUpperCase();
  return { business: d.business, bank: d.bank, template: d.template, design: d.design, terms: d.terms, notes: d.notes, footer: d.footer, currency: d.meta.currency, paper: d.meta.paper, settings: s };
}

export function normalizeProduct(input: unknown): Product {
  const raw = (input && typeof input === "object" ? input : {}) as { id?: unknown };
  const { description, details, unit, rate, hsn, taxRate } = conform(blankItem(), input);
  return { id: typeof raw.id === "string" ? raw.id : uid(), description, details, unit, rate, hsn, taxRate };
}
