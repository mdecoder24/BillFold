import type { Metadata } from "next";
import { Products } from "@/components/Library";

export const metadata: Metadata = { title: "Products", robots: { index: false } };

export default function Page() {
  return (
    <div className="page">
      <h1>Products</h1>
      <p className="page-sub muted">Saved items autocomplete when you add a line to a document.</p>
      <Products />
    </div>
  );
}
