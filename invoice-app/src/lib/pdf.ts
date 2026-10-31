import { jsPDF } from "jspdf";
import autoTable, { type UserOptions } from "jspdf-autotable";
import QRCode from "qrcode";
import { DOC_TYPES, type Doc, type DocType, type Template } from "./model";
import { amountInWords, computeTotals, localeFor, money } from "./totals";
import { stateFromGstin } from "./validate";
import { APP_NAME } from "./brand";

type RGB = [number, number, number];
const INK: RGB = [24, 29, 27];
const MUTED: RGB = [96, 106, 101];
const WHITE: RGB = [255, 255, 255];
const MARGIN = 15;
const SIDEBAR_W = 62;

// Noto Sans draws these symbols; anything else (Arabic and similar scripts) falls back to the ISO code.
const DRAWABLE_SYMBOLS = ["INR","USD","EUR","GBP","JPY","CNY","AUD","CAD","CHF","NZD","SGD","HKD","KRW","RUB","TRY"];

export const DEFAULT_ACCENT: Record<Template, string> = { gst: "#0f5f4c", classic: "#1f2d42", modern: "#111111", bold: "#2f4fb5", sidebar: "#0b6e75" };

let fonts: Promise<[string, string]> | undefined;
function loadFonts() {
  fonts ??= Promise.all(["Regular", "Bold"].map(async (weight) => {
    const res = await fetch(`/fonts/NotoSans-${weight}.ttf`);
    if (!res.ok) throw new Error("Document fonts could not load. Check your connection and retry.");
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  })).then(([a, b]) => [a, b] as [string, string]).catch((err) => { fonts = undefined; throw err; });
  return fonts;
}

const hex = (value: string): RGB => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as RGB;
const mix = (color: RGB, amount: number): RGB => color.map((c) => Math.round(255 - (255 - c) * amount)) as RGB;

const fmtDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
};
const lines = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join("\n");
const place = (p: { city: string; state: string; pincode: string; country: string }) =>
  [p.city, p.state, p.pincode, p.country === "unspecified" ? "" : p.country].filter(Boolean).join(", ");

export const documentFilename = (doc: Doc) =>
  `${DOC_TYPES[doc.docType]}-${doc.meta.number || "Draft"}`.replace(/[^a-zA-Z0-9_-]/g, "-") + ".pdf";

export const dueLabel = (type: DocType) =>
  type === "purchase-order" ? "Expected Delivery" : ["quotation", "estimate", "project-estimate"].includes(type) ? "Valid Until" : "Due Date";

export const upiLink = (doc: Doc, amount: number) => {
  const params = [
    `pa=${encodeURIComponent(doc.bank.upiId)}`,
    `pn=${encodeURIComponent(doc.business.name || "Payee")}`,
    amount > 0 ? `am=${amount.toFixed(2)}` : "",
    "cu=INR",
    doc.meta.number ? `tn=${encodeURIComponent(doc.meta.number)}` : "",
  ].filter(Boolean);
  return `upi://pay?${params.join("&")}`;
};

export function documentTitle(doc: Doc, gst: boolean, hasTax: boolean) {
  const type = doc.docType;
  if (type === "invoice") {
    if (doc.meta.currency === "INR" && doc.business.gstType === "composition") return "BILL OF SUPPLY";
    if (gst && (doc.business.gstin || hasTax)) return "TAX INVOICE";
  }
  return DOC_TYPES[type].toUpperCase();
}

function declarations(doc: Doc, gst: boolean) {
  const out: string[] = [];
  if (doc.meta.currency === "INR" && doc.business.gstType === "composition") out.push("Composition taxable person, not eligible to collect tax on supplies.");
  if (doc.meta.supplyType === "export-lut") out.push("Supply meant for export under LUT without payment of integrated tax.");
  if (doc.meta.supplyType === "sez-lut") out.push("Supply to SEZ unit or developer under LUT without payment of integrated tax.");
  if (gst && doc.meta.reverseCharge) out.push("Tax on this supply is payable by the recipient on reverse charge.");
  return out.join("\n");
}

