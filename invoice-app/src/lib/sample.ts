import { blankDoc, blankItem, type Doc, type DocType, type Template } from "./model";

const line = (description: string, hsn: string, quantity: number, unit: string, rate: number, taxRate: number) =>
  ({ ...blankItem(), id: description, description, hsn, quantity, unit, rate, taxRate });

const SAMPLE_ITEMS = [line("Sample item", "9983", 2, "hours", 2500, 18), line("Another sample item", "8471", 1, "pcs", 4000, 5)];

/** What the preview shows for a document with no items yet, so every option has something to change. */
export function previewDoc(doc: Doc): { doc: Doc; sample: boolean } {
  if (doc.items.length) return { doc, sample: false };
  return { doc: { ...doc, items: SAMPLE_ITEMS }, sample: true };
}

/** A filled-in document for the template thumbnails. */
export function thumbnailDoc(docType: DocType, template: Template, accent: string, logo: string): Doc {
  const d = blankDoc(docType);
  d.template = template;
  d.design.accent = accent;
  d.business = { ...d.business, name: "Your Company", gstin: "29AAPFU0939F1ZR", address: "12 MG Road, Bengaluru", logo };
  d.client = { ...d.client, organization: "Client Name", address: "4 Link Road, Pune", gstin: "27AAPFU0939F1ZV" };
  d.meta = { ...d.meta, number: "0001" };
  d.items = SAMPLE_ITEMS;
  d.bank = { ...d.bank, bankName: "Your Bank", accountNumber: "0000000000" };
  return d;
}
