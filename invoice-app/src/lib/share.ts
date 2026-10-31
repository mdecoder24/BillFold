import { DOC_TYPES, type Doc } from "./model";
import { computeTotals, money } from "./totals";

const INVOICE_TYPES = ["invoice", "proforma-invoice", "debit-note"];

export function isOverdue(d: Doc, today: string) {
  return INVOICE_TYPES.includes(d.docType) && !["paid", "cancelled", "draft"].includes(d.status) && !!d.meta.due && d.meta.due < today;
}

export function shareMessage(d: Doc) {
  const t = computeTotals(d);
  const label = `${DOC_TYPES[d.docType]} ${d.meta.number}`.trim();
  const amount = money(t.paid > 0 && d.docType !== "receipt" ? t.balance : t.grandTotal, d.meta.currency);
  const due = d.meta.due && INVOICE_TYPES.includes(d.docType) ? `, due ${d.meta.due}` : "";
  const upi = d.bank.upiId && d.meta.currency === "INR" ? ` UPI: ${d.bank.upiId}.` : "";
  return `Hello ${d.client.contact || d.client.organization || ""}, here is ${label} from ${d.business.name || "us"} for ${amount}${due}.${upi} The PDF is attached.`.replace("Hello ,", "Hello,");
}

export function reminderMessage(d: Doc) {
  const t = computeTotals(d);
  const upi = d.bank.upiId && d.meta.currency === "INR" ? ` You can pay by UPI to ${d.bank.upiId}.` : "";
  return `Hello ${d.client.contact || d.client.organization || ""}, a reminder that ${DOC_TYPES[d.docType]} ${d.meta.number} for ${money(t.balance, d.meta.currency)} was due on ${d.meta.due}.${upi} Thank you.`.replace("Hello ,", "Hello,");
}

export function whatsappLink(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(message)}`;
}

export function mailLink(email: string, subject: string, message: string) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

// A leading =, +, - or @ would run as a formula when the file is opened in a spreadsheet.
const cell = (v: string | number) => {
  if (typeof v === "number") return String(v);
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const CSV_HEAD = ["Type", "Number", "Date", "Due", "Status", "Client", "Client GSTIN", "Place of supply", "Currency", "Taxable", "CGST", "SGST", "IGST", "Cess", "Other tax", "Total", "Paid", "Balance"];

/** One row per document, in the columns an accountant needs for a GST sales register. */
export function documentsCsv(docs: Doc[]) {
  const rows = docs.map((d) => {
    const t = computeTotals(d);
    return [
      DOC_TYPES[d.docType], d.meta.number, d.meta.date, d.meta.due, d.status, d.client.organization || d.client.contact, d.client.gstin,
      d.meta.placeOfSupply || (d.client.gstin ? d.client.gstin.slice(0, 2) : ""), d.meta.currency, t.groupTaxable, t.central, t.state,
      t.mode === "igst" ? t.tax : 0, t.cess, t.mode === "generic" ? t.tax : 0, t.grandTotal, t.paid, t.balance,
    ].map(cell).join(",");
  });
  return [CSV_HEAD.join(","), ...rows].join("\r\n");
}
