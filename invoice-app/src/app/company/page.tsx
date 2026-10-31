import type { Metadata } from "next";
import { Company } from "@/components/Company";

export const metadata: Metadata = { title: "Company", robots: { index: false } };

export default function Page() {
  return (
    <div className="page">
      <h1>Company</h1>
      <p className="page-sub muted">Your GST registration, logo, signature, bank details and defaults, applied to every new document.</p>
      <Company />
    </div>
  );
}
