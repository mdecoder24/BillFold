import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { TOOLS } from "@/lib/routes";
import { Logo } from "./Logo";
import { Stage } from "./Stage";

const OPEN = "/invoice";
const STAGE_CHECK = "try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches){var c=document.createElement('canvas');if(c.getContext('webgl2')||c.getContext('webgl'))document.documentElement.dataset.stage='3d'}}catch(e){}";

const FEATURES: { title: string; lead: string; items: string[] }[] = [
  {
    title: "Your company, set up once",
    lead: "Enter your details one time. Every new document starts with them.",
    items: [
      "GST registration: registered, composition scheme or not registered",
      "GSTIN check that catches typing mistakes and fills in your state and PAN",
      "Company logo, authorized signature and company stamp",
      "Bank details and UPI ID",
      "Default template, colour, payment days, tax rate, terms and notes",
      "Running numbers, or numbers with the financial year like ACM/26-27/0001",
    ],
  },
  {
    title: "GST worked out for you",
    lead: "The right tax is chosen from your GSTIN, your client's GSTIN and the place of supply.",
    items: [
      "CGST and SGST, or IGST, chosen automatically",
      "HSN/SAC on each line and an HSN tax summary on the PDF",
      "Cess, tax-inclusive prices and tax on shipping or other charges",
      "Reverse charge, with the required wording printed",
      "Export and SEZ supplies under LUT",
      "Tax invoice or bill of supply, based on your registration",
      "VAT or any other tax, in any currency",
    ],
  },
  {
    title: "Ten document types",
    lead: "Switch type at any time and your details carry over.",
    items: [
      "Invoice, proforma invoice and receipt",
      "Quotation, estimate and project estimate",
      "Purchase order and delivery challan",
      "Credit note and debit note, linked to the original invoice",
      "Turn a quotation into an invoice, or an invoice into a receipt",
    ],
  },
  {
    title: "Everything an invoice needs",
    lead: "Common fields are in front. The rest wait under More details until you need them.",
    items: [
      "Decimal quantities, units, item discounts and notes on each line",
      "Discount before or after tax, shipping, other charges and rounding",
      "Amount paid and balance due",
      "Payment terms from due on receipt to Net 60",
      "E-way bill, vehicle, transport, PO number and project fields",
      "Up to eight custom fields of your own",
      "UPI QR code with the amount filled in",
      "Original, duplicate and triplicate copies, on A4 or US Letter",
    ],
  },
  {
    title: "Track what you're owed",
    lead: "See every saved document and where it stands.",
    items: [
      "Billed, received, outstanding and overdue totals",
      "Draft, sent, partial, paid and cancelled status, with a PAID mark on the PDF",
      "Search and filter by type, status, month or financial year",
      "Sales register export as a CSV for your accountant",
      "Payment reminders by WhatsApp or email",
    ],
  },
  {
    title: "Clients and products remembered",
    lead: "Saving a document adds its client and items, so the next one is quicker.",
    items: [
      "Client and product names autocomplete and fill in their details",
      "Outstanding amount shown for each client",
      "Reusable templates for documents you send often",
      "Send through WhatsApp or email, share the PDF, or open it to print",
    ],
  },
  {
    title: "Admin and guest access",
    lead: "Keep your saved work private on a shared browser, and still let someone try it.",
    items: [
      "Admin: full access behind a passcode, signed out after 30 minutes idle",
      "Guest: create and download documents, with no view of saved data",
      "Guest work is erased when they leave or close the tab",
    ],
  },
  {
    title: "Five calculators",
    lead: "Quick answers without leaving the page.",
    items: ["GST, added or removed", "Profit margin and markup", "Business margin", "Depreciation, straight line or written down", "Employee PF"],
  },
];

function OpenButton({ label = `Open ${APP_NAME}` }: { label?: string }) {
  return <Link href={OPEN} className="btn primary land-cta">{label} <ArrowRight size={17} aria-hidden /></Link>;
}

export function Landing() {
  return (
    <div className="land">
      {/* Set before first paint, so a device that can run the 3D scene never flashes the plain layout. */}
      <script dangerouslySetInnerHTML={{ __html: STAGE_CHECK }} />
      <a className="skip" href="#main">Skip to content</a>
      <header className="land-head">
        <Link href="/" className="brand" aria-label={`${APP_NAME} home`}><Logo /></Link>
        <nav aria-label="Page sections" className="land-nav">
          <a href="#features">Features</a>
          <a href="#templates">Templates</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <Link href={OPEN} className="btn primary">Open {APP_NAME}</Link>
      </header>

      <main id="main">
        <Stage />

        <dl className="land-facts">
          <div><dt>10</dt><dd>document types</dd></div>
          <div><dt>5</dt><dd>PDF templates</dd></div>
          <div><dt>5</dt><dd>business calculators</dd></div>
          <div><dt>0</dt><dd>accounts or uploads</dd></div>
        </dl>

        <section id="features" className="land-section">
          <h2>What&apos;s in {APP_NAME}</h2>
          <div className="land-features">
            {FEATURES.map((f) => (
              <article key={f.title} className="land-feature">
                <div>
                  <h3>{f.title}</h3>
                  <p className="muted">{f.lead}</p>
                </div>
                <ul>{f.items.map((i) => <li key={i}>{i}</li>)}</ul>
              </article>
            ))}
          </div>
        </section>

        <section className="land-section land-split">
          <div>
            <h2>All your documents in one place</h2>
            <p className="muted">Save what you create, then see what&apos;s been billed, what&apos;s been paid and what&apos;s overdue.</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/documents.jpg" width={1100} height={520} loading="lazy" alt="The Documents page, showing billed, received, outstanding and overdue totals above a list of saved invoices." />
        </section>

        <section id="privacy" className="land-section land-split">
          <div>
            <h2>Your data stays on your device</h2>
            <p className="muted">PDFs are made in your browser. Your invoices, clients and company details aren&apos;t sent to a server.</p>
          </div>
          <ul className="land-privacy">
            <li><strong>No account.</strong> Open it and start. There&apos;s nothing to sign up for.</li>
            <li><strong>Back up your work.</strong> Clearing browser data deletes everything, so export a backup file regularly. Your data also won&apos;t follow you to another device unless you restore that file.</li>
            <li><strong>Mind shared computers.</strong> The admin passcode keeps casual users out, but data is stored unencrypted, so someone with technical skills and access to the browser could still read it.</li>
          </ul>
        </section>

        <section className="land-final">
          <h2>Make your first invoice now</h2>
          <OpenButton />
        </section>
      </main>

      <footer className="land-foot">
        <nav aria-label="Document tools">
          <Link href={OPEN}>Invoice</Link>
          {TOOLS.map((t) => <Link key={t.slug} href={`/${t.slug}`}>{t.nav}</Link>)}
          <Link href="/calculators">Calculators</Link>
        </nav>
        <p className="small muted">Check tax treatment with your accountant. {APP_NAME} doesn&apos;t file returns or generate e-invoice IRNs.</p>
      </footer>
    </div>
  );
}
