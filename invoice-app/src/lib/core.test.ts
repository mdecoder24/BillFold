import { describe, expect, it } from "vitest";
import { blankDoc, blankItem, normalizeDoc, type Doc } from "./model";
import { amountInWords, computeTotals, resolveTaxMode } from "./totals";
import { gstinProblem, panFromGstin, stateFromGstin, validateDoc } from "./validate";
import { documentsCsv, isOverdue, whatsappLink } from "./share";
import { financialYear, numberHead } from "./storage";
import { blankCompany, normalizeCompany, normalizeProduct } from "./model";

const doc = (items: [number, number, number][], patch: (d: Doc) => void = () => {}) => {
  const d = blankDoc("invoice");
  d.items = items.map(([quantity, rate, taxRate]) => ({ ...blankItem(), description: "x", quantity, rate, taxRate }));
  patch(d);
  return d;
};

describe("tax mode", () => {
  it("splits with no state data", () => expect(resolveTaxMode(doc([]))).toBe("split"));
  it("uses IGST across states", () => {
    expect(resolveTaxMode(doc([], (d) => { d.business.gstin = "27AAPFU0939F1ZV"; d.client.gstin = "29AAPFU0939F1ZS"; }))).toBe("igst");
  });
  it("place of supply beats client GSTIN", () => {
    expect(resolveTaxMode(doc([], (d) => { d.business.gstin = "27AAPFU0939F1ZV"; d.client.gstin = "29AAPFU0939F1ZS"; d.meta.placeOfSupply = "27-Maharashtra"; }))).toBe("split");
  });
  it("is generic outside INR", () => expect(resolveTaxMode(doc([], (d) => { d.meta.currency = "USD"; }))).toBe("generic"));
});

describe("totals", () => {
  it("computes split GST", () => {
    const t = computeTotals(doc([[2, 1000, 18]]));
    expect(t).toMatchObject({ subtotal: 2000, central: 180, state: 180, tax: 360, grandTotal: 2360 });
  });
  it("supports fractional quantity", () => expect(computeTotals(doc([[1.5, 1000, 0]])).grandTotal).toBe(1500));
  it("before-tax discount lowers taxable value and shares exactly", () => {
    const t = computeTotals(doc([[1, 100, 18], [1, 200, 5]], (d) => { d.totals.discountValue = 10; }));
    expect(t.discount).toBe(30);
    expect(t.taxable).toBe(270);
    expect(t.rows.map((r) => r.taxable)).toEqual([90, 180]);
    expect(t.tax).toBe(25.2);
    expect(t.grandTotal).toBe(295.2);
  });
  it("after-tax discount leaves tax alone", () => {
    const t = computeTotals(doc([[1, 100, 18]], (d) => { d.totals.discountValue = 10; d.totals.discountTiming = "after"; }));
    expect(t.tax).toBe(18);
    expect(t.grandTotal).toBe(106.2);
  });
  it("caps a flat discount at the subtotal", () => {
    const t = computeTotals(doc([[1, 100, 0]], (d) => { d.totals.discountType = "flat"; d.totals.discountValue = 500; }));
    expect(t.grandTotal).toBe(0);
  });
  it("auto rounds to the whole unit", () => {
    const t = computeTotals(doc([[1, 100.4, 0]], (d) => { d.totals.autoRound = true; }));
    expect(t.roundOff).toBe(-0.4);
    expect(t.grandTotal).toBe(100);
  });
  it("respects zero-decimal currencies", () => {
    const t = computeTotals(doc([[1, 99.6, 0]], (d) => { d.meta.currency = "JPY"; }));
    expect(t.digits).toBe(0);
    expect(t.grandTotal).toBe(100);
  });
  it("avoids float drift on shipping", () => {
    const t = computeTotals(doc([[3, 0.1, 0]], (d) => { d.totals.shipping = 0.2; }));
    expect(t.grandTotal).toBe(0.5);
  });
  it("groups tax by HSN and rate", () => {
    const d = doc([[1, 100, 18], [1, 100, 18], [1, 100, 5]]);
    d.items[0].hsn = d.items[1].hsn = "9983";
    expect(computeTotals(d).groups).toHaveLength(2);
  });
});

describe("words", () => {
  it("uses lakh and crore for INR", () => {
    expect(amountInWords(12345678.5, "INR")).toBe("Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight and Fifty Paise Only");
  });
  it("uses million for USD", () => expect(amountInWords(1000000.25, "USD")).toBe("USD One Million and 25/100 Only"));
  it("handles zero", () => expect(amountInWords(0, "INR")).toBe("Rupees Zero Only"));
});

describe("validation", () => {
  it("accepts a real GSTIN and rejects a typo", () => {
    expect(gstinProblem("27AAPFU0939F1ZV")).toBeNull();
    expect(gstinProblem("27AAPFU0939F1ZX")).toMatch(/check digit/);
    expect(gstinProblem("short")).toMatch(/15-character/);
  });
  it("requires the essentials", () => {
    expect(Object.keys(validateDoc(blankDoc("invoice")))).toEqual(expect.arrayContaining(["business.name", "client.organization", "meta.number"]));
  });
  it("requires a project on project estimates", () => {
    expect(validateDoc(blankDoc("project-estimate"))["meta.project"]).toBeTruthy();
  });
});

