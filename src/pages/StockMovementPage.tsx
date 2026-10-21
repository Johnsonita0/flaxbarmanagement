import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, RefreshCw } from "lucide-react";
import { apiRequest } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import PageHeading from "../components/PageHeading";
import "./../css/OperationsPages.css";

interface HandoverProduct { id: string; name: string; stock: number; unit: string; }
interface HandoverStaff { id: string; name: string; }
interface HandoverItem { productId: string; productName: string; sentQuantity: number; receivedQuantity: number | null; }
interface Handover {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  status: "pending" | "accepted";
  createdAt: string;
  acceptedAt: string | null;
  items: HandoverItem[];
}
interface StockDelivery {
  id: string;
  departmentName: string;
  productName: string;
  unit: string;
  quantity: number;
  receivedQuantity: number;
  soldQuantity: number;
  remainingQuantity: number;
  departmentStock: number;
  createdByName: string;
  createdAt: string;
  receivedByName: string | null;
  receivedAt: string | null;
  canReceive: boolean;
}

export default function StockMovementPage({ onBack, user }: { onBack: () => void; user: { id: string; departmentId: string | null } }) {
  const { showToast } = useToast();
  const [products, setProducts] = useState<HandoverProduct[]>([]);
  const [staff, setStaff] = useState<HandoverStaff[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [deliveries, setDeliveries] = useState<StockDelivery[]>([]);
  const [receiverId, setReceiverId] = useState("");
  const [sentCounts, setSentCounts] = useState<Record<string, number>>({});
  const [receivedCounts, setReceivedCounts] = useState<Record<string, Record<string, number>>>({});
  const [deliveryReceivedCounts, setDeliveryReceivedCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadHandoverData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const stock = await apiRequest<{ deliveries: StockDelivery[] }>("/api/v1/inventory/deliveries");
      setDeliveries(stock.deliveries);
      setDeliveryReceivedCounts((current) => {
        const next = { ...current };
        for (const delivery of stock.deliveries) {
          if (delivery.receivedAt === null && next[delivery.id] === undefined) next[delivery.id] = delivery.quantity;
        }
        return next;
      });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't load stock deliveries.");
      setLoading(false);
      return;
    }
    if (!user.departmentId) {
      setProducts([]);
      setStaff([]);
      setHandovers([]);
      setLoading(false);
      return;
    }
    try {
      const [options, history] = await Promise.all([
        apiRequest<{ products: HandoverProduct[]; staff: HandoverStaff[] }>("/api/v1/sales/handover-options"),
        apiRequest<{ handovers: Handover[] }>("/api/v1/sales/handovers"),
      ]);
      setProducts(options.products);
      setStaff(options.staff);
      setHandovers(history.handovers);
      setSentCounts((current) => Object.keys(current).length > 0
        ? current
        : Object.fromEntries(options.products.map((product) => [product.id, product.stock])));
      setReceivedCounts((current) => {
        const next = { ...current };
        for (const handover of history.handovers) {
          if (!next[handover.id]) next[handover.id] = Object.fromEntries(handover.items.map((item) => [item.productId, item.sentQuantity]));
        }
        return next;
      });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't load shift handovers.");
    } finally {
      setLoading(false);
    }
  }, [user.departmentId]);

  useEffect(() => { void loadHandoverData(); }, [loadHandoverData]);

  async function sendHandover() {
    if (!receiverId || products.length === 0) return;
    setSaving(true);
    try {
      const result = await apiRequest<{ message: string }>("/api/v1/sales/handovers", {
        method: "POST",
        body: JSON.stringify({
          receiverId,
          items: products.map((product) => ({ productId: product.id, quantity: sentCounts[product.id] ?? 0 })),
        }),
      });
      showToast(result.message, "success");
      setReceiverId("");
      await loadHandoverData();
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't send this handover.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function acceptHandover(handover: Handover) {
    setSaving(true);
    try {
      const result = await apiRequest<{ message: string }>(`/api/v1/sales/handovers/${handover.id}/accept`, {
        method: "POST",
        body: JSON.stringify({ items: handover.items.map((item) => ({
          productId: item.productId,
          quantity: receivedCounts[handover.id]?.[item.productId] ?? item.sentQuantity,
        })) }),
      });
      showToast(result.message, "success");
      await loadHandoverData();
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't accept this handover.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function receiveDelivery(delivery: StockDelivery) {
    setSaving(true);
    try {
      const result = await apiRequest<{ message: string }>(`/api/v1/inventory/deliveries/${delivery.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ receivedQuantity: deliveryReceivedCounts[delivery.id] ?? delivery.quantity }),
      });
      showToast(result.message, "success");
      await loadHandoverData();
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't confirm this stock delivery.", "error");
    } finally {
      setSaving(false);
    }
  }

  function handoverDate(value: string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  return (
    <section className="module-page">
      <PageHeading title="Stock receipt and handover" description="Department heads confirm deliveries; current department stock updates as staff sell." />
      <button className="icon-link" onClick={onBack}><ArrowLeft size={15} /> Back to inventory</button>
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      <div className="surface-card">
        <div className="surface-card__heading"><div><h2>Department stock deliveries</h2><p>Stock is reserved centrally when sent and added to the department only after the head confirms receipt.</p></div><span className="status-pill status-pill--neutral">{deliveries.filter((delivery) => !delivery.receivedAt).length} pending</span></div>
        {loading ? <p className="empty-state">Loading stock deliveries…</p> : deliveries.length === 0 ? <p className="empty-state">No stock deliveries have been recorded yet.</p> : deliveries.map((delivery) => <div className="handover-card" key={delivery.id}>
          <div className="handover-card__heading"><div><strong>{delivery.productName} · {delivery.quantity} {delivery.unit}</strong><small>{delivery.departmentName} · Sent by {delivery.createdByName} · {handoverDate(delivery.createdAt)}</small></div><span className={`status-pill${delivery.receivedAt ? "" : " status-pill--warning"}`}>{delivery.receivedAt ? delivery.receivedQuantity === 0 ? "Rejected" : "Received" : "Awaiting department head"}</span></div>
          {delivery.receivedAt
            ? <p className="stock-delivery-receipt">{delivery.receivedQuantity === 0 ? "Rejected" : `Received ${delivery.receivedQuantity} of ${delivery.quantity}`} by {delivery.receivedByName} · Sold {delivery.soldQuantity} · Remaining {delivery.remainingQuantity} · Department balance {delivery.departmentStock} {delivery.unit} · {handoverDate(delivery.receivedAt)}</p>
            : delivery.canReceive && <div className="stock-delivery-receipt"><label>Quantity received<input type="number" min="0" max={delivery.quantity} step="1" value={deliveryReceivedCounts[delivery.id] ?? delivery.quantity} onChange={(event) => setDeliveryReceivedCounts((current) => ({ ...current, [delivery.id]: Number(event.target.value) }))} /></label><button className="button button--primary" type="button" disabled={saving} onClick={() => void receiveDelivery(delivery)}><Check size={15} />{saving ? "Confirming…" : (deliveryReceivedCounts[delivery.id] ?? delivery.quantity) === 0 ? "Reject and return stock" : "Confirm received quantity"}</button></div>}
        </div>)}
      </div>
      {user.departmentId && <div className="surface-card form-card">
        <div className="surface-card__heading"><div><h2>Send to next shift</h2><p>Receiver confirmation is required before stock updates.</p></div><button className="button button--outline" type="button" onClick={() => void loadHandoverData()} disabled={loading}><RefreshCw size={15} /> Refresh</button></div>
        <label>Next-shift staff<select value={receiverId} onChange={(event) => setReceiverId(event.target.value)}><option value="">Choose a department colleague</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        {loading ? <p className="empty-state">Loading department stock…</p> : products.length === 0 ? <p className="empty-state">No products are assigned to this department.</p> : <div className="handover-count-list">{products.map((product) => <label className="handover-count-row" key={product.id}><span><strong>{product.name}</strong><small>Current system count: {product.stock} {product.unit}</small></span><input type="number" min="0" step="1" aria-label={`Count of ${product.name} to hand over`} value={sentCounts[product.id] ?? 0} onChange={(event) => setSentCounts((current) => ({ ...current, [product.id]: Number(event.target.value) }))} /></label>)}</div>}
        <button className="button button--primary full-width" type="button" disabled={saving || loading || !receiverId || products.length === 0 || handovers.some((handover) => handover.status === "pending")} onClick={() => void sendHandover()}>{saving ? "Sending…" : handovers.some((handover) => handover.status === "pending") ? "Pending handover" : "Send stock counts"}</button>
      </div>}
      {user.departmentId && <div className="surface-card">
        <div className="surface-card__heading"><div><h2>Incoming and recent handovers</h2><p>Check each item; differences are recorded during acceptance.</p></div><span className="status-pill status-pill--neutral">{handovers.length}</span></div>
        {loading ? <p className="empty-state">Loading handovers…</p> : handovers.length === 0 ? <p className="empty-state">No handovers yet.</p> : handovers.map((handover) => <div className="handover-card" key={handover.id}>
          <div className="handover-card__heading"><div><strong>{handover.senderName} <ArrowUpRight size={13} /> {handover.receiverName}</strong><small>{handoverDate(handover.createdAt)}</small></div><span className={`status-pill${handover.status === "pending" ? " status-pill--warning" : ""}`}>{handover.status === "pending" ? "Awaiting receipt" : "Accepted"}</span></div>
          {handover.items.map((item) => {
            const received = receivedCounts[handover.id]?.[item.productId] ?? item.sentQuantity;
            const difference = item.receivedQuantity === null ? received - item.sentQuantity : item.receivedQuantity - item.sentQuantity;
            return <div className="handover-item-row" key={item.productId}><span><strong>{item.productName}</strong><small>Sent {item.sentQuantity}{item.receivedQuantity !== null ? ` · Received ${item.receivedQuantity}` : ""}{handover.status === "accepted" && difference !== 0 ? ` · Difference ${difference > 0 ? "+" : ""}${difference}` : ""}</small></span>{handover.status === "pending" && handover.receiverId === user.id ? <input type="number" min="0" step="1" aria-label={`Received count for ${item.productName}`} value={received} onChange={(event) => setReceivedCounts((current) => ({ ...current, [handover.id]: { ...current[handover.id], [item.productId]: Number(event.target.value) } }))} /> : <span className="status-pill status-pill--neutral">{item.receivedQuantity ?? item.sentQuantity}</span>}</div>;
          })}
          {handover.status === "pending" && handover.receiverId === user.id && <button className="button button--primary" type="button" disabled={saving} onClick={() => void acceptHandover(handover)}><Check size={15} />{saving ? "Accepting…" : "Confirm received counts"}</button>}
        </div>)}
      </div>}
    </section>
  );
}
