import type { DocType, Template } from "./model";

export interface Tool { slug: string; docType: DocType; template?: Template; nav: string; title: string; heading: string; blurb: string }

export const TOOLS: Tool[] = [
  { slug: "gst-invoice", docType: "invoice", template: "gst", nav: "GST Invoice", title: "GST Invoice Generator with CGST, SGST and IGST", heading: "GST invoices, worked out for you", blurb: "CGST, SGST or IGST chosen from state codes, an HSN summary, a checked GSTIN and a UPI QR on the PDF." },
  { slug: "freelance-invoice", docType: "invoice", template: "modern", nav: "Freelance Invoice", title: "Freelance Invoice Generator", heading: "Freelance invoices that get paid", blurb: "Bill by the hour or by the project, in any currency, with fractional quantities and payment details." },
  { slug: "contractor-invoice", docType: "invoice", template: "classic", nav: "Contractor Invoice", title: "Contractor Invoice Generator", heading: "Contractor invoices with a clear breakdown", blurb: "List labour and materials as separate lines, add shipping or other charges, and sign digitally." },
  { slug: "quotation", docType: "quotation", nav: "Quotation", title: "Free Quotation Generator", heading: "Send a quotation in minutes", blurb: "Set a validity date, then turn the accepted quotation into an invoice in one click." },
  { slug: "estimate", docType: "estimate", nav: "Estimate", title: "Free Estimate Generator", heading: "Estimates your clients can read", blurb: "Give a clear price ahead of the work, then convert it to an invoice when it's approved." },
  { slug: "project-estimate", docType: "project-estimate", nav: "Project Estimate", title: "Project Estimate Generator", heading: "Project estimates with delivery terms", blurb: "Add the project name, timeline and terms alongside your costed work." },
  { slug: "receipt", docType: "receipt", nav: "Receipt", title: "Free Receipt Generator", heading: "Payment receipts, ready to send", blurb: "Record the method, reference and amount received. The balance works itself out." },
  { slug: "proforma-invoice", docType: "proforma-invoice", nav: "Proforma Invoice", title: "Proforma Invoice Generator", heading: "Proforma invoices before you ship", blurb: "Confirm the price and terms ahead of the final tax invoice." },
  { slug: "credit-note", docType: "credit-note", nav: "Credit Note", title: "Credit Note Generator", heading: "Credit notes linked to the original invoice", blurb: "Record a return or a price reduction against an earlier invoice, with tax worked out." },
  { slug: "debit-note", docType: "debit-note", nav: "Debit Note", title: "Debit Note Generator", heading: "Debit notes linked to the original invoice", blurb: "Record an additional charge against an earlier invoice, with tax worked out." },
  { slug: "delivery-challan", docType: "delivery-challan", nav: "Delivery Challan", title: "Delivery Challan Generator", heading: "Delivery challans for goods in transit", blurb: "List the goods, vehicle and transport details for a consignment." },
  { slug: "purchase-order", docType: "purchase-order", nav: "Purchase Order", title: "Purchase Order Generator", heading: "Purchase orders for your suppliers", blurb: "Set the delivery date, list what you're ordering, and keep every order on this device." },
];

export const pathFor = (type: DocType) => (type === "invoice" ? "/invoice" : `/${TOOLS.find((t) => t.docType === type)!.slug}`);