describe("normalizeDoc", () => {
  it("drops unknown keys, bad types and unsafe images", () => {
    const d = normalizeDoc(JSON.parse('{"__proto__":{"x":1},"evil":1,"docType":"nope","business":{"name":5,"logo":"javascript:alert(1)"},"items":[{"description":"a","rate":"9"}],"meta":{"taxMode":"bad"}}'));
    expect("evil" in d).toBe(false);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(d.docType).toBe("invoice");
    expect(d.business.name).toBe("");
    expect(d.business.logo).toBe("");
    expect(d.items[0].rate).toBeNull();
    expect(d.meta.taxMode).toBe("auto");
  });
  it("round-trips a document", () => {
    const d = doc([[2, 50, 5]], (x) => { x.business.name = "Acme"; });
    expect(normalizeDoc(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
});

describe("new tax features", () => {
  it("applies an item discount before tax", () => {
    const t = computeTotals(doc([[2, 100, 18]], (d) => { d.items[0].discount = 10; }));
    expect(t.rows[0].taxable).toBe(180);
    expect(t.tax).toBe(32.4);
    expect(t.grandTotal).toBe(212.4);
  });
  it("adds cess on the taxable value", () => {
    const t = computeTotals(doc([[1, 100, 28]], (d) => { d.items[0].cess = 12; }));
    expect(t.tax).toBe(28);
    expect(t.cess).toBe(12);
    expect(t.grandTotal).toBe(140);
  });
  it("works tax out of inclusive prices", () => {
    const t = computeTotals(doc([[1, 118, 18]], (d) => { d.totals.taxInclusive = true; }));
    expect(t.taxable).toBe(100);
    expect(t.tax).toBe(18);
    expect(t.grandTotal).toBe(118);
  });
  it("taxes shipping only when asked and lists it in the summary", () => {
    const t = computeTotals(doc([[1, 100, 18]], (d) => { d.totals.shipping = 100; d.totals.chargesTaxRate = 18; }));
    expect(t.tax).toBe(36);
    expect(t.grandTotal).toBe(236);
    expect(t.groupTaxable).toBe(200);
    expect(t.groups.find((g) => g.hsn === "Charges")?.tax).toBe(18);
  });
  it("charges no GST for composition, unregistered or LUT supplies", () => {
    expect(computeTotals(doc([[1, 100, 18]], (d) => { d.business.gstType = "composition"; })).tax).toBe(0);
    expect(computeTotals(doc([[1, 100, 18]], (d) => { d.business.gstType = "unregistered"; })).tax).toBe(0);
    expect(computeTotals(doc([[1, 100, 18]], (d) => { d.meta.supplyType = "export-lut"; })).tax).toBe(0);
  });
  it("works out the balance from the amount paid", () => {
    expect(computeTotals(doc([[1, 100, 0]], (d) => { d.meta.amountReceived = 30; })).balance).toBe(70);
    expect(computeTotals(doc([[1, 100, 0]])).balance).toBe(100);
  });
});

describe("company helpers", () => {
  it("reads state and PAN from a GSTIN", () => {
    expect(stateFromGstin("29AAPFU0939F1ZR")).toBe("Karnataka");
    expect(panFromGstin("29AAPFU0939F1ZR")).toBe("AAPFU0939F");
  });
  it("splits the financial year in April", () => {
    expect(financialYear("2026-03-31")).toBe("25-26");
    expect(financialYear("2026-04-01")).toBe("26-27");
  });
  it("keeps financial-year numbers within the 16-character GST limit", () => {
    const c = blankCompany();
    c.settings.numbering = "fy";
    c.settings.prefix = "ABCDE";
    expect(`${numberHead("invoice", c, "2026-10-31")}0001`.length).toBeLessThanOrEqual(16);
  });
  it("cleans untrusted company and product data", () => {
    const c = normalizeCompany({ business: { stamp: "javascript:alert(1)", gstType: "evil" }, design: { accent: "red;x" }, settings: { numbering: "evil", prefix: "<b>!" }, template: "evil" });
    expect(c.business.stamp).toBe("");
    expect(c.business.gstType).toBe("regular");
    expect(c.design.accent).toBe("");
    expect(c.settings.numbering).toBe("plain");
    expect(c.settings.prefix).toBe("B");
    expect(c.template).toBe("gst");
    expect(normalizeProduct({ rate: "9", evil: 1 })).not.toHaveProperty("evil");
  });
  it("limits custom fields to known keys", () => {
    const d = normalizeDoc({ customFields: [{ label: "a", value: "b", evil: 1 }, ...Array(20).fill({ label: "x", value: "y" })] });
    expect(d.customFields).toHaveLength(8);
    expect(d.customFields[0]).toEqual({ label: "a", value: "b" });
  });
});

describe("sharing and export", () => {
  it("neutralises spreadsheet formulas in CSV", () => {
    const csv = documentsCsv([doc([[1, 100, 0]], (d) => { d.client.organization = "=HYPERLINK(1)"; d.meta.number = "+1,2"; })]);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("\"'+1,2\"");
  });
  it("adds the India code to a 10-digit phone and encodes text", () => {
    expect(whatsappLink("90000 00000", "a&b")).toBe("https://wa.me/919000000000?text=a%26b");
  });
  it("only sent, unpaid, past-due invoices are overdue", () => {
    const d = doc([], (x) => { x.status = "sent"; x.meta.due = "2026-01-01"; });
    expect(isOverdue(d, "2026-02-01")).toBe(true);
    expect(isOverdue({ ...d, status: "paid" }, "2026-02-01")).toBe(false);
    expect(isOverdue({ ...d, status: "draft" }, "2026-02-01")).toBe(false);
    expect(isOverdue(d, "2025-12-01")).toBe(false);
  });
});
