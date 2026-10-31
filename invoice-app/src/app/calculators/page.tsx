import type { Metadata } from "next";
import { Calculators } from "@/components/Calculators";

export const metadata: Metadata = { title: "Business calculators", description: "GST, profit margin, business margin, depreciation and employee PF calculators." };

export default function Page() {
  return (
    <div className="page">
      <h1>Calculators</h1>
      <p className="page-sub muted">Quick figures for GST, margins, depreciation and PF.</p>
      <Calculators />
    </div>
  );
}
