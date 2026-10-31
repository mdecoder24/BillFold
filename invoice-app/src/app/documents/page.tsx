import type { Metadata } from "next";
import { Documents } from "@/components/Documents";

export const metadata: Metadata = { title: "Documents", robots: { index: false } };

export default function Page() {
  return (
    <div className="page">
      <h1>Documents</h1>
      <p className="page-sub muted">Everything you have saved, with what is billed, received and overdue.</p>
      <Documents />
    </div>
  );
}
