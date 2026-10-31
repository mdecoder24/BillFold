import type { Metadata } from "next";
import { Clients } from "@/components/Library";

export const metadata: Metadata = { title: "Clients", robots: { index: false } };

export default function Page() {
  return (
    <div className="page">
      <h1>Clients</h1>
      <p className="page-sub muted">Picked up automatically from documents you save. Start a new invoice for any of them.</p>
      <Clients />
    </div>
  );
}
