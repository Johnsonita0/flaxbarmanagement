import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Package, Search } from "lucide-react";
import PageHeading from "../components/PageHeading";
import PreviewNotice from "../components/PreviewNotice";
import "./../css/OperationsPages.css";

type StockItem = { name: string; category: string; stock: number; unit: string; reorder: number };
const initialProducts: StockItem[] = [
  { name: "Heineken", category: "Beverage", stock: 48, unit: "bottles", reorder: 12 },
  { name: "Coca-Cola", category: "Beverage", stock: 42, unit: "bottles", reorder: 20 },
  { name: "Chips", category: "Snacks", stock: 12, unit: "packs", reorder: 15 },
  { name: "Water", category: "Beverage", stock: 36, unit: "bottles", reorder: 20 },
  { name: "Cigarette", category: "Tobacco", stock: 1, unit: "packs", reorder: 10 },
];

export default function InventoryPage({ onMovements }: { onMovements: () => void }) {
  const [products, setProducts] = useState(initialProducts);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const filtered = useMemo(() => products.filter((product) => {
    const state = product.stock === 0 ? "Out of Stock" : product.stock <= product.reorder ? "Low Stock" : "In Stock";
    return (filter === "All" || filter === state) && product.name.toLowerCase().includes(query.toLowerCase());
  }), [filter, products, query]);

  return (
    <section className="module-page">
      <PageHeading title="Inventory" description="Stock levels, low-stock alerts and item movement." action={{ label: "Add Product", onClick: () => setShowForm(true) }} />
      <PreviewNotice />
      <button className="icon-link" onClick={onMovements}><ArrowDownToLine size={15} /> View stock movement history</button>
      <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products…" /></label>
      <div className="tab-strip">{["All", "In Stock", "Low Stock", "Out of Stock"].map((tab) => <button className={`tab-chip${filter === tab ? " tab-chip--active" : ""}`} key={tab} onClick={() => setFilter(tab)}>{tab}</button>)}</div>
      <div className="surface-card inventory-list">
        {filtered.map((product, index) => {
          const low = product.stock <= product.reorder;
          return <div className="record-row" key={product.name}><span className={`product-token product-token--${index % 4}`}><Package size={18} /></span><span className="record-row__main"><strong>{product.name}</strong><small>{product.category} · Stock: {product.stock} {product.unit}</small></span><span className={`status-pill${low ? " status-pill--warning" : ""}`}>{product.stock === 0 ? "Out of Stock" : low ? "Low Stock" : "In Stock"}</span><button className="icon-link inventory-move" aria-label={`Record a movement for ${product.name}`} onClick={onMovements}><ArrowUpFromLine size={16} /></button></div>;
        })}
        {filtered.length === 0 && <p className="empty-state">No products match this filter.</p>}
      </div>
      {showForm && <div className="preview-modal"><section className="preview-modal__body" role="dialog" aria-modal="true"><div className="preview-modal__heading"><h2>Add product</h2><button className="preview-modal__close" onClick={() => setShowForm(false)}>×</button></div><form className="form-card" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get("name") ?? "").trim(); const stock = Number(data.get("stock") ?? 0); if (name) setProducts((current) => [{ name, category: String(data.get("category") ?? "Beverage"), stock, unit: "items", reorder: 5 }, ...current]); setShowForm(false); }}><label>Product name<input name="name" required /></label><label>Category<select name="category"><option>Beverage</option><option>Snacks</option><option>Tobacco</option></select></label><label>Opening quantity<input name="stock" type="number" min="0" defaultValue="0" /></label><div className="form-actions"><button className="button button--outline" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button button--primary" type="submit">Add to preview</button></div></form></section></div>}
    </section>
  );
}
