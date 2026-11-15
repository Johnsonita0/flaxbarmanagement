import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Barcode, Calculator, Camera, Eye, Minus, Package, Plus, Search, ShoppingCart, X } from "lucide-react";
import type { CurrentUser } from "../lib/api";
import { apiRequest, OfflineRequestQueuedError } from "../lib/api";
import QuickCalculator from "../components/QuickCalculator";
import ProductPhoto from "../components/ProductPhoto";
import SalesPaymentManagement, { type PaymentAccount } from "../components/SalesPaymentManagement";
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
  paymentStatus: string;
  paymentReference: string | null;
  total: number;
  createdAt: string;
  items: { name: string; quantity: number; total: number }[];
}

const money = (amount: number) => `₦${amount.toLocaleString()}`;

export default function SalesPage({ user }: { user: CurrentUser }) {
  const { showToast } = useToast();
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [sales, setSales] = useState<RecordedSale[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [paystackEnabled, setPaystackEnabled] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [transactionReference, setTransactionReference] = useState("");
  const [dailyTransferCode, setDailyTransferCode] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [search, setSearch] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeError, setBarcodeError] = useState("");
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [category, setCategory] = useState("All");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<SalesProduct | null>(null);
  const [detailQuantity, setDetailQuantity] = useState("1");
  const [showSaleCalculator, setShowSaleCalculator] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productPickerSearch, setProductPickerSearch] = useState("");
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
      const [catalog, history, paymentOptions] = await Promise.all([
        apiRequest<{ products: SalesProduct[] }>("/api/v1/sales/catalog"),
        apiRequest<{ sales: RecordedSale[] }>("/api/v1/sales/history"),
        apiRequest<{ accounts: PaymentAccount[]; paystackEnabled: boolean }>("/api/v1/sales/payments/accounts"),
      ]);
      setProducts(catalog.products);
      setSales(history.sales);
      setPaymentAccounts(paymentOptions.accounts);
      setPaystackEnabled(paymentOptions.paystackEnabled);
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

  function openProductDetails(product: SalesProduct) {
    setDetailProduct(product);
    setDetailQuantity("1");
  }

  function openCheckout() {
    const firstItem = selectedProducts[0];
    if (!firstItem) return;
    setSelectedProductId(firstItem.id);
    setShowSaleCalculator(false);
    setShowProductPicker(false);
    setProductPickerSearch("");
  }

  function addProductToCart(product: SalesProduct, proceedToCheckout: boolean) {
    if (!canSell || product.departmentId !== user.departmentId) {
      showToast("This product is not available for sale from your department.", "error");
      return;
    }
    const quantity = Number(detailQuantity);
    const alreadyInCart = quantities[product.id] ?? 0;
    const remaining = product.stock - alreadyInCart;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > remaining) {
      showToast(`Enter a whole number from 1 to ${remaining}.`, "error");
      return;
    }
    setQuantities((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + quantity }));
    setDetailProduct(null);
    if (proceedToCheckout) setSelectedProductId(product.id);
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
    setShowProductPicker(false);
    setProductPickerSearch("");
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

  function addAnotherProduct(product: SalesProduct) {
    if (!product || product.stock < 1) return;
    setQuantities((current) => ({ ...current, [product.id]: Math.max(1, current[product.id] ?? 0) }));
    setProductPickerSearch("");
    setShowProductPicker(false);
  }

  async function recordSale() {
    if (selectedProducts.length === 0) return;
    setSaving(true);
    try {
      const items = selectedProducts.map((product) => ({ productId: product.id, quantity: quantities[product.id] }));
      if (paymentMethod === "paystack") {
        const result = await apiRequest<{ authorizationUrl: string }>("/api/v1/sales/payments/paystack/initialize", {
          method: "POST",
          body: JSON.stringify({ customerEmail, items }),
        });
        window.location.assign(result.authorizationUrl);
        return;
      }

      const result = paymentMethod === "transfer" || paymentMethod === "opay"
        ? await apiRequest<{ message: string }>("/api/v1/sales/payments/transfers", {
          method: "POST",
          body: JSON.stringify({
            paymentMethod,
            bankAccountId: paymentAccountId,
            transactionReference,
            dailyCode: dailyTransferCode,
            items,
          }),
        })
        : await apiRequest<{ message: string }>("/api/v1/sales/sales", {
          method: "POST",
          body: JSON.stringify({ paymentMethod, items }),
        });
      showToast(result.message, "success");
      setSelectedProductId(null);
      setShowSaleCalculator(false);
      setQuantities({});
      setDetailProduct(null);
      setShowProductPicker(false);
      setProductPickerSearch("");
      setPaymentAccountId("");
      setTransactionReference("");
      setDailyTransferCode("");
      setCustomerEmail("");
      await loadSales();
    } catch (reason: unknown) {
      if (reason instanceof OfflineRequestQueuedError) {
        setSelectedProductId(null);
        setShowSaleCalculator(false);
        setQuantities({});
        setDetailProduct(null);
        setShowProductPicker(false);
        setProductPickerSearch("");
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
  const matchingAddableProducts = addableProducts.filter((product) =>
    `${product.name} ${product.category}`.toLowerCase().includes(productPickerSearch.trim().toLowerCase()),
  );
  const cartUnitCount = selectedProducts.reduce((sum, product) => sum + quantities[product.id], 0);
  const detailRemainingStock = detailProduct
    ? Math.max(0, detailProduct.stock - (quantities[detailProduct.id] ?? 0))
    : 0;
  const canAddDetailProduct = Boolean(
    detailProduct && canSell && detailProduct.departmentId === user.departmentId && detailRemainingStock > 0,
  );
  const paymentAccountOptions = paymentAccounts.filter((account) => account.method === paymentMethod);
  const selectedPaymentAccount = paymentAccountOptions.find((account) => account.id === paymentAccountId);
  const manualPayment = paymentMethod === "transfer" || paymentMethod === "opay";
  const paymentReady = manualPayment
    ? Boolean(selectedPaymentAccount && transactionReference.trim() && dailyTransferCode.trim())
    : paymentMethod === "paystack"
      ? paystackEnabled && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())
      : true;

  return (
    <section className="module-page">
      <PageHeading title="Sales" description={canSell ? "Add products to a bill, then review and complete the sale when you are ready." : "Product catalog and recent sales across enabled departments."} />
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      {canSell && <section className="sales-catalog" aria-labelledby="sales-catalog-title">
        <div className="sales-catalog__heading">
          <div>
            <p className="eyebrow">{departmentName.toUpperCase()} · SELLING</p>
            <h2 id="sales-catalog-title">What are you selling?</h2>
            <p>Pick an item to review the sale and confirm payment.</p>
          </div>
          <div className="sales-catalog__actions">
            {cartUnitCount > 0 && <button className="button button--primary" type="button" onClick={openCheckout}><ShoppingCart size={15} /> Review bill · {cartUnitCount} · {money(total)}</button>}
            <button className="button button--outline" type="button" onClick={() => void loadSales()} disabled={loading}>Refresh stock</button>
          </div>
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
                <button className="sales-product-card__image-action" type="button" aria-label={`View ${product.name} details`} onClick={() => openProductDetails(product)}>
                  <ProductPhoto imagePath={product.imagePath} name={product.name} barcode={product.barcode} />
                </button>
                <span className={`stock-label${product.stock === 0 ? " stock-label--empty" : lowStock ? " stock-label--low" : ""}`}>
                  {product.stock === 0 ? "Out of stock" : lowStock ? "Low stock" : "In stock"}
                </span>
              </div>
              <div className="sales-product-card__body">
                <span className="sales-product-card__category">{product.category}</span>
                <h3><button className="sales-product-card__name" type="button" onClick={() => openProductDetails(product)}>{product.name}</button></h3>
                <div className="sales-product-card__details"><strong>{money(product.price)}</strong><span>{product.stock} {product.unit} available</span></div>
                {(quantities[product.id] ?? 0) > 0 && <span className="sales-product-card__cart-status">In bill · {quantities[product.id]}</span>}
                <button className="button button--primary full-width" type="button" disabled={loading || !availableToSell} onClick={() => openProductDetails(product)}>
                  <Eye size={15} /> {product.stock < 1 ? "Details · out of stock" : availableToSell ? "View details" : "View only"}
                </button>
              </div>
            </article>;
          })}</div>}
      </section>}

      <SalesPaymentManagement
        user={user}
        accounts={paymentAccounts}
        onAccountsChanged={() => void loadSales()}
        onTransfersChanged={() => void loadSales()}
      />

      <div className="surface-card sales-history">
        <div className="surface-card__heading"><div><h2>Recent sales</h2><p>Latest completed transactions</p></div><span className="status-pill status-pill--neutral">{sales.length}</span></div>
        {loading ? <p className="empty-state">Loading sales…</p> : sales.length === 0 ? <p className="empty-state">No sales recorded yet.</p> : sales.map((sale) => <div className="record-row" key={sale.id}><span className="product-token"><ShoppingCart size={17} /></span><span className="record-row__main"><strong>{sale.departmentName} · {sale.sellerName}</strong><small>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(sale.createdAt))} · {sale.paymentMethod} · {sale.paymentStatus === "pending_verification" ? "Awaiting HOD verification" : sale.paymentStatus === "pending_payment" ? "Awaiting Paystack payment" : sale.paymentStatus === "rejected" ? "Transfer rejected" : sale.paymentStatus === "failed" ? "Payment failed" : "Paid"}{sale.paymentReference ? ` · Ref ${sale.paymentReference}` : ""} · {sale.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}</small></span><strong className="record-row__meta">{money(sale.total)}</strong></div>)}
      </div>

      {detailProduct && <div className="sale-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailProduct(null); }}>
        <section className="sale-product-detail" role="dialog" aria-modal="true" aria-labelledby="sale-product-detail-title">
          <header className="sale-product-detail__header">
            <div><span className="eyebrow">PRODUCT DETAILS</span><h2 id="sale-product-detail-title">{detailProduct.name}</h2><p>{detailProduct.category}</p></div>
            <button className="icon-button" type="button" aria-label="Close product details" onClick={() => setDetailProduct(null)}><X size={19} /></button>
          </header>
          <div className="sale-product-detail__hero">
            <ProductPhoto imagePath={detailProduct.imagePath} name={detailProduct.name} barcode={detailProduct.barcode} />
            <div><span>Unit price</span><strong>{money(detailProduct.price)}</strong><small>{detailProduct.departmentName}</small></div>
          </div>
          <div className="sale-product-detail__facts">
            <div><span>Available</span><strong>{Math.max(0, detailProduct.stock - (quantities[detailProduct.id] ?? 0))} {detailProduct.unit}</strong></div>
            <div><span>Already in bill</span><strong>{quantities[detailProduct.id] ?? 0} {detailProduct.unit}</strong></div>
            <div><span>Barcode</span><strong>{detailProduct.barcode || "Not set"}</strong></div>
            <div><span>Category</span><strong>{detailProduct.category}</strong></div>
          </div>
          <label className="sale-product-detail__quantity">Quantity to add
            <input
              type="number"
              min="1"
              max={detailRemainingStock}
              step="1"
              value={detailQuantity}
              onChange={(event) => setDetailQuantity(event.target.value)}
              disabled={!canAddDetailProduct}
            />
          </label>
          {!canAddDetailProduct && <p className="sale-product-detail__notice">
            {detailRemainingStock === 0
              ? (quantities[detailProduct.id] ?? 0) > 0 ? "All available stock for this product is already in the bill." : "This product is currently out of stock."
              : "This product is view-only for your account or department."}
          </p>}
          <div className="sale-product-detail__actions">
            <button className="button button--outline" type="button" onClick={() => setDetailProduct(null)}>Back to products</button>
            <button
              className="button button--outline"
              type="button"
              disabled={!canAddDetailProduct}
              onClick={() => addProductToCart(detailProduct, false)}
            ><Plus size={15} /> Add to bill</button>
            <button
              className="button button--primary"
              type="button"
              disabled={!canAddDetailProduct}
              onClick={() => addProductToCart(detailProduct, true)}
            ><ShoppingCart size={15} /> Add & review bill</button>
          </div>
        </section>
      </div>}

      {selectedProductId && <div className={`sale-modal-backdrop${showSaleCalculator ? " sale-modal-backdrop--calculator" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) closeSale(); }}>
        <div className={`sale-modal-layout${showSaleCalculator ? " sale-modal-layout--calculator" : ""}`}>
        <section className="sale-modal" role="dialog" aria-modal="true" aria-labelledby="sale-modal-title">
          <header className="sale-modal__header">
            <div><span className="eyebrow">NEW TRANSACTION</span><h2 id="sale-modal-title">Complete sale</h2><p>Check the items and payment before confirming.</p></div>
            <div className="sale-modal__header-actions"><button className={`button button--outline calculator-toggle${showSaleCalculator ? " calculator-toggle--active" : ""}`} type="button" aria-expanded={showSaleCalculator} aria-controls="sale-calculator" onClick={() => setShowSaleCalculator((current) => !current)}><Calculator size={15} /> Calculator</button><button className="icon-button" type="button" aria-label="Close sale" onClick={closeSale} disabled={saving}><X size={19} /></button></div>
          </header>
          <div className="sale-modal__items">
            {selectedProducts.length === 0 && <p className="sale-product-picker__empty">Your bill is empty. Add another item to continue.</p>}
            {selectedProducts.map((product) => {
              return <div className="sale-modal-item" key={product.id}>
                <ProductPhoto imagePath={product.imagePath} name={product.name} barcode={product.barcode} className="sale-modal-item__image" />
                <div className="sale-modal-item__info"><strong>{product.name}</strong><small>{money(product.price)} each · {product.stock} available</small><b>{money(product.price * quantities[product.id])}</b></div>
                <div className="quantity-control"><button type="button" aria-label={`Remove one ${product.name}`} disabled={saving} onClick={() => adjustQuantity(product, -1)}><Minus size={14} /></button><span>{quantities[product.id]}</span><button type="button" aria-label={`Add one ${product.name}`} disabled={saving || quantities[product.id] >= product.stock} onClick={() => adjustQuantity(product, 1)}><Plus size={14} /></button></div>
              </div>;
            })}
          </div>
          {addableProducts.length > 0 && <div className="sale-modal__add-item">
            {!showProductPicker
              ? <button className="button button--outline sale-product-picker__trigger" type="button" onClick={() => setShowProductPicker(true)}><Plus size={15} /> Add another item <span>{addableProducts.length} available</span></button>
              : <div className="sale-product-picker">
                <label className="sale-product-picker__search"><Search size={16} aria-hidden="true" /><input autoFocus value={productPickerSearch} onChange={(event) => setProductPickerSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setShowProductPicker(false); setProductPickerSearch(""); } }} placeholder="Quick search products…" aria-label="Search available products" /><button type="button" aria-label="Close product search" onClick={() => { setShowProductPicker(false); setProductPickerSearch(""); }}><X size={15} /></button></label>
                <div className="sale-product-picker__list" aria-label="Available products">
                  {matchingAddableProducts.length > 0
                    ? matchingAddableProducts.map((product) => <button className="sale-product-picker__option" type="button" key={product.id} onClick={() => addAnotherProduct(product)}>
                      <ProductPhoto imagePath={product.imagePath} name={product.name} barcode={product.barcode} className="sale-product-picker__image" />
                      <span className="sale-product-picker__details"><strong>{product.name}</strong><small>{product.stock} {product.unit} available</small></span>
                      <b>{money(product.price)}</b>
                    </button>)
                    : <p className="sale-product-picker__empty">{addableProducts.length ? "No products match your search." : "No available products."}</p>}
                </div>
              </div>}
          </div>}
          <label className="sale-modal__payment">Payment method<select value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); setPaymentAccountId(""); setTransactionReference(""); setDailyTransferCode(""); setCustomerEmail(""); }} disabled={saving}><option value="cash">Cash</option><option value="card">Card</option><option value="transfer">Bank transfer</option><option value="opay">OPay</option><option value="paystack" disabled={!paystackEnabled}>Paystack{paystackEnabled ? "" : " · not configured"}</option></select></label>
          {manualPayment && <>
            <label className="sale-modal__payment">Company receiving account<select value={paymentAccountId} onChange={(event) => setPaymentAccountId(event.target.value)} disabled={saving || paymentAccountOptions.length === 0} required>
              <option value="">Select an account</option>
              {paymentAccountOptions.map((account) => <option value={account.id} key={account.id}>{account.label}{account.bankName ? ` · ${account.bankName}` : ""}</option>)}
            </select></label>
            {selectedPaymentAccount && <div className="sales-payment-account">
              <strong>{selectedPaymentAccount.accountName}</strong>
              <span>{selectedPaymentAccount.accountNumber}</span>
              {selectedPaymentAccount.bankName && <small>{selectedPaymentAccount.bankName}</small>}
            </div>}
            {paymentAccountOptions.length === 0 && <p className="sale-product-detail__notice">No active {paymentMethod === "opay" ? "OPay" : "bank transfer"} account is configured. Ask the Super Admin to add one.</p>}
            <label className="sale-modal__payment">Transfer reference<input value={transactionReference} onChange={(event) => setTransactionReference(event.target.value)} disabled={saving} maxLength={160} autoComplete="off" placeholder="Enter the bank or OPay transaction reference" /></label>
            <label className="sale-modal__payment">Today's staff transfer code<input value={dailyTransferCode} onChange={(event) => setDailyTransferCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 16))} disabled={saving} maxLength={16} autoComplete="off" placeholder="16-character code from your department head" /></label>
            <p className="sales-payment-note">The sale stays pending until your department head verifies the transfer reference.</p>
          </>}
          {paymentMethod === "paystack" && <>
            <label className="sale-modal__payment">Customer email<input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} disabled={saving} autoComplete="email" placeholder="customer@example.com" /></label>
            <p className="sales-payment-note">{paystackEnabled ? "Paystack will confirm the payment before the sale is marked paid." : "Ask the Super Admin to configure the Paystack secret key in the backend deployment environment."}</p>
          </>}
          <div className="sale-modal__total"><span>Total to collect</span><strong>{money(total)}</strong></div>
          <footer className="sale-modal__actions"><button className="button button--outline" type="button" onClick={closeSale} disabled={saving}>Back to products</button><button className="button button--primary" type="button" onClick={() => void recordSale()} disabled={saving || selectedProducts.length === 0 || !paymentReady || (manualPayment && paymentAccountOptions.length === 0) || (paymentMethod === "paystack" && !paystackEnabled)}><ShoppingCart size={15} />{saving ? paymentMethod === "paystack" ? "Opening Paystack…" : "Completing sale…" : paymentMethod === "paystack" ? "Pay with Paystack" : manualPayment ? "Submit transfer for verification" : "Complete sale"}</button></footer>
        </section>
        {showSaleCalculator && <div id="sale-calculator"><QuickCalculator onClose={() => setShowSaleCalculator(false)} /></div>}
        </div>
      </div>}
    </section>
  );
}
