import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ImagePlus, Package, Pencil, Plus, Search } from "lucide-react";
import type { CurrentUser } from "../lib/api";
import PageHeading from "../components/PageHeading";
import { useToast } from "../components/ToastProvider";
import { apiRequest, getProductImageUrl } from "../lib/api";
import type { InventoryProduct, VendorPurchase } from "../lib/api";
import { supabase } from "../lib/supabase";
import "./../css/OperationsPages.css";

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
interface InventoryDepartment { id: string; name: string; headUserId: string | null; }

function ProductPhoto({ imagePath, name }: { imagePath: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = getProductImageUrl(imagePath);
  return imageUrl && !failed
    ? <img className="product-thumbnail" src={imageUrl} alt={`${name} product`} onError={() => setFailed(true)} />
    : <span className="product-token" aria-label={`${name} has no product image`}><Package size={18} /></span>;
}

export default function InventoryPage({ onMovements, user }: { onMovements: () => void; user: CurrentUser }) {
  const { showToast } = useToast();
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [departments, setDepartments] = useState<InventoryDepartment[]>([]);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null);
  const [dispatchProduct, setDispatchProduct] = useState<InventoryProduct | null>(null);
  const [dispatchQuantity, setDispatchQuantity] = useState("1");
  const [purchases, setPurchases] = useState<VendorPurchase[]>([]);
  const [purchaseProductId, setPurchaseProductId] = useState("");
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [paymentPurchase, setPaymentPurchase] = useState<VendorPurchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<{ products: InventoryProduct[]; departments: InventoryDepartment[] }>("/api/v1/inventory/products"),
      apiRequest<{ purchases: VendorPurchase[] }>("/api/v1/inventory/purchases"),
    ])
      .then(([{ products: loadedProducts, departments: loadedDepartments }, { purchases: loadedPurchases }]) => {
        if (active) {
          setProducts(loadedProducts);
          setDepartments(loadedDepartments);
          setPurchases(loadedPurchases);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "We couldn't load inventory.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const filtered = useMemo(() => products.filter((product) => {
    const state = product.stock === 0 ? "Out of Stock" : product.stock <= product.reorder ? "Low Stock" : "In Stock";
    const matchesQuery = `${product.name} ${product.category}`.toLowerCase().includes(query.trim().toLowerCase());
    return (filter === "All" || filter === state) && matchesQuery;
  }), [filter, products, query]);
  const canDispatchStock = ["super_admin", "management_admin", "inventory_officer"].includes(user.role);

  async function refreshPurchases() {
    const result = await apiRequest<{ purchases: VendorPurchase[] }>("/api/v1/inventory/purchases");
    setPurchases(result.purchases);
  }

  function chooseImage(file: File | undefined) {
    if (!file) return;
    if (!allowedImageTypes.includes(file.type)) {
      showToast("Choose a JPG, PNG, or WebP product image.", "error");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast("Choose a product image smaller than 8 MB.", "error");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function uploadProductImage(file: File): Promise<string> {
    if (!supabase) throw new Error("Product image storage is unavailable. Please contact your administrator.");
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) throw new Error("Your sign-in session has expired. Please sign in again.");
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const imagePath = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(imagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error("We couldn't upload the product image. Check that product image storage is set up.");
    return imagePath;
  }

  async function saveProduct(form: HTMLFormElement) {
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    const category = String(values.get("category") ?? "").trim();
    const barcode = String(values.get("barcode") ?? "").trim();
    const stock = 0;
    const unit = String(values.get("unit") ?? "items").trim();
    const reorder = Number(values.get("reorder") ?? 5);
    const departmentId = String(values.get("departmentId") ?? "");
    const price = Number(values.get("price") ?? NaN);
    if (!name || !category || !Number.isInteger(stock) || stock < 0 || !Number.isInteger(reorder) || reorder < 0) {
      showToast("Check the product details and quantities, then try again.", "error");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      showToast("Enter a valid sale price.", "error");
      return;
    }

    setSaving(true);
    let imagePath: string | null = null;
    let imageLinked = false;
    try {
      if (imageFile) imagePath = await uploadProductImage(imageFile);
      if (editingProduct) {
        const result = await apiRequest<{ product: Pick<InventoryProduct, "id" | "name" | "category" | "barcode" | "unit" | "imagePath" | "departmentId" | "price"> }>(`/api/v1/inventory/products/${editingProduct.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name, category, barcode, unit, departmentId: departmentId || null, price, ...(imagePath ? { imagePath } : {}) }),
        });
        const updated = result.product;
        imageLinked = true;
        setProducts((current) => current.map((product) => product.id === updated.id
          ? {
              ...product,
              ...updated,
              departmentName: departments.find((department) => department.id === updated.departmentId)?.name ?? null,
            }
          : product).sort((left, right) => left.name.localeCompare(right.name)));
        if (imagePath && editingProduct.imagePath && supabase) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session && editingProduct.imagePath.startsWith(`${session.user.id}/`)) {
            const { error: cleanupError } = await supabase.storage.from("product-images").remove([editingProduct.imagePath]);
            if (cleanupError) console.error("Updated product image, but could not remove the previous image.", cleanupError);
          }
        }
        showToast("Product details saved.", "success");
      } else {
        const result = await apiRequest<{ product: InventoryProduct; message: string }>("/api/v1/inventory/products", {
          method: "POST",
          body: JSON.stringify({ name, category, barcode, stock, unit, reorder, imagePath, departmentId: departmentId || null, price }),
        });
        imageLinked = true;
        setProducts((current) => [...current, result.product].sort((left, right) => left.name.localeCompare(right.name)));
        showToast(result.message, "success");
      }

      form.reset();
      setImageFile(null);
      setImagePreview(null);
      setShowForm(false);
      setEditingProduct(null);
    } catch (error: unknown) {
      if (imagePath && !imageLinked && supabase) {
        const { error: cleanupError } = await supabase.storage.from("product-images").remove([imagePath]);
        if (cleanupError) console.error("Could not clean up an unlinked product image.", cleanupError);
      }
      showToast(error instanceof Error ? error.message : "We couldn't add the product. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function dispatchStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dispatchProduct) return;
    const quantity = Number(dispatchQuantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > dispatchProduct.centralStock || quantity > 1_000_000) {
      showToast(`Enter a whole number from 1 to ${Math.min(dispatchProduct.centralStock, 1_000_000)}.`, "error");
      return;
    }
    setDispatching(true);
    try {
      const result = await apiRequest<{ message: string }>("/api/v1/inventory/deliveries", {
        method: "POST",
        body: JSON.stringify({ productId: dispatchProduct.id, quantity }),
      });
      setProducts((current) => current.map((product) => product.id === dispatchProduct.id
        ? { ...product, centralStock: product.centralStock - quantity, inTransitStock: product.inTransitStock + quantity }
        : product));
      showToast(result.message, "success");
      setDispatchProduct(null);
      setDispatchQuantity("1");
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "We couldn't dispatch this stock.", "error");
    } finally {
      setDispatching(false);
    }
  }

  async function recordPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const packageQuantity = Number(values.get("packageQuantity"));
    const unitsPerPackage = Number(values.get("unitsPerPackage"));
    const ratePerPackage = Number(values.get("ratePerPackage"));
    const amountPaid = Number(values.get("amountPaid"));
    const productId = String(values.get("productId") ?? "");
    const vendorName = String(values.get("vendorName") ?? "").trim();
    if (!productId || vendorName.length < 2 || !Number.isInteger(packageQuantity) || packageQuantity < 1 ||
      !Number.isInteger(unitsPerPackage) || unitsPerPackage < 1 || packageQuantity * unitsPerPackage > 1_000_000 ||
      !Number.isFinite(ratePerPackage) || ratePerPackage < 0 || !Number.isFinite(amountPaid) || amountPaid < 0 ||
      amountPaid > packageQuantity * ratePerPackage) {
      showToast("Check the vendor, package quantities, rate, and amount paid.", "error");
      return;
    }
    setSavingPurchase(true);
    try {
      const result = await apiRequest<{ centralStock: number; averageUnitCost: number; message: string }>("/api/v1/inventory/purchases", {
        method: "POST",
        body: JSON.stringify({
          productId,
          vendorName,
          reference: String(values.get("reference") ?? "").trim() || null,
          packageQuantity,
          unitsPerPackage,
          ratePerPackage,
          amountPaid,
          paymentMethod: String(values.get("paymentMethod") ?? "transfer"),
        }),
      });
      setProducts((current) => current.map((product) => product.id === productId
        ? { ...product, centralStock: result.centralStock, averageUnitCost: result.averageUnitCost }
        : product));
      showToast(result.message, "success");
      setShowPurchaseForm(false);
      void refreshPurchases().catch((error: unknown) => {
        showToast(error instanceof Error ? `Purchase recorded, but history could not refresh: ${error.message}` : "Purchase recorded, but history could not refresh.", "error");
      });
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "We couldn't record this vendor purchase.", "error");
    } finally {
      setSavingPurchase(false);
    }
  }

  async function recordVendorPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paymentPurchase) return;
    const values = new FormData(event.currentTarget);
    const amount = Number(values.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0 || amount > paymentPurchase.balance) {
      showToast(`Enter an amount up to ₦${paymentPurchase.balance.toLocaleString()}.`, "error");
      return;
    }
    setSavingPurchase(true);
    try {
      const result = await apiRequest<{ amountPaid: number; message: string }>(`/api/v1/inventory/purchases/${paymentPurchase.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount, paymentMethod: String(values.get("paymentMethod") ?? "transfer") }),
      });
      setPurchases((current) => current.map((purchase) => purchase.id === paymentPurchase.id
        ? { ...purchase, amountPaid: result.amountPaid, balance: Math.max(0, purchase.invoiceTotal - result.amountPaid) }
        : purchase));
      setPaymentPurchase(null);
      showToast(result.message, "success");
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "We couldn't record this vendor payment.", "error");
    } finally {
      setSavingPurchase(false);
    }
  }

  return (
    <section className="module-page">
      <PageHeading title="Inventory" description="Stock levels, department selling prices and shift handovers." action={{ label: "Add Product", onClick: () => { setEditingProduct(null); setShowForm(true); } }} />
      {canDispatchStock && <button className="button button--outline" type="button" onClick={() => { setPurchaseProductId(products[0]?.id ?? ""); setShowPurchaseForm(true); }} disabled={products.length === 0}><Plus size={15} /> Record vendor purchase</button>}
      <button className="icon-link" onClick={onMovements}><ArrowDownToLine size={15} /> View stock movement history</button>
      <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products…" /></label>
      <div className="tab-strip">{["All", "In Stock", "Low Stock", "Out of Stock"].map((tab) => <button className={`tab-chip${filter === tab ? " tab-chip--active" : ""}`} key={tab} onClick={() => setFilter(tab)}>{tab}</button>)}</div>
      {loadError && <p className="inline-error" role="alert">{loadError}</p>}
      <div className="surface-card inventory-list">
        {loading && <p className="empty-state">Loading inventory…</p>}
        {!loading && filtered.map((product) => {
          const low = product.stock <= product.reorder;
          const department = departments.find((item) => item.id === product.departmentId);
          return (
            <div className="record-row" key={product.id}>
              <ProductPhoto imagePath={product.imagePath} name={product.name} />
              <span className="record-row__main"><strong>{product.name}</strong><small>{product.departmentName ?? "Unassigned"} · ₦{product.price.toLocaleString()} · Central: {product.centralStock} · In transit: {product.inTransitStock} · Department: {product.stock} · Total: {product.centralStock + product.inTransitStock + product.stock} {product.unit}</small></span>
              <span className={`status-pill${low ? " status-pill--warning" : ""}`}>{product.stock === 0 ? "Out of Stock" : low ? "Low Stock" : "In Stock"}</span>
              {canDispatchStock && <button className="icon-link inventory-move" aria-label={`Record a vendor stock purchase for ${product.name}`} title="Record a vendor purchase for this product" onClick={() => { setPurchaseProductId(product.id); setShowPurchaseForm(true); }}><Plus size={16} /></button>}
              {canDispatchStock && <button className="icon-link inventory-move" aria-label={`Send stock for ${product.name}`} title={department?.headUserId ? "Reserve central stock and send it to the department head" : "Assign a department and active head before sending stock"} disabled={!department?.headUserId || product.centralStock < 1} onClick={() => { setDispatchProduct(product); setDispatchQuantity("1"); }}><ArrowUpFromLine size={15} /></button>}
              <button className="icon-link inventory-move" aria-label={`Edit ${product.name}`} onClick={() => { setEditingProduct(product); setImageFile(null); setImagePreview(getProductImageUrl(product.imagePath)); setShowForm(true); }}><Pencil size={15} /></button>
              <button className="icon-link inventory-move" aria-label={`Record a movement for ${product.name}`} onClick={onMovements}><ArrowUpFromLine size={16} /></button>
            </div>
          );
        })}
        {!loading && !loadError && filtered.length === 0 && <p className="empty-state">{products.length ? "No products match this filter." : "No products have been added yet."}</p>}
      </div>
      {canDispatchStock && <section className="surface-card inventory-list">
        <div className="surface-card__heading"><div><h2>Vendor purchase history</h2><p>Recent stock receipts and outstanding supplier balances</p></div></div>
        {purchases.length === 0 ? <p className="empty-state">No vendor purchases recorded yet.</p> : purchases.map((purchase) => (
          <div className="record-row" key={purchase.id}>
            <span className="product-token"><Package size={16} /></span>
            <span className="record-row__main">
              <strong>{purchase.productName} · {purchase.vendorName}</strong>
              <small>{purchase.packageQuantity} boxes × {purchase.unitsPerPackage} {purchase.unit} = {purchase.totalUnits} {purchase.unit} · ₦{purchase.ratePerPackage.toLocaleString()} per box · Invoice ₦{purchase.invoiceTotal.toLocaleString()} · Paid ₦{purchase.amountPaid.toLocaleString()} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(purchase.createdAt))}</small>
            </span>
            {purchase.balance > 0
              ? <button className="button button--outline" type="button" onClick={() => setPaymentPurchase(purchase)}>Balance ₦{purchase.balance.toLocaleString()} · Pay</button>
              : <span className="status-pill">Paid</span>}
          </div>
        ))}
      </section>}
      {showForm && (
        <div className="preview-modal">
          <section className="preview-modal__body" role="dialog" aria-modal="true" aria-labelledby="add-product-title">
            <div className="preview-modal__heading"><h2 id="add-product-title">{editingProduct ? "Edit product" : "Add product"}</h2><button className="preview-modal__close" type="button" aria-label="Close" onClick={() => { setShowForm(false); setEditingProduct(null); setImageFile(null); setImagePreview(null); }}>×</button></div>
            <form className="form-card" onSubmit={(event) => { event.preventDefault(); void saveProduct(event.currentTarget); }}>
              <label>Product name<input name="name" required minLength={2} maxLength={120} defaultValue={editingProduct?.name ?? ""} /></label>
              <label>Category<input name="category" required minLength={2} maxLength={80} defaultValue={editingProduct?.category ?? "Beverage"} /></label>
              <label>Barcode <span className="muted-copy">Optional · enter the number printed under the barcode</span><input name="barcode" maxLength={100} defaultValue={editingProduct?.barcode ?? ""} /></label>
              {editingProduct && <label>Stock unit<input name="unit" required maxLength={30} defaultValue={editingProduct.unit} placeholder="bottles, cans, cases…" /></label>}
              {!editingProduct && <>
                <label>Stock unit<select name="unit"><option>bottles</option><option>cans</option><option>packs</option><option>items</option><option>kg</option><option>litres</option></select></label>
                <label>Low-stock alert at<input name="reorder" type="number" min="0" step="1" defaultValue="5" required /></label>
              </>}
              <label>Sales department<select name="departmentId" defaultValue={editingProduct?.departmentId ?? ""}><option value="">Unassigned (central stock only)</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              <label>Sale price (₦)<input name="price" type="number" min="0" step="0.01" defaultValue={editingProduct?.price ?? ""} required /></label>
              <label className="product-image-field">
                Product image <span className="muted-copy">Optional · JPG, PNG or WebP · up to 8 MB</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event.currentTarget.files?.[0])} />
              </label>
              {imagePreview && <img className="product-image-preview" src={imagePreview} alt="Selected product preview" />}
              <div className="form-actions">
                <button className="button button--outline" type="button" disabled={saving} onClick={() => { setShowForm(false); setEditingProduct(null); setImageFile(null); setImagePreview(null); }}>Cancel</button>
                <button className="button button--primary" type="submit" disabled={saving}>{saving ? "Saving…" : <><ImagePlus size={15} /> {editingProduct ? "Save product" : "Add product"}</>}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {dispatchProduct && <div className="preview-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !dispatching) setDispatchProduct(null); }}>
        <section className="preview-modal__body" role="dialog" aria-modal="true" aria-labelledby="dispatch-stock-title">
          <div className="preview-modal__heading"><h2 id="dispatch-stock-title">Send stock to department</h2><button className="preview-modal__close" type="button" aria-label="Close" disabled={dispatching} onClick={() => setDispatchProduct(null)}>×</button></div>
          <form className="form-card" onSubmit={(event) => void dispatchStock(event)}>
            <p className="muted-copy">{dispatchProduct.name} · {dispatchProduct.departmentName ?? "Unassigned department"}</p>
            <label>Quantity to send<input type="number" min="1" max={Math.min(dispatchProduct.centralStock, 1_000_000)} step="1" required value={dispatchQuantity} onChange={(event) => setDispatchQuantity(event.target.value)} /></label>
            <p className="muted-copy">This reserves central stock immediately. The department head confirms the quantity received; any shortfall returns to central stock.</p>
            <div className="form-actions"><button className="button button--outline" type="button" disabled={dispatching} onClick={() => setDispatchProduct(null)}>Cancel</button><button className="button button--primary" type="submit" disabled={dispatching}>{dispatching ? "Sending…" : "Send for receipt"}</button></div>
          </form>
        </section>
      </div>}
      {showPurchaseForm && <div className="preview-modal">
        <section className="preview-modal__body" role="dialog" aria-modal="true" aria-labelledby="vendor-purchase-title">
          <div className="preview-modal__heading"><h2 id="vendor-purchase-title">Record vendor purchase</h2><button className="preview-modal__close" type="button" aria-label="Close" disabled={savingPurchase} onClick={() => setShowPurchaseForm(false)}>×</button></div>
          <form className="form-card" onSubmit={(event) => void recordPurchase(event)}>
            <label>Product<select name="productId" value={purchaseProductId} onChange={(event) => setPurchaseProductId(event.target.value)} required><option value="" disabled>Choose product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.unit})</option>)}</select></label>
            <label>Vendor / supplier<input name="vendorName" required minLength={2} maxLength={160} placeholder="Vendor name" /></label>
            <label>Invoice / reference number <span className="muted-copy">Optional</span><input name="reference" maxLength={100} /></label>
            <div className="inventory-form-grid">
              <label>Boxes bought<input name="packageQuantity" type="number" min="1" max="1000000" step="1" defaultValue="1" required /></label>
              <label>Selling units per box<input name="unitsPerPackage" type="number" min="1" max="1000000" step="1" placeholder="Enter box size" required /></label>
            </div>
            <p className="muted-copy">For example, 5 boxes × 24 bottles adds 120 bottles to central stock.</p>
            <label>Rate per box (₦)<input name="ratePerPackage" type="number" min="0" step="0.01" required /></label>
            <label>Amount paid now (₦)<input name="amountPaid" type="number" min="0" step="0.01" defaultValue="0" required /></label>
            <label>Payment method<select name="paymentMethod"><option value="transfer">Transfer</option><option value="cash">Cash</option><option value="card">Card</option></select></label>
            <p className="muted-copy">The invoice is packages × rate. Any unpaid amount remains as a vendor balance. Stock is added centrally for later department dispatch.</p>
            <div className="form-actions"><button className="button button--outline" type="button" disabled={savingPurchase} onClick={() => setShowPurchaseForm(false)}>Cancel</button><button className="button button--primary" type="submit" disabled={savingPurchase}>{savingPurchase ? "Recording…" : "Record purchase and receive stock"}</button></div>
          </form>
        </section>
      </div>}
      {paymentPurchase && <div className="preview-modal">
        <section className="preview-modal__body" role="dialog" aria-modal="true" aria-labelledby="vendor-payment-title">
          <div className="preview-modal__heading"><h2 id="vendor-payment-title">Pay vendor balance</h2><button className="preview-modal__close" type="button" aria-label="Close" disabled={savingPurchase} onClick={() => setPaymentPurchase(null)}>×</button></div>
          <form className="form-card" onSubmit={(event) => void recordVendorPayment(event)}>
            <p className="muted-copy">{paymentPurchase.vendorName} · {paymentPurchase.productName} · Balance ₦{paymentPurchase.balance.toLocaleString()}</p>
            <label>Payment amount (₦)<input name="amount" type="number" min="0.01" max={paymentPurchase.balance} step="0.01" required /></label>
            <label>Payment method<select name="paymentMethod"><option value="transfer">Transfer</option><option value="cash">Cash</option><option value="card">Card</option></select></label>
            <div className="form-actions"><button className="button button--outline" type="button" disabled={savingPurchase} onClick={() => setPaymentPurchase(null)}>Cancel</button><button className="button button--primary" type="submit" disabled={savingPurchase}>{savingPurchase ? "Recording…" : "Record payment"}</button></div>
          </form>
        </section>
      </div>}
    </section>
  );
}