export async function buildPdf(doc: Doc): Promise<ArrayBuffer> {
  const [regular, bold] = await loadFonts();
  const pdf = new jsPDF({ unit: "mm", format: doc.meta.paper, compress: true, putOnlyUsedFonts: true });
  pdf.addFileToVFS("NotoSans-Regular.ttf", regular);
  pdf.addFileToVFS("NotoSans-Bold.ttf", bold);
  pdf.addFont("NotoSans-Regular.ttf", "Doc", "normal");
  pdf.addFont("NotoSans-Bold.ttf", "Doc", "bold");
  pdf.setFont("Doc", "normal");
  const type = doc.docType;
  pdf.setProperties({ title: `${DOC_TYPES[type]} ${doc.meta.number}`.trim(), author: doc.business.name, creator: APP_NAME });

  const tpl = doc.template;
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const L = tpl === "sidebar" ? SIDEBAR_W + 8 : MARGIN;
  const right = W - MARGIN;
  const inner = right - L;
  const t = computeTotals(doc);
  const cur = doc.meta.currency;
  const accent = hex(doc.design.accent || DEFAULT_ACCENT[tpl]);
  const tint = mix(accent, tpl === "modern" ? 0.05 : 0.09);
  const rule: RGB = tpl === "gst" ? [130, 140, 135] : [205, 212, 208];
  const hair = tpl === "gst" ? 0.18 : 0.15;

  const num = (v: number) => new Intl.NumberFormat(localeFor(cur), { minimumFractionDigits: t.digits, maximumFractionDigits: t.digits }).format(v);
  const drawable = DRAWABLE_SYMBOLS.includes(cur);
  const cash = (v: number) => money(v, cur, drawable ? "symbol" : "code");
  const gst = t.mode === "split" || t.mode === "igst";
  const title = documentTitle(doc, gst, t.tax > 0);
  const number = doc.meta.number || "Draft";
  const isGoodsOnly = type === "delivery-challan";
  const showPaid = doc.design.showStamp && doc.status === "paid";
  const showCancelled = doc.design.showStamp && doc.status === "cancelled";

  const copies = ["ORIGINAL FOR RECIPIENT"];
  if (doc.meta.copies !== "original") copies.push("DUPLICATE FOR TRANSPORTER");
  if (doc.meta.copies === "triplicate") copies.push("TRIPLICATE FOR SUPPLIER");

  const qrAmount = t.paid > 0 && type !== "receipt" ? t.balance : t.grandTotal;
  const upiQr = cur === "INR" && doc.bank.upiQr && doc.bank.upiId && qrAmount > 0 && !["purchase-order", "receipt", "delivery-challan", "credit-note"].includes(type)
    ? await QRCode.toDataURL(upiLink(doc, qrAmount), { margin: 0, width: 240, errorCorrectionLevel: "M" })
    : "";

  const image = (src: string, x: number, y: number, w: number, h: number, align: "left" | "center" | "right" = "left") => {
    if (!src) return;
    try {
      const p = pdf.getImageProperties(src);
      const k = Math.min(w / p.width, h / p.height);
      const dw = p.width * k;
      const offset = align === "left" ? 0 : align === "right" ? w - dw : (w - dw) / 2;
      pdf.addImage(src, p.fileType, x + offset, y + (h - p.height * k) / 2, dw, p.height * k);
    } catch {
      throw new Error("A logo, signature or stamp could not be read. Remove it and upload it again.");
    }
  };

  copies.forEach((copyLabel, copyIndex) => {
    if (copyIndex) pdf.addPage();
    const firstPage = pdf.getNumberOfPages();
    let y = 14;

    const painted = new Set<number>();
    const paintPage = () => {
      const page = pdf.getCurrentPageInfo().pageNumber;
      if (tpl !== "sidebar" || painted.has(page)) return;
      painted.add(page);
      pdf.setFillColor(...tint).rect(0, 0, SIDEBAR_W, H, "F");
      pdf.setFillColor(...accent).rect(0, 0, 2.4, H, "F");
    };
    paintPage();

    const addPage = () => { pdf.addPage(); paintPage(); y = 22; };

    const table = (o: UserOptions) => {
      autoTable(pdf, {
        startY: y,
        margin: { left: L, right: MARGIN, top: 22, bottom: 24 },
        tableWidth: inner,
        theme: "grid",
        rowPageBreak: "avoid",
        willDrawPage: paintPage,
        ...o,
        styles: { font: "Doc", fontSize: 9, cellPadding: 1.6, lineColor: rule, lineWidth: hair, textColor: INK, overflow: "linebreak", valign: "top", ...o.styles },
        headStyles: { font: "Doc", fontStyle: "bold", fillColor: tint, textColor: INK, lineColor: rule, lineWidth: hair, ...o.headStyles },
      });
      y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    };

    const text = (body: string | string[], x: number, at: number, o: { size?: number; bold?: boolean; color?: RGB; align?: "left" | "center" | "right" } = {}) => {
      pdf.setFont("Doc", o.bold ? "bold" : "normal").setFontSize(o.size ?? 9).setTextColor(...(o.color ?? INK));
      pdf.text(body, x, at, { align: o.align ?? "left" });
    };
    const wrapped = (body: string, width: number, size: number, bold = false): string[] => {
      pdf.setFont("Doc", bold ? "bold" : "normal").setFontSize(size);
      return pdf.splitTextToSize(body, width);
    };
    // Heading plus wrapped body; returns the y below it, stopping at `limit` so long text can't run off a panel.
    const labelled = (heading: string, body: string, x: number, at: number, width: number, limit = H - 26) => {
      if (!body.trim()) return at;
      text(heading.toUpperCase(), x, at, { size: 7, bold: true, color: accent });
      let rows = wrapped(body, width, 8.5);
      const room = Math.max(1, Math.floor((limit - at - 4) / 3.9));
      if (rows.length > room) rows = [...rows.slice(0, room - 1), `${rows[room - 1]}…`];
      text(rows, x, at + 4, { size: 8.5 });
      return at + 4 + rows.length * 3.9 + 3;
    };

    const b = doc.business;
    const c = doc.client;
    const sellerName = b.name || "Your Business Name";
    const taxIds = [
      b.gstin && `GSTIN: ${b.gstin}`, b.pan && `PAN: ${b.pan}`, b.cin && `CIN: ${b.cin}`, b.taxId && `Tax ID: ${b.taxId}`,
      cur === "INR" && b.gstType === "composition" && "Composition dealer",
    ].filter(Boolean).join("    ");
    const contact = lines(b.address, place(b), [b.phone && `Mobile: ${b.phone}`, b.email && `Email: ${b.email}`].filter(Boolean).join("    "), b.website && `Website: ${b.website}`);
    const billLines = (addressHead: string) => lines(
      c.organization && c.contact && `Contact: ${c.contact}`,
      c.gstin && `GSTIN: ${c.gstin}`, c.gstin && `State Code: ${c.gstin.slice(0, 2)}`, c.taxId && `Tax ID: ${c.taxId}`,
      c.address && `${addressHead}${c.address}`, place(c), c.phone && `Mobile: ${c.phone}`, c.email && `Email: ${c.email}`,
    );
    const partyHead = type === "purchase-order" ? "Supplier" : type === "delivery-challan" ? "Consignee" : "Bill To";
    const clientName = c.organization || c.contact || "Customer";
    const shipHead = type === "purchase-order" ? "Deliver To" : "Shipping Address";

    const supply = doc.meta.placeOfSupply || (c.gstin && stateFromGstin(c.gstin) ? `${c.gstin.slice(0, 2)}-${stateFromGstin(c.gstin)}` : "");
    const details: [string, string][] = [[`${DOC_TYPES[type]} No.`, number], [type === "receipt" ? "Payment Date" : "Issue Date", fmtDate(doc.meta.date)]];
    if (type !== "receipt" && doc.meta.due) details.push([dueLabel(type), fmtDate(doc.meta.due)]);
    if (doc.meta.paymentTerms) details.push(["Payment Terms", doc.meta.paymentTerms === "0" ? "Due on receipt" : `Net ${doc.meta.paymentTerms}`]);
    if (doc.meta.originalRef) details.push(["Against Invoice", doc.meta.originalRef]);
    if (doc.meta.originalDate) details.push(["Invoice Date", fmtDate(doc.meta.originalDate)]);
    if (doc.meta.reason) details.push(["Reason", doc.meta.reason]);
    if (supply && (gst || doc.meta.placeOfSupply)) details.push(["Place of Supply", supply]);
    if (gst) details.push(["Reverse Charge", doc.meta.reverseCharge ? "Yes" : "No"]);
    if (doc.meta.reference) details.push(["Reference / PO", doc.meta.reference]);
    if (doc.meta.project) details.push(["Project", doc.meta.project]);
    if (doc.meta.ewayBill) details.push(["E-way Bill", doc.meta.ewayBill]);
    if (doc.meta.vehicle) details.push(["Vehicle No.", doc.meta.vehicle]);
    if (doc.meta.transport) details.push(["Transport", doc.meta.transport]);
    if (type === "receipt") {
      details.push(["Payment Method", doc.meta.paymentMethod]);
      if (doc.meta.paymentReference) details.push(["Payment Reference", doc.meta.paymentReference]);
    }
    for (const f of doc.customFields) if (f.label.trim() && f.value.trim()) details.push([f.label, f.value]);

    // Each template has its own header and parties block.
    if (tpl === "gst") {
      text(title, W / 2, y + 2, { size: 14, bold: true, color: accent, align: "center" });
      y += 6;
      const logoW = b.logo ? 30 : 0;
      const textX = MARGIN + (b.logo ? logoW + 4 : 3);
      const textW = inner - logoW - 7;
      const top = y;
      let cursor = y + 5;
      const name = wrapped(sellerName, textW, 12, true);
      text(name, textX, cursor + 1, { size: 12, bold: true });
      cursor += name.length * 5.2;
      if (taxIds) { text(taxIds, textX, cursor, { size: 8.5, bold: true }); cursor += 4; }
      if (contact) {
        const rows = wrapped(contact, textW, 8.5);
        text(rows, textX, cursor, { size: 8.5, color: MUTED });
        cursor += rows.length * 4;
      }
      const blockH = Math.max(cursor - top + 1, b.logo ? 24 : 0);
      image(b.logo, MARGIN + 3, top + 3, logoW, Math.max(blockH - 5, 18));
      pdf.setDrawColor(...rule).setLineWidth(hair).rect(MARGIN, top, inner, blockH + 2);
      y = top + blockH + 2;
      table({
        head: [[`${partyHead}: ${clientName}`, { content: "Document Details", colSpan: 2 }]],
        body: details.map(([k, v], i) => (i === 0 ? [{ content: lines(billLines("Billing Address:\n"), c.shipping && `${shipHead}:\n${c.shipping}`), rowSpan: details.length }, k, v] : [k, v])),
        columnStyles: { 0: { cellWidth: inner * 0.5 }, 1: { cellWidth: inner * 0.21, textColor: MUTED }, 2: { cellWidth: inner * 0.29, fontStyle: "bold" } },
      });
    } else if (tpl === "classic") {
      const logoH = b.logo ? 16 : 0;
      image(b.logo, W / 2 - 25, y - 2, 50, logoH, "center");
      y += logoH + (b.logo ? 3 : 2);
      const name = wrapped(sellerName, inner, 16, true);
      text(name, W / 2, y, { size: 16, bold: true, color: accent, align: "center" });
      y += name.length * 6;
      if (taxIds) { text(taxIds, W / 2, y, { size: 8, bold: true, align: "center" }); y += 4; }
      if (contact) {
        const rows = wrapped(contact.replace(/\n/g, "  |  "), inner, 8);
        text(rows, W / 2, y, { size: 8, color: MUTED, align: "center" });
        y += rows.length * 3.6;
      }
      pdf.setDrawColor(...accent).setLineWidth(0.6).line(MARGIN, y, right, y);
      pdf.setLineWidth(0.15).line(MARGIN, y + 1, right, y + 1);
      y += 7;
      pdf.setCharSpace(1.2);
      text(title, W / 2, y, { size: 12, bold: true, align: "center" });
      pdf.setCharSpace(0);
      y += 7;
      const half = (inner - 8) / 2;
      const left = labelled(partyHead, `${clientName}\n${billLines("Billing Address: ")}`, MARGIN, y, half);
      const rightEnd = labelled(shipHead, c.shipping, MARGIN + half + 8, y, half);
      y = Math.max(left, rightEnd) + 1;
      const perRow = 4;
      const rows: string[][] = [];
      for (let i = 0; i < details.length; i += perRow) {
        const slice = details.slice(i, i + perRow);
        rows.push(Array.from({ length: perRow }, (_, n) => (slice[n] ? `${slice[n][0]}\n${slice[n][1]}` : "")));
      }
      table({ body: rows, styles: { fontSize: 8, lineWidth: { top: hair, bottom: hair }, fillColor: tint }, columnStyles: { 0: { cellWidth: inner / 4 }, 1: { cellWidth: inner / 4 }, 2: { cellWidth: inner / 4 }, 3: { cellWidth: inner / 4 } } });
      y += 3;
    } else if (tpl === "modern") {
      y = 22;
      text(title.charAt(0) + title.slice(1).toLowerCase(), MARGIN, y, { size: 26, color: accent });
      image(b.logo, right - 34, y - 11, 34, 18, "right");
      y += 7;
      text(`No. ${number}`, MARGIN, y, { size: 9.5, color: MUTED });
      y += 9;
      const col = (inner - 12) / 3;
      const c1 = labelled("From", lines(sellerName, taxIds.replace(/ {4}/g, "\n"), contact), MARGIN, y, col);
      const c2 = labelled(partyHead, `${clientName}\n${billLines("Billing Address: ")}${c.shipping ? `\n\n${shipHead}:\n${c.shipping}` : ""}`, MARGIN + col + 6, y, col);
      const dx = MARGIN + (col + 6) * 2;
      let dy = y;
      for (const [k, v] of details) {
        const value = wrapped(v, col - 26, 8.5, true);
        text(wrapped(k, 24, 8)[0], dx, dy + 3, { size: 8, color: MUTED });
        text(value, right, dy + 3, { size: 8.5, bold: true, align: "right" });
        dy += 1.2 + value.length * 3.8;
      }
      y = Math.max(c1, c2, dy + 3) + 2;
    } else if (tpl === "bold") {
      const contactRows = wrapped(contact, inner - 62, 8);
      const nameRows = wrapped(sellerName, inner - 62, 11, true);
      const bandH = Math.max(50, 28 + nameRows.length * 5 + (taxIds ? 4 : 0) + contactRows.length * 3.6);
      pdf.setFillColor(...accent).rect(0, 0, W, bandH, "F");
      text(title, MARGIN, 18, { size: 22, bold: true, color: WHITE });
      let cursor = 26;
      text(nameRows, MARGIN, cursor, { size: 11, bold: true, color: WHITE });
      cursor += nameRows.length * 5;
      if (taxIds) { text(taxIds, MARGIN, cursor, { size: 8, bold: true, color: WHITE }); cursor += 4; }
      if (contact) text(contactRows, MARGIN, cursor, { size: 8, color: WHITE });
      if (b.logo) {
        pdf.setFillColor(...WHITE).roundedRect(right - 40, 13, 40, 18, 1.5, 1.5, "F");
        image(b.logo, right - 38.5, 14, 37, 16, "center");
      }
      if (!isGoodsOnly) {
        text(type === "receipt" ? "AMOUNT RECEIVED" : "AMOUNT DUE", right, bandH - 11, { size: 7.5, bold: true, color: WHITE, align: "right" });
        text(cash(type === "receipt" ? t.paid : t.balance), right, bandH - 4, { size: 15, bold: true, color: WHITE, align: "right" });
      }
      y = bandH + 8;
      const half = (inner - 8) / 2;
      const left = labelled(partyHead, `${clientName}\n${billLines("Billing Address: ")}`, MARGIN, y, half);
      const ship = labelled(shipHead, c.shipping, MARGIN, left, half);
      const dx = MARGIN + half + 8;
      let dy = y - 3;
      for (const [k, v] of details) {
        const value = wrapped(v, half - 34, 8.5, true);
        text(wrapped(k, 24, 8)[0], dx, dy + 3, { size: 8, color: MUTED });
        text(value, right, dy + 3, { size: 8.5, bold: true, align: "right" });
        dy += 1.2 + value.length * 3.9;
      }
      y = Math.max(ship, dy + 2) + 1;
    } else {
      // Sidebar: the seller, client and payment details run down a tinted column beside the document.
      const sx = 8;
      const sw = SIDEBAR_W - 13;
      let sy = 16;
      if (b.logo) { image(b.logo, sx, sy - 4, sw, 18); sy += 18; }
      const name = wrapped(sellerName, sw, 11, true);
      text(name, sx, sy, { size: 11, bold: true, color: accent });
      sy += name.length * 4.8 + 1;
      if (taxIds) { const rows = wrapped(taxIds.replace(/ {4}/g, "\n"), sw, 7.5, true); text(rows, sx, sy, { size: 7.5, bold: true }); sy += rows.length * 3.4 + 1; }
      if (contact) {
        let rows = wrapped(contact, sw, 7.5);
        if (rows.length > 10) rows = [...rows.slice(0, 9), `${rows[9]}…`];
        text(rows, sx, sy, { size: 7.5, color: MUTED });
        sy += rows.length * 3.4;
      }
      sy += 6;
      sy = labelled(partyHead, `${clientName}\n${billLines("Billing Address: ")}`, sx, sy, sw, H * 0.62);
      sy = labelled(shipHead, c.shipping, sx, sy, sw, H * 0.68);
      const bankBody = [["Bank", doc.bank.bankName], ["Account #", doc.bank.accountNumber], ["IFSC", doc.bank.ifsc], ["Branch", doc.bank.branch], ["UPI", doc.bank.upiId]]
        .filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
      sy = labelled("Bank / Payment Details", bankBody, sx, sy, sw, H - 62);
      if (upiQr) {
        const qy = Math.min(sy + 1, H - 58);
        pdf.addImage(upiQr, "PNG", sx, qy, 28, 28);
        text("Scan to pay with UPI", sx, qy + 31.5, { size: 7, color: MUTED });
      }
      y = 22;
      text(title, L, y, { size: 19, bold: true, color: accent });
      y += 5;
      const half = inner / 2;
      table({
        body: details.reduce<string[][]>((acc, [k, v], i) => {
          if (i % 2 === 0) acc.push([k, v, "", ""]);
          else { acc[acc.length - 1][2] = k; acc[acc.length - 1][3] = v; }
          return acc;
        }, []),
        styles: { fontSize: 8, lineWidth: 0, cellPadding: 0.9 },
        columnStyles: { 0: { cellWidth: half * 0.42, textColor: MUTED }, 1: { cellWidth: half * 0.58, fontStyle: "bold" }, 2: { cellWidth: half * 0.42, textColor: MUTED }, 3: { cellWidth: half * 0.58, fontStyle: "bold" } },
      });
      y += 4;
    }

    // Line items. HSN, tax and discount columns only appear when something fills them.
    const showHsn = t.rows.some((r) => r.item.hsn);
    const showTax = t.mode !== "none" && t.rows.some((r) => r.rate > 0);
    const showDisc = t.rows.some((r) => r.lineDiscount > 0);
    const narrow = tpl === "sidebar";
    const head = ["Sr No.", "Item / Description", ...(showHsn ? ["HSN/SAC"] : []), ...(showTax ? ["Tax %"] : []), ...(showDisc ? ["Disc %"] : []), "Qty / Unit", `Rate (${cur})`, `Amount (${cur})`];
    const widths = [narrow ? 9 : 11, "auto", ...(showHsn ? [narrow ? 17 : 20] : []), ...(showTax ? [narrow ? 11 : 15] : []), ...(showDisc ? [12] : []), narrow ? 16 : 21, narrow ? 21 : 27, narrow ? 26 : 36] as (number | "auto")[];
    const firstNumeric = 2 + (showHsn ? 1 : 0);
    const itemStyles: Partial<Record<Template, Partial<UserOptions>>> = {
      classic: { headStyles: { fillColor: accent, textColor: WHITE, lineWidth: 0 }, styles: { lineWidth: { bottom: hair } }, alternateRowStyles: { fillColor: mix(accent, 0.04) } },
      modern: { headStyles: { fillColor: WHITE, textColor: MUTED, lineWidth: { bottom: 0.35 }, lineColor: INK, fontSize: 8 }, styles: { lineWidth: { bottom: hair }, cellPadding: { top: 2.6, bottom: 2.6, left: 1, right: 1 } } },
      bold: { headStyles: { fillColor: INK, textColor: WHITE, lineWidth: 0 }, styles: { lineWidth: { bottom: hair }, cellPadding: 2.2 } },
      sidebar: { headStyles: { fillColor: tint, textColor: accent, lineWidth: 0, fontSize: 8 }, styles: { lineWidth: { bottom: hair }, fontSize: 8.5 } },
    };
    const look = itemStyles[tpl] ?? {};
    table({
      ...look,
      head: [head],
      body: t.rows.length
        ? t.rows.map((r, i) => [
            String(i + 1), lines(r.item.description, r.item.details), ...(showHsn ? [r.item.hsn] : []), ...(showTax ? [`${r.rate}%`] : []), ...(showDisc ? [`${r.item.discount ?? 0}%`] : []),
            `${r.item.quantity ?? 0} ${r.item.unit}`.trim(), num(r.item.rate ?? 0), num(r.gross),
          ])
        : [["", "No items added", ...head.slice(2).map(() => "")]],
      columnStyles: Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w, halign: i >= firstNumeric ? "right" : i === 0 ? "center" : "left" }])),
    });

    // Totals.
    const before = doc.totals.discountTiming === "before";
    const taxableLabel = `Taxable Amount (${cur})`;
    const sums: [string, string][] = t.discount && before
      ? [["Subtotal", num(t.subtotal)], ["Discount", `-${num(t.discount)}`], [taxableLabel, num(t.taxable)]]
      : [[taxableLabel, num(doc.totals.taxInclusive ? t.taxable : t.subtotal)]];
    if (t.mode === "split") sums.push(["CGST", num(t.central)], ["SGST / UTGST", num(t.state)]);
    else if (t.mode === "igst") sums.push(["IGST", num(t.tax)]);
    else if (t.tax) sums.push([doc.totals.taxLabel || "Tax", num(t.tax)]);
    if (t.cess) sums.push(["Cess", num(t.cess)]);
    if (t.shipping) sums.push(["Shipping", num(t.shipping)]);
    if (t.other) sums.push(["Other Charges", num(t.other)]);
    if (t.discount && !before) sums.push(["Final Discount (after tax)", `-${num(t.discount)}`]);
    sums.push(["Round Off", num(t.roundOff)]);
    sums.push([type === "receipt" ? "Document Total" : "Grand Total", cash(t.grandTotal)]);
    const grandRow = sums.length - 1;
    if (t.paid > 0 || type === "receipt") sums.push([type === "receipt" ? "Payment Received" : "Amount Paid", cash(t.paid)], ["Balance Due", cash(t.balance)]);
    const fullWidth = tpl === "gst";
    const sumsW = fullWidth ? inner : Math.min(inner, 88);
    const fillGrand = tpl === "classic" || tpl === "bold" || tpl === "sidebar";
    table({
      body: sums,
      pageBreak: "avoid",
      margin: { left: right - sumsW, right: MARGIN, top: 22, bottom: 24 },
      tableWidth: sumsW,
      styles: tpl === "modern" || tpl === "sidebar" ? { lineWidth: 0, cellPadding: 1.2 } : tpl === "gst" ? {} : { lineWidth: { bottom: hair } },
      columnStyles: { 0: { cellWidth: sumsW - 42, halign: "right" }, 1: { cellWidth: 42, halign: "right" } },
      didParseCell: ({ row, cell }) => {
        if (row.index === grandRow) {
          cell.styles.fontStyle = "bold";
          cell.styles.fontSize = tpl === "modern" ? 13 : 10;
          cell.styles.fillColor = fillGrand ? accent : tpl === "gst" ? tint : WHITE;
          cell.styles.textColor = fillGrand ? WHITE : tpl === "modern" ? accent : INK;
          if (tpl === "modern") cell.styles.lineWidth = { top: 0.35 };
        }
      },
    });
    if (doc.design.showWords && !isGoodsOnly) {
      const words = `${type === "receipt" ? "Amount Received" : "Amount Chargeable"} (in words): ${amountInWords(type === "receipt" ? t.paid : t.grandTotal, cur)}`;
      if (tpl === "gst") table({ body: [[words]], pageBreak: "avoid" });
      else {
        y += 2;
        table({ body: [[words]], pageBreak: "avoid", styles: { fontSize: 8, lineWidth: 0, textColor: MUTED, cellPadding: 0.8 } });
      }
    }

    // GST summary by HSN and rate.
    if (gst && t.tax && doc.design.showHsnSummary) {
      const split = t.mode === "split";
      if (tpl !== "gst") y += 3;
      table({
        head: split
          ? [[{ content: "HSN/SAC", rowSpan: 2 }, { content: "Taxable Value", rowSpan: 2 }, { content: "Central Tax", colSpan: 2 }, { content: "State/UT Tax", colSpan: 2 }, { content: "Total Tax", rowSpan: 2 }], ["Rate", "Amount", "Rate", "Amount"]]
          : [["HSN/SAC", "Taxable Value", "IGST Rate", "IGST Amount", "Total Tax"]],
        body: t.groups.map((g) => split
          ? [g.hsn, num(g.taxable), `${g.rate / 2}%`, num(g.central), `${g.rate / 2}%`, num(g.state), num(g.tax)]
          : [g.hsn, num(g.taxable), `${g.rate}%`, num(g.tax), num(g.tax)]),
        foot: [split
          ? ["TOTAL", num(t.groupTaxable), "", num(t.central), "", num(t.state), num(t.tax)]
          : ["TOTAL", num(t.groupTaxable), "", num(t.tax), num(t.tax)]],
        showFoot: "lastPage",
        pageBreak: "avoid",
        styles: { fontSize: 8, halign: "right" },
        headStyles: { halign: "center" },
        footStyles: { font: "Doc", fontStyle: "bold", fillColor: WHITE, textColor: INK, lineColor: rule, lineWidth: hair, halign: "right" },
        columnStyles: { 0: { halign: "left" } },
      });
    }

    // Payment details, UPI QR and signatures kept together. The sidebar template shows payment in its column.
    const bank: [string, string][] = tpl === "sidebar" ? [] : ([
      ["Bank", doc.bank.bankName], ["Account #", doc.bank.accountNumber], ["IFSC", doc.bank.ifsc], ["Branch", doc.bank.branch], ["UPI", doc.bank.upiId],
    ] as [string, string][]).filter(([, v]) => v);
    const signatures = doc.design.showSignatures;
    const qrHere = tpl !== "sidebar" && upiQr;
    if (signatures || bank.length || qrHere) {
      const blockHeight = signatures ? 48 : 34;
      if (y + blockHeight + 3 > H - 24) addPage();
      const blockTop = y + 3;
      const signX = right - 58;
      if (bank.length) {
        text("Bank / Payment Details", L, blockTop + 3, { size: 8.5, bold: true });
        bank.forEach(([k, v], i) => {
          const rowY = blockTop + 8 + i * 4.4;
          text(k, L, rowY, { size: 8.5, color: MUTED });
          text(wrapped(v, 50, 8.5)[0], L + 16, rowY, { size: 8.5 });
        });
      }
      if (qrHere) {
        const qrX = L + (bank.length ? 70 : 0);
        pdf.addImage(upiQr, "PNG", qrX, blockTop, 26, 26);
        text("Scan to pay with UPI", qrX + 13, blockTop + 29.5, { size: 7, color: MUTED, align: "center" });
      }
      if (signatures) {
        text("Signature", signX + 29, blockTop + 3, { size: 8.5, bold: true, align: "center" });
        text(wrapped(`For ${sellerName}`, 58, 8.5)[0], signX + 29, blockTop + 8, { size: 8.5, align: "center" });
        image(b.stamp, signX + 2, blockTop + 12, 24, 24, "left");
        image(b.signature, signX + (b.stamp ? 24 : 4), blockTop + 18, b.stamp ? 32 : 50, 18, "center");
        pdf.setDrawColor(...rule).setLineWidth(hair).line(signX + 4, blockTop + 38, right - 4, blockTop + 38);
        pdf.line(L, blockTop + 38, L + 54, blockTop + 38);
        text("Authorized Signatory", signX + 29, blockTop + 42, { size: 8, color: MUTED, align: "center" });
        text("Receiver's Signature", L + 27, blockTop + 42, { size: 8, color: MUTED, align: "center" });
      }
      y = blockTop + blockHeight - 3;
    }

    // Free-text sections.
    const sections: [string, string][] = [["Declaration", declarations(doc, gst)], ["Notes", doc.notes], ["Project / Delivery Terms", doc.timeline], ["Terms and Conditions", doc.terms], ["Note", doc.footer]];
    for (const [heading, body] of sections) {
      if (!body.trim()) continue;
      table({
        head: [[heading]],
        body: wrapped(body, inner - 6, 8.5).map((line) => [line]),
        styles: { fontSize: 8.5, lineWidth: 0, cellPadding: { top: 0.5, bottom: 0.5, left: 2, right: 2 } },
        headStyles: { fillColor: tpl === "modern" ? WHITE : tint, textColor: tpl === "modern" ? MUTED : INK, fontSize: 8.5, lineWidth: 0, cellPadding: 1.4 },
      });
      y += 2;
    }

    // Running header, status stamp and footer for every page of this copy.
    const lastPage = pdf.getNumberOfPages();
    for (let page = firstPage; page <= lastPage; page++) {
      pdf.setPage(page);
      const onBand = tpl === "bold" && page === firstPage;
      text(copyLabel, right, onBand ? 8 : 11, { size: 7, bold: true, color: onBand ? WHITE : INK, align: "right" });
      if (page > firstPage) text(`${number} - continued`, L, 15, { size: 8, color: MUTED });
      if (tpl === "bold") pdf.setFillColor(...accent).rect(0, H - 4, W, 4, "F");
      pdf.setDrawColor(...rule).setLineWidth(hair).line(L, H - 19, right, H - 19);
      text(`Page ${page - firstPage + 1} / ${lastPage - firstPage + 1}`, L, H - 14.5, { size: 8, color: MUTED });
      text(b.signature ? "This is a computer generated document." : "This is a computer generated document and requires no signature.", right, H - 14.5, { size: 7, color: MUTED, align: "right" });
    }
    pdf.setPage(firstPage);
    if (showPaid || showCancelled) {
      const color: RGB = showPaid ? [15, 125, 80] : [179, 38, 30];
      const G = (pdf as unknown as { GState: new (o: { opacity: number }) => unknown }).GState;
      pdf.saveGraphicsState();
      (pdf as unknown as { setGState: (g: unknown) => void }).setGState(new G({ opacity: 0.16 }));
      pdf.setFont("Doc", "bold").setFontSize(64).setTextColor(...color);
      pdf.text(showPaid ? "PAID" : "CANCELLED", (L + right) / 2, H / 2 + 8, { align: "center", angle: 28 });
      pdf.restoreGraphicsState();
    }
    pdf.setPage(lastPage);
  });

  return pdf.output("arraybuffer");
}
