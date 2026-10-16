import { useState } from "react";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import PageHeading from "../components/PageHeading";
import PreviewNotice from "../components/PreviewNotice";
import "./../css/OperationsPages.css";

const products = [
  { name: "Heineken", price: 1200 },
  { name: "Coca-Cola", price: 700 },
  { name: "Chips", price: 500 },
  { name: "Water", price: 300 },
];

export default function SalesPage() {
  const [newSale, setNewSale] = useState(false);
  const [quantities, setQuantities] = useState<number[]>([0, 0, 0, 0]);
  const [previewMessage, setPreviewMessage] = useState("");
  const total = products.reduce((sum, product, index) => sum + product.price * quantities[index], 0);

  return (
    <section className="module-page">
      <PageHeading title={newSale ? "New Sale" : "Sales"} description={newSale ? "Add items to a sale preview." : "Sales overview by date, staff member and department."} action={!newSale ? { label: "New Sale", onClick: () => { setNewSale(true); setPreviewMessage(""); } } : undefined} />
      <PreviewNotice />
      {newSale ? (
        <div className="surface-card">
          <button className="icon-link" onClick={() => setNewSale(false)}><ArrowLeft size={15} /> Back to sales</button>
          <div className="sale-list">{products.map((product, index) => <div className="record-row" key={product.name}><span className="product-token product-token--0"><ShoppingCart size={17} /></span><span className="record-row__main"><strong>{product.name}</strong><small>₦{product.price.toLocaleString()} each</small></span><div className="quantity-control"><button aria-label={`Remove one ${product.name}`} onClick={() => setQuantities((values) => values.map((count, i) => i === index ? Math.max(0, count - 1) : count))}>−</button><span>{quantities[index]}</span><button aria-label={`Add one ${product.name}`} onClick={() => setQuantities((values) => values.map((count, i) => i === index ? count + 1 : count))}>+</button></div></div>)}</div>
          <div className="sale-total"><span>Total</span><strong>₦{total.toLocaleString()}</strong></div>
          {previewMessage && <div className="alert alert--success" role="status">{previewMessage}</div>}
          <button className="button button--primary full-width" disabled={total === 0} onClick={() => setPreviewMessage("Sale preview complete. This has not been recorded or charged.")}>Preview sale</button>
        </div>
      ) : (
        <>
          <div className="tab-strip"><button className="tab-chip tab-chip--active">Today</button><button className="tab-chip">This week</button><button className="tab-chip">This month</button><button className="tab-chip">All time</button></div>
          <div className="metric-grid"><div className="metric-card"><small>Sales today · sample</small><strong>₦482,500</strong><span className="metric-trend">↑ 12% vs yesterday</span></div><div className="metric-card"><small>Transactions</small><strong>84</strong><span className="metric-trend">Preview figure</span></div></div>
          <div className="surface-card">
            <div className="surface-card__heading"><div><h2>Sales activity</h2><p>Sample daily activity · not live data</p></div></div>
            <div className="bar-chart" aria-label="Sample sales chart">{[45, 68, 54, 78, 61, 88, 72].map((height, index) => <div className="bar-chart__column" key={index}><span style={{ height: `${height}%` }} /><small>{["M", "T", "W", "T", "F", "S", "S"][index]}</small></div>)}</div>
          </div>
          <div className="surface-card"><div className="surface-card__heading"><div><h2>Top products</h2><p>Sample sales mix</p></div><button>View report</button></div>{products.slice(0, 3).map((product, index) => <div className="record-row" key={product.name}><span className="rank-number">{index + 1}</span><span className="record-row__main"><strong>{product.name}</strong><small>Bar · Sample total</small></span><strong className="record-row__meta">₦{(product.price * 24).toLocaleString()}</strong></div>)}</div>
        </>
      )}
    </section>
  );
}
