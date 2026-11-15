import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, RefreshCw, Send, Store, Truck, UsersRound } from "lucide-react";
import { apiRequest } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import PageHeading from "../components/PageHeading";
import "./../css/OperationsPages.css";

interface AllocationProduct { id: string; name: string; unit: string; departmentStock: number; }
interface AllocationStaff { id: string; name: string; }
interface StockAllocation { productId: string; userId: string; quantity: number; }
interface OwnStock { productId: string; productName: string; unit: string; quantity: number; }
interface AllocationData {
  canAllocate: boolean;
  products: AllocationProduct[];
  staff: AllocationStaff[];
  allocations: StockAllocation[];
  ownStock: OwnStock[];
}
interface StockDelivery {
  id: string;
  departmentName: string;
  productName: string;
  unit: string;
  quantity: number;
  receivedQuantity: number;
  departmentStock: number;
  allocatedStock: number;
  createdByName: string;
  createdAt: string;
  receivedByName: string | null;
  receivedAt: string | null;
  canReceive: boolean;
}

export default function StockMovementPage({ onBack, user }: { onBack: () => void; user: { id: string; departmentId: string | null } }) {
  const { showToast } = useToast();
  const [deliveries, setDeliveries] = useState<StockDelivery[]>([]);
  const [allocationData, setAllocationData] = useState<AllocationData | null>(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedRepId, setSelectedRepId] = useState("");
  const [allocationQuantity, setAllocationQuantity] = useState("1");
  const [deliveryReceivedCounts, setDeliveryReceivedCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadStockWorkflow = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const stockRequest = apiRequest<{ deliveries: StockDelivery[] }>("/api/v1/inventory/deliveries");
      const allocationRequest = user.departmentId
        ? apiRequest<AllocationData>("/api/v1/inventory/allocations")
        : Promise.resolve(null);
      const [stock, allocation] = await Promise.all([stockRequest, allocationRequest]);
      setDeliveries(stock.deliveries);
      setAllocationData(allocation);
      if (allocation?.canAllocate) {
        setSelectedProductId((current) => allocation.products.some((product) => product.id === current)
          ? current
          : allocation.products[0]?.id ?? "");
        setSelectedRepId((current) => allocation.staff.some((member) => member.id === current)
          ? current
          : allocation.staff[0]?.id ?? "");
      }
      setDeliveryReceivedCounts((current) => {
        const next = { ...current };
        for (const delivery of stock.deliveries) {
          if (delivery.receivedAt === null && next[delivery.id] === undefined) next[delivery.id] = String(delivery.quantity);
        }
        return next;
      });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't load the stock workflow.");
    } finally {
      setLoading(false);
    }
  }, [user.departmentId]);

  useEffect(() => { void loadStockWorkflow(); }, [loadStockWorkflow]);

  async function receiveDelivery(delivery: StockDelivery) {
    const receivedQuantityInput = deliveryReceivedCounts[delivery.id] ?? String(delivery.quantity);
    const receivedQuantity = receivedQuantityInput.trim() === "" ? Number.NaN : Number(receivedQuantityInput);
    if (!Number.isInteger(receivedQuantity) || receivedQuantity < 0 || receivedQuantity > delivery.quantity) {
      showToast(`Enter a whole-number received quantity between 0 and ${delivery.quantity}.`, "error");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<{ message: string }>(`/api/v1/inventory/deliveries/${delivery.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ receivedQuantity }),
      });
      showToast(result.message, "success");
      await loadStockWorkflow();
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't confirm this stock delivery.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function allocateStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(allocationQuantity);
    if (!selectedProductId || !selectedRepId || !Number.isInteger(quantity) || quantity < 1) {
      showToast("Choose a sales rep and product, then enter a whole-number quantity.", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<{ message: string }>("/api/v1/inventory/allocations", {
        method: "POST",
        body: JSON.stringify({ productId: selectedProductId, userId: selectedRepId, quantity }),
      });
      showToast(result.message, "success");
      setAllocationQuantity("1");
      await loadStockWorkflow();
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't allocate stock.", "error");
    } finally {
      setSaving(false);
    }
  }

  function movementDate(value: string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  const productById = new Map((allocationData?.products ?? []).map((product) => [product.id, product]));
  const staffById = new Map((allocationData?.staff ?? []).map((member) => [member.id, member]));

  return (
    <section className="module-page">
      <PageHeading title="Stock workflow" description="Follow stock from the main store to the sales rep. Sales deduct from the rep's balance." />
      <button className="icon-link" onClick={onBack}><ArrowLeft size={15} /> Back to inventory</button>
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      <div className="stock-flow-steps" aria-label="Stock workflow steps">
        <div><Store size={18} /><span><strong>Main store</strong><small>Receive and count</small></span></div>
        <span className="stock-flow-steps__arrow">→</span>
        <div><Truck size={18} /><span><strong>Department</strong><small>Head confirms receipt</small></span></div>
        <span className="stock-flow-steps__arrow">→</span>
        <div><UsersRound size={18} /><span><strong>Sales rep</strong><small>Head allocates stock</small></span></div>
        <span className="stock-flow-steps__arrow">→</span>
        <div><Check size={18} /><span><strong>Sale</strong><small>Rep stock decreases</small></span></div>
      </div>

      {allocationData?.canAllocate && <div className="surface-card form-card">
        <div className="surface-card__heading"><div><h2>Allocate stock to a sales rep</h2><p>This moves units out of department stock and into the rep’s personal selling balance.</p></div></div>
        {allocationData.products.length === 0 || allocationData.staff.length === 0
          ? <p className="empty-state">Assign products to this department and add active department staff before allocating stock.</p>
          : <form onSubmit={(event) => void allocateStock(event)}>
            <label>Sales rep<select value={selectedRepId} onChange={(event) => setSelectedRepId(event.target.value)} required>{allocationData.staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            <label>Product<select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} required>{allocationData.products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.departmentStock} {product.unit} in department</option>)}</select></label>
            <label>Quantity to allocate<input type="number" min="1" max={productById.get(selectedProductId)?.departmentStock ?? 1} step="1" value={allocationQuantity} onChange={(event) => setAllocationQuantity(event.target.value)} required /></label>
            <button className="button button--primary full-width" type="submit" disabled={saving || loading || !selectedRepId || !selectedProductId || Number(allocationQuantity) > (productById.get(selectedProductId)?.departmentStock ?? 0)}><Send size={15} />{saving ? "Allocating…" : "Allocate to rep"}</button>
          </form>}
        {allocationData.allocations.length > 0 && <div className="stock-rep-balances">
          <h3>Stock currently held by reps</h3>
          {allocationData.allocations.map((allocation, index) => <div className="record-row" key={`${allocation.productId}-${allocation.userId}-${index}`}>
            <span className="record-row__main"><strong>{productById.get(allocation.productId)?.name ?? "Product"}</strong><small>{staffById.get(allocation.userId)?.name ?? "Sales rep"}</small></span>
            <strong>{allocation.quantity} {productById.get(allocation.productId)?.unit ?? "items"}</strong>
          </div>)}
        </div>}
      </div>}

      {!allocationData?.canAllocate && allocationData && <div className="surface-card">
        <div className="surface-card__heading"><div><h2>My sales stock</h2><p>These are the units assigned to you. Completed sales reduce this balance.</p></div></div>
        {allocationData.ownStock.length === 0
          ? <p className="empty-state">You have no stock assigned yet. Ask your department head to allocate stock before making sales.</p>
          : allocationData.ownStock.map((item) => <div className="record-row" key={item.productId}><span className="record-row__main"><strong>{item.productName}</strong></span><strong>{item.quantity} {item.unit}</strong></div>)}
      </div>}

      <div className="surface-card">
        <div className="surface-card__heading"><div><h2>Department deliveries</h2><p>Stock moves from the main store to the department only after the department head confirms the received count.</p></div><div className="surface-card__heading-actions"><span className="status-pill status-pill--neutral">{deliveries.filter((delivery) => !delivery.receivedAt).length} pending</span><button className="button button--outline" type="button" onClick={() => void loadStockWorkflow()} disabled={loading}><RefreshCw size={14} /> Refresh</button></div></div>
        {loading ? <p className="empty-state">Loading department deliveries…</p> : deliveries.length === 0 ? <p className="empty-state">No department deliveries yet. Send stock from Inventory when the main store is ready.</p> : deliveries.map((delivery) => <div className="handover-card" key={delivery.id}>
          <div className="handover-card__heading"><div><strong>{delivery.productName} · {delivery.quantity} {delivery.unit}</strong><small>{delivery.departmentName} · Sent by {delivery.createdByName} · {movementDate(delivery.createdAt)}</small></div><span className={`status-pill${delivery.receivedAt ? "" : " status-pill--warning"}`}>{delivery.receivedAt ? delivery.receivedQuantity === 0 ? "Rejected" : "Received" : "Awaiting department head"}</span></div>
          {delivery.receivedAt
            ? <p className="stock-delivery-receipt">{delivery.receivedQuantity === 0 ? "Rejected" : `Received ${delivery.receivedQuantity} of ${delivery.quantity}`} by {delivery.receivedByName} · Current department stock {delivery.departmentStock} · With reps {delivery.allocatedStock} · {movementDate(delivery.receivedAt)}</p>
            : delivery.canReceive && <div className="stock-delivery-receipt"><label>Quantity received<input type="number" min="0" max={delivery.quantity} step="1" value={deliveryReceivedCounts[delivery.id] ?? String(delivery.quantity)} onChange={(event) => setDeliveryReceivedCounts((current) => ({ ...current, [delivery.id]: event.target.value }))} /></label><button className="button button--primary" type="button" disabled={saving} onClick={() => void receiveDelivery(delivery)}><Check size={15} />{saving ? "Confirming…" : (deliveryReceivedCounts[delivery.id] ?? String(delivery.quantity)) === "0" ? "Reject and return stock" : "Confirm received quantity"}</button></div>}
        </div>)}
      </div>
    </section>
  );
}
