# Billfold

A GST invoice generator that runs entirely in the browser. No account and no server: documents, clients and company details stay in this browser's storage.

## Run

```bash
npm install
npm run dev      # http://localhost:3000, or the next free port. / is the landing page, /invoice opens the portal
npm test
npm run build    # static site in out/
```

Rename the app in `src/lib/brand.ts`. `vercel.json` holds the security headers; copy them if you host elsewhere.

## Logo

The B is an invoice page with a folded corner and two ruled lines. Files are in `public/brand/`; in the app use `src/components/Logo.tsx`.

## What it does

- **Documents:** invoice, tax invoice, bill of supply, estimate, quotation, project estimate, proforma, receipt, purchase order, credit note, debit note, delivery challan.
- **Company:** GST registration type, GSTIN (fills state and PAN), logo, signature, stamp, bank, UPI and defaults, applied to every new document.
- **GST:** CGST, SGST, IGST, cess, HSN summary, place of supply, reverse charge, LUT export and SEZ, composition, tax-inclusive prices, tax on charges.
- **Templates:** five layouts, any accent colour, A4 or Letter, up to three copies.
- **Records:** status, overdue tracking, totals, CSV sales register, reminders, JSON backup and restore.
- **Libraries:** clients and products remembered on save and autocompleted.

Check tax treatment with your accountant.
