import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Barcode, Calculator, Camera, Minus, Package, Plus, Search, ShoppingCart, X } from "lucide-react";
import type { CurrentUser } from "../lib/api";
import { apiRequest, getProductImageUrl, OfflineRequestQueuedError } from "../lib/api";
import QuickCalculator from "../components/QuickCalculator";
import { useToast } from "../components/ToastProvider";
import PageHeading from "../components/PageHeading";
import "./../css/OperationsPages.css";

interface SalesProduct {
  id: string;
  name: string;
  category: string;
  barcode: string | null;
  stock: number;
  unit: string;
  departmentId: string;
  departmentName: string;
  price: number;
  imagePath: string | null;
}

interface RecordedSale {
  id: string;
  sellerName: string;
  departmentName: string;
  paymentMethod: string;
  total: number;
  createdAt: string;
  items: { name: string; quantity: number; total: number }[];
}

const money = (amount: number) => `₦${amount.toLocaleString()}`;

function ProductPhoto({ imagePath, className }: { imagePath: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = getProductImageUrl(imagePath);
  if (!imageUrl || failed) {
    const placeholderClass = className === "sale-modal-item__image"
      ? "sale-modal-item__image sale-modal-item__placeholder"
      : "sales-product-card__placeholder";
    return <span className={placeholderClass}><Package size={22} aria-hidden="true" /></span>;
  }
  return <img className={className} src={imageUrl} alt="" onError={() => setFailed(true)} />;
}

export default function SalesPage({ user }: { user: CurrentUser }) {
  const { showToast } = useToast();
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [sales, setSales] = useState<RecordedSale[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [search, setSearch] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeError, setBarcodeError] = useState("");
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [category, setCategory] = useState("All");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showSaleCalculator, setShowSaleCalculator] = useState(false);
  const [additionalProductId, setAdditionalProductId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    if (!scanningBarcode) {
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
      return;
    }
    const video = scannerVideoRef.current;
    if (!video) {
      setScanningBarcode(false);
      setBarcodeError("The camera scanner could not be opened. Please try again.");
      return;
    }
    const scannerVideo = video;
    let cancelled = false;
    async function startScanner() {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(undefined, scannerVideo, (result, _error, scannerControls) => {
          if (!result) return;
          scannerControls.stop();
          scannerControlsRef.current = null;
          setScanningBarcode(false);
          addScannedProduct(result.getText());
        });
        if (cancelled) controls.stop();
        else scannerControlsRef.current = controls;
      } catch (reason: unknown) {
        console.error("Could not start the product barcode scanner.", reason);
        if (!cancelled) {
          setScanningBarcode(false);
          setBarcodeError(reason instanceof Error ? reason.message : "Camera access failed. Allow camera permission and try again.");
        }
      }
    }
    void startScanner();
    return () => {
      cancelled = true;
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, [scanningBarcode]);

  const loadSales = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [catalog, history] = await Promise.all([
        apiRequest<{ products: SalesProduct[] }>("/api/v1/sales/catalog"),
        apiRequest<{ sales: RecordedSale[] }>("/api/v1/sales/history"),
      ]);
      setProducts(catalog.products);
      setSales(history.sales);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't load sales.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSales(); }, [loadSales]);

  const categories = useMemo(
    () => ["All", ...new Set(products.map((product) => product.category).filter(Boolean))],
    [products],
  );
  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesSearch = `${product.name} ${product.category}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesSearch && (category === "All" || product.category === category);
  }), [category, products, search]);
  const selectedProducts = products.filter((product) => (quantities[product.id] ?? 0) > 0);
  const total = selectedProducts.reduce((sum, product) => sum + product.price * quantities[product.id], 0);

  function openSale(product: SalesProduct) {
    setSelectedProductId(product.id);
    setShowSaleCalculator(false);
    setAdditionalProductId("");
    setPaymentMethod("cash");
    setQuantities({ [product.id]: 1 });
  }

  function addScannedProduct(rawBarcode: string) {
    const barcode = rawBarcode.trim();
    if (!barcode) return;
    const product = products.find((item) => item.barcode === barcode);
    setBarcodeInput("");
    setBarcodeError("");
    if (!product) {
      setBarcodeError("No product matches that barcode. Check the barcode in Inventory.");
      return;
    }
    if (product.departmentId !== user.departmentId || product.stock < 1) {
      setBarcodeError(product.stock < 1 ? `${product.name} is out of stock.` : "This product is not assigned to your department.");
      return;
    }

    const quantity = quantities[product.id] ?? 0;
    if (quantity >= product.stock) {
      setBarcodeError(`Only ${product.stock} ${product.unit} of ${product.name} are available.`);
      return;
    }
    setSelectedProductId((current) => current ?? product.id);
    setQuantities((current) => ({
      ...current,
      [product.id]: Math.min(product.stock, (current[product.id] ?? 0) + 1),
    }));
  }

  function closeSale() {
    if (saving) return;
    setSelectedProductId(null);
    setShowSaleCalculator(false);
    setQuantities({});
    setAdditionalProductId("");
  }

  function adjustQuantity(product: SalesProduct, difference: number) {
    setQuantities((current) => {
      const next = Math.min(product.stock, Math.max(0, (current[product.id] ?? 0) + difference));
      if (next === 0) {
        const { [product.id]: _removed, ...remaining } = current;
        return remaining;
      }
      return { ...current, [product.id]: next };
    });
  }

  function addAnotherProduct() {
    const product = products.find((item) => item.id === additionalProductId);
    if (!product || product.stock < 1) return;
    setQuantities((current) => ({ ...current, [product.id]: Math.max(1, current[product.id] ?? 0) }));
    setAdditionalProductId("");
  }

  async function recordSale() {
    if (selectedProducts.length === 0) return;
    setSaving(true);
    try {
      const result = await apiRequest<{ message: string }>("/api/v1/sales/sales", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod,
          items: selectedProducts.map((product) => ({ productId: product.id, quantity: quantities[product.id] })),
        }),
      });
      showToast(result.message, "success");
      setSelectedProductId(null);
      setShowSaleCalculator(false);
      setQuantities({});
      await loadSales();
    } catch (reason: unknown) {
      if (reason instanceof OfflineRequestQueuedError) {
        setSelectedProductId(null);
        setShowSaleCalculator(false);
        setQuantities({});
        setAdditionalProductId("");
      }
      showToast(reason instanceof Error ? reason.message : "We couldn't record this sale.", "error");
    } finally {
      setSaving(false);
    }
  }

  const canSell = user.salesEnabled && user.role !== "super_admin";
  const departmentName = products.find((product) => product.id === selectedProductId)?.departmentName
    ?? products[0]?.departmentName
    ?? "Department catalog";
  const addableProducts = products.filter((product) =>
    product.stock > 0 && product.departmentId === user.departmentId && !quantities[product.id],
  );

  return (
    <section className="module-page">
      <PageHeading title="Sales" description={canSell ? "Choose a product to start a sale. Stock updates as soon as the sale is complete." : "Product catalog and recent sales across enabled departments."} />
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      {canSell && <section className="sales-catalog" aria-labelledby="sales-catalog-title">
        <div className="sales-catalog__heading">
          <div>
            <p className="eyebrow">{departmentName.toUpperCase()} · SELLING</p>
            <h2 id="sales-catalog-title">What are you selling?</h2>
            <p>Pick an item to review the sale and confirm payment.</p>
          </div>
          <button className="button button--outline" type="button" onClick={() => void loadSales()} disabled={loading}>Refresh stock</button>
        </div>
        <label className="sales-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products…" aria-label="Search products" /></label>
        <form className="sales-barcode" onSubmit={(event) => { event.preventDefault(); addScannedProduct(barcodeInput); }}>
          <Barcode size={19} aria-hidden="true" />
          <input value={barcodeInput} onChange={(event) => setBarcodeInput(event.target.value)} placeholder="Scan or enter product barcode" aria-label="Product barcode" autoComplete="off" />
          <button className="button button--outline" type="submit" disabled={!barcodeInput.trim()}>Add item</button>
          <button className="button button--outline" type="button" onClick={() => { setBarcodeError(""); setScanningBarcode((current) => !current); }}>
            <Camera size={15} />{scanningBarcode ? "Stop camera" : "Use camera"}
          </button>
        </form>
        {scanningBarcode && <div className="sales-barcode__camera"><video ref={scannerVideoRef} autoPlay muted playsInline aria-label="Barcode scanner camera" /><p>Point the camera at a product barcode.</p></div>}
        {barcodeError && <p className="sales-barcode__error" role="alert">{barcodeError}</p>}
        {categories.length > 1 && <div className="tab-strip sales-categories" aria-label="Product categories">
          {categories.map((item) => <button className={`tab-chip${category === item ? " tab-chip--active" : ""}`} key={item} type="button" onClick={() => setCategory(item)}>{item}</button>)}
        </div>}
        {loading ? <p className="empty-state">Loading products…</p> : visibleProducts.length === 0
          ? <div className="sales-empty"><Package size={24} /><strong>{products.length ? "No products match your search." : "No products are ready to sell yet."}</strong><span>{products.length ? "Try another product name or category." : "Ask your manager to assign products to your department."}</span></div>
          : <div className="sales-product-grid">{visibleProducts.map((product) => {
            const lowStock = product.stock > 0 && product.stock <= 5;
            const availableToSell = canSell && product.departmentId === user.departmentId;
            return <article className="sales-product-card" key={product.id}>
              <div className="sales-product-card__image">
                <ProductPhoto imagePath={product.imagePath} />
                <span className={`stock-label${product.stock === 0 ? " stock-label--empty" : lowStock ? " stock-label--low" : ""}`}>
                  {product.stock === 0 ? "Out of stock" : lowStock ? "Low stock" : "In stock"}
                </span>
              </div>
              <div className="sales-product-card__body">
                <span className="sales-product-card__category">{product.category}</span>
                <h3>{product.name}</h3>
                <div className="sales-product-card__details"><strong>{money(product.price)}</strong><span>{product.stock} {product.unit} available</span></div>
                <button className="button button--primary full-width" type="button" disabled={product.stock < 1 || loading || !availableToSell} onClick={() => openSale(product)}>
                  <ShoppingCart size={15} /> {product.stock < 1 ? "Unavailable" : availableToSell ? "Sell" : "View only"}
                </button>
              </div>
            </article>;
          })}</div>}
      </section>}

      <div className="surface-card sales-history">
        <div className="surface-card__heading"><div><h2>Recent sales</h2><p>Latest completed transactions</p></div><span className="status-pill status-pill--neutral">{sales.length}</span></div>
        {loading ? <p className="empty-state">Loading sales…</p> : sales.length === 0 ? <p className="empty-state">No sales recorded yet.</p> : sales.map((sale) => <div className="record-row" key={sale.id}><span className="product-token"><ShoppingCart size={17} /></span><span className="record-row__main"><strong>{sale.departmentName} · {sale.sellerName}</strong><small>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(sale.createdAt))} · {sale.paymentMethod} · {sale.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}</small></span><strong className="record-row__meta">{money(sale.total)}</strong></div>)}
      </div>

      {selectedProductId && <div className={`sale-modal-backdrop${showSaleCalculator ? " sale-modal-backdrop--calculator" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) closeSale(); }}>
        <div className={`sale-modal-layout${showSaleCalculator ? " sale-modal-layout--calculator" : ""}`}>
        <section className="sale-modal" role="dialog" aria-modal="true" aria-labelledby="sale-modal-title">
          <header className="sale-modal__header">
            <div><span className="eyebrow">NEW TRANSACTION</span><h2 id="sale-modal-title">Complete sale</h2><p>Check the items and payment before confirming.</p></div>
            <div className="sale-modal__header-actions"><button className={`button button--outline calculator-toggle${showSaleCalculator ? " calculator-toggle--active" : ""}`} type="button" aria-expanded={showSaleCalculator} aria-controls="sale-calculator" onClick={() => setShowSaleCalculator((current) => !current)}><Calculator size={15} /> Calculator</button><button className="icon-button" type="button" aria-label="Close sale" onClick={closeSale} disabled={saving}><X size={19} /></button></div>
          </header>
          <div className="sale-modal__items">
            {selectedProducts.map((product) => {
              return <div className="sale-modal-item" key={product.id}>
                <ProductPhoto imagePath={product.imagePath} className="sale-modal-item__image" />
                <div className="sale-modal-item__info"><strong>{product.name}</strong><small>{money(product.price)} each · {product.stock} available</small><b>{money(product.price * quantities[product.id])}</b></div>
                <div className="quantity-control"><button type="button" aria-label={`Remove one ${product.name}`} disabled={saving} onClick={() => adjustQuantity(product, -1)}><Minus size={14} /></button><span>{quantities[product.id]}</span><button type="button" aria-label={`Add one ${product.name}`} disabled={saving || quantities[product.id] >= product.stock} onClick={() => adjustQuantity(product, 1)}><Plus size={14} /></button></div>
              </div>;
            })}
          </div>
          {addableProducts.length > 0 && <div className="sale-modal__add-item"><label htmlFor="sale-add-product">Add another item</label><div><select id="sale-add-product" value={additionalProductId} onChange={(event) => setAdditionalProductId(event.target.value)}><option value="">Choose a product</option>{addableProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.price)}</option>)}</select><button className="button button--outline" type="button" disabled={!additionalProductId} onClick={addAnotherProduct}>Add</button></div></div>}
          <label className="sale-modal__payment">Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} disabled={saving}><option value="cash">Cash</option><option value="card">Card</option><option value="transfer">Bank transfer</option></select></label>
          <div className="sale-modal__total"><span>Total to collect</span><strong>{money(total)}</strong></div>
          <footer className="sale-modal__actions"><button className="button button--outline" type="button" onClick={closeSale} disabled={saving}>Cancel</button><button className="button button--primary" type="button" onClick={() => void recordSale()} disabled={saving || selectedProducts.length === 0}><ShoppingCart size={15} />{saving ? "Completing sale…" : "Complete sale"}</button></footer>
        </section>
        {showSaleCalculator && <div id="sale-calculator"><QuickCalculator onClose={() => setShowSaleCalculator(false)} /></div>}
        </div>
      </div>}
    </section>
  );
}
