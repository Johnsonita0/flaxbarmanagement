import { useState } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight } from "lucide-react";
import PageHeading from "../components/PageHeading";
import PreviewNotice from "../components/PreviewNotice";
import "./../css/OperationsPages.css";

const movements = [
  { type: "Received", item: "Heineken · 24 bottles", date: "May 4, 2026 · 10:17 AM" },
  { type: "Issued", item: "Chips · 10 units", date: "May 4, 2026 · 09:45 AM" },
  { type: "Received", item: "Coca-Cola · 48 units", date: "May 3, 2026 · 04:20 PM" },
  { type: "Issued", item: "Water · 12 units", date: "May 3, 2026 · 01:15 PM" },
  { type: "Received", item: "Snacks · 30 units", date: "May 2, 2026 · 11:32 AM" },
];

export default function StockMovementPage({ onBack }: { onBack: () => void }) {
  const [filter, setFilter] = useState("All Products");
  return (
    <section className="module-page">
      <PageHeading title="Stock Movement" description="Receipts and issues from the inventory ledger." />
      <PreviewNotice />
      <button className="icon-link" onClick={onBack}><ArrowLeft size={15} /> Back to inventory</button>
      <label className="form-select-label">Product<select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All Products</option><option>Heineken</option><option>Chips</option><option>Coca-Cola</option><option>Water</option></select></label>
      <div className="surface-card record-list">{movements.filter((movement) => filter === "All Products" || movement.item.startsWith(filter)).map((movement, index) => <div className="record-row" key={`${movement.date}-${index}`}><span className={`cash-entry-icon${movement.type === "Received" ? " cash-entry-icon--in" : " cash-entry-icon--out"}`}>{movement.type === "Received" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span><span className="record-row__main"><strong>{movement.type} · {movement.item}</strong><small>{movement.date}</small></span><span className={`status-pill${movement.type === "Issued" ? " status-pill--warning" : ""}`}>{movement.type}</span></div>)}</div>
    </section>
  );
}
