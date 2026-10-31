import type { Doc } from "./model";

export const GST_STATES: [string, string][] = [
  ["01","Jammu & Kashmir"],["02","Himachal Pradesh"],["03","Punjab"],["04","Chandigarh"],["05","Uttarakhand"],["06","Haryana"],
  ["07","Delhi"],["08","Rajasthan"],["09","Uttar Pradesh"],["10","Bihar"],["11","Sikkim"],["12","Arunachal Pradesh"],["13","Nagaland"],
  ["14","Manipur"],["15","Mizoram"],["16","Tripura"],["17","Meghalaya"],["18","Assam"],["19","West Bengal"],["20","Jharkhand"],
  ["21","Odisha"],["22","Chhattisgarh"],["23","Madhya Pradesh"],["24","Gujarat"],["26","Dadra & Nagar Haveli and Daman & Diu"],
  ["27","Maharashtra"],["29","Karnataka"],["30","Goa"],["31","Lakshadweep"],["32","Kerala"],["33","Tamil Nadu"],["34","Puducherry"],
  ["35","Andaman & Nicobar Islands"],["36","Telangana"],["37","Andhra Pradesh"],["38","Ladakh"],["97","Other Territory"],
];

const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function gstinProblem(value: string): string | null {
  if (!value) return null;
  if (!GSTIN_SHAPE.test(value)) return "Enter a 15-character GSTIN in capitals.";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(value[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  const check = GSTIN_CHARS[(36 - (sum % 36)) % 36];
  return check === value[14] ? null : "This GSTIN's check digit is wrong. Look for a typing mistake.";
}

const POSTAL: Record<string, [RegExp, string]> = {
  IN: [/^[1-9]\d{5}$/, "411033"], US: [/^\d{5}(-\d{4})?$/, "10001"],
  GB: [/^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/i, "SW1A 1AA"], CA: [/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i, "K1A 0B1"],
  AU: [/^\d{4}$/, "2000"], DE: [/^\d{5}$/, "10115"],
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneOk = (v: string) => /^\+?[\d\s().-]+$/.test(v) && v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15;
const urlOk = (v: string) => {
  try {
    return ["http:", "https:"].includes(new URL(v.includes("://") ? v : `https://${v}`).protocol);
  } catch {
    return false;
  }
};

export type Errors = Record<string, string>;

export const stateFromGstin = (gstin: string) => {
  const found = GST_STATES.find(([code]) => code === gstin.slice(0, 2));
  return found ? found[1] : "";
};
export const panFromGstin = (gstin: string) => gstin.slice(2, 12);

export function validateDoc(d: Doc): Errors {
  const e: Errors = {};
  if (!d.business.name.trim()) e["business.name"] = "Enter your business name.";
  if (!d.client.organization.trim()) e["client.organization"] = "Enter who this is for.";
  if (!d.meta.number.trim()) e["meta.number"] = "Enter a document number.";
  else if (!/^[a-zA-Z0-9\-/]{1,16}$/.test(d.meta.number.trim())) e["meta.number"] = "Use up to 16 letters, numbers, - or /.";
  if (!d.meta.date) e["meta.date"] = "Choose a date.";
  if (d.meta.due && d.meta.date && d.meta.due < d.meta.date) e["meta.due"] = "This date can't be before the issue date.";
  if (d.docType === "purchase-order" && !d.meta.due) e["meta.due"] = "Choose an expected delivery date.";
  if (d.docType === "quotation" && !d.meta.due) e["meta.due"] = "Choose a validity date.";
  if (d.docType === "project-estimate" && !d.meta.project.trim()) e["meta.project"] = "Enter the project name.";
  if ((d.docType === "credit-note" || d.docType === "debit-note") && !d.meta.originalRef.trim()) e["meta.originalRef"] = "Enter the original invoice number.";
  if (d.docType === "receipt" && !d.meta.paymentMethod) e["meta.paymentMethod"] = "Choose a payment method.";

  for (const [prefix, party] of [["business", d.business], ["client", d.client]] as const) {
    if (party.email && !EMAIL.test(party.email)) e[`${prefix}.email`] = "Enter a valid email address.";
    if (party.phone && !phoneOk(party.phone)) e[`${prefix}.phone`] = "Enter 7 to 15 digits, with an optional + and country code.";
    const gst = gstinProblem(party.gstin);
    if (gst) e[`${prefix}.gstin`] = gst;
    const rule = POSTAL[party.country];
    if (party.pincode && rule && !rule[0].test(party.pincode)) e[`${prefix}.pincode`] = `Enter a valid postal code, like ${rule[1]}.`;
  }
  if (d.business.website && !urlOk(d.business.website)) e["business.website"] = "Enter a valid website address.";
  if (d.business.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(d.business.pan)) e["business.pan"] = "Enter a 10-character PAN in capitals.";
  if (d.bank.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(d.bank.ifsc)) e["bank.ifsc"] = "Enter an 11-character IFSC, like HDFC0001234.";
  if (d.bank.upiId && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9]{2,64}$/.test(d.bank.upiId)) e["bank.upiId"] = "Enter a UPI ID, like name@okhdfc.";
  if (d.bank.accountNumber && !/^[A-Za-z0-9 -]{4,34}$/.test(d.bank.accountNumber)) e["bank.accountNumber"] = "Enter 4 to 34 letters or digits.";
  if (d.totals.roundOff !== null && !d.totals.autoRound && Math.abs(d.totals.roundOff) > 1) e["totals.roundOff"] = "Round off must be between -1 and 1.";
  if (d.totals.discountType === "percentage" && (d.totals.discountValue ?? 0) > 100) e["totals.discountValue"] = "A percentage discount can't exceed 100.";

  if (d.totals.chargesTaxRate !== null && (d.totals.chargesTaxRate < 0 || d.totals.chargesTaxRate > 100)) e["totals.chargesTaxRate"] = "Enter a rate from 0 to 100.";
  if (d.meta.amountReceived !== null && d.meta.amountReceived < 0) e["meta.amountReceived"] = "This can't be negative.";

  d.items.forEach((it) => {
    if (!it.description.trim()) e[`item.${it.id}.description`] = "Describe this item.";
    if (it.quantity === null || it.quantity <= 0) e[`item.${it.id}.quantity`] = "Enter a quantity above 0.";
    if (it.rate !== null && it.rate < 0) e[`item.${it.id}.rate`] = "Rate can't be negative.";
    if (it.taxRate !== null && (it.taxRate < 0 || it.taxRate > 100)) e[`item.${it.id}.taxRate`] = "Enter a rate from 0 to 100.";
    if (it.discount !== null && (it.discount < 0 || it.discount > 100)) e[`item.${it.id}.discount`] = "Enter a rate from 0 to 100.";
    if (it.cess !== null && (it.cess < 0 || it.cess > 100)) e[`item.${it.id}.cess`] = "Enter a rate from 0 to 100.";
    if (it.hsn && !/^[0-9]{4,8}$/.test(it.hsn)) e[`item.${it.id}.hsn`] = "HSN/SAC must be 4 to 8 digits.";
  });
  return e;
}
