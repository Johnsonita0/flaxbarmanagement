import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ImagePlus, Package, Pencil, Plus, Search } from "lucide-react";
import type { CurrentUser } from "../lib/api";
import PageHeading from "../components/PageHeading";
import { useToast } from "../components/ToastProvider";
import { apiRequest, getProductImageUrl } from "../lib/api";
import type { InventoryProduct } from "../lib/api";
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
  const [centralStockProduct, setCentralStockProduct] = useState<InventoryProduct | null>(null);
  const [centralStockQuantity, setCentralStockQuantity] = useState("1");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiRequest<{ products: InventoryProduct[]; departments: InventoryDepartment[] }>("/api/v1/inventory/products")
      .then(({ products: loadedProducts, departments: loadedDepartments }) => {
        if (active) {
          setProducts(loadedProducts);
          setDepartments(loadedDepartments);
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
    const stock = Number(values.get("stock") ?? 0);
    const unit = String(values.get("unit") ?? "items").trim();
    const reorder = Number(values.get("reorder") ?? 5);
    const departmentId = String(values.get("departmentId") ?? "");
    const price = Number(values.get("price") ?? NaN);
    if (!name || !category || !Number.isInteger(stock) || stock < 0 || !Number.isInteger(reorder) || reorder < 0) {
      showToast("Check the product details and quantities, then try again.", "error");
      return;
    }
    if (!departmentId || !Number.isFinite(price) || price < 0) {
      showToast("Choose a department and enter a valid sale price.", "error");
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
          body: JSON.stringify({ name, category, barcode, unit, departmentId, price, ...(imagePath ? { imagePath } : {}) }),
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
          body: JSON.stringify({ name, category, barcode, stock, unit, reorder, imagePath, departmentId, price }),
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

  async function addCentralStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!centralStockProduct) return;
    const quantity = Number(centralStockQuantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
      showToast("Enter a whole-number quantity greater than zero.", "error");
      return;
    }
    setDispatching(true);
    try {
      const result = await apiRequest<{ centralStock: number; message: string }>(`/api/v1/inventory/products/${centralStockProduct.id}/central-stock`, {
        method: "POST",
        body: JSON.stringify({ quantity }),
      });
      setProducts((current) => current.map((product) => product.id === centralStockProduct.id
        ? { ...product, centralStock: result.centralStock }
        : product));
      showToast(result.message, "success");
      setCentralStockProduct(null);
      setCentralStockQuantity("1");
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "We couldn't add central stock.", "error");
    } finally {
      setDispatching(false);
    }
  }

  return (
    <section className="module-page">
      <PageHeading title="Inventory" description="Stock levels, department selling prices and shift handovers." action={{ label: "Add Product", onClick: () => { setEditingProduct(null); setShowForm(true); } }} />
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
              {canDispatchStock && <button className="icon-link inventory-move" aria-label={`Add central stock for ${product.name}`} title="Record a new central stock receipt" onClick={() => { setCentralStockProduct(product); setCentralStockQuantity("1"); }}><Plus size={15} /></button>}
              {canDispatchStock && <button className="icon-link inventory-move" aria-label={`Send stock for ${product.name}`} title={department?.headUserId ? "Reserve central stock and send it to the department head" : "Assign a department and active head before sending stock"} disabled={!department?.headUserId || product.centralStock < 1} onClick={() => { setDispatchProduct(product); setDispatchQuantity("1"); }}><ArrowUpFromLine size={15} /></button>}
              <button className="icon-link inventory-move" aria-label={`Edit ${product.name}`} onClick={() => { setEditingProduct(product); setImageFile(null); setImagePreview(getProductImageUrl(product.imagePath)); setShowForm(true); }}><Pencil size={15} /></button>
              <button className="icon-link inventory-move" aria-label={`Record a movement for ${product.name}`} onClick={onMovements}><ArrowUpFromLine size={16} /></button>
            </div>
          );
        })}
        {!loading && !loadError && filtered.length === 0 && <p className="empty-state">{products.length ? "No products match this filter." : "No products have been added yet."}</p>}
      </div>
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
                <div className="inventory-form-grid">
                  <label>Opening central stock<input name="stock" type="number" min="0" step="1" defaultValue="0" required /></label>
                  <label>Unit<select name="unit"><option>bottles</option><option>cans</option><option>packs</option><option>items</option><option>kg</option><option>litres</option></select></label>
                </div>
                <label>Low-stock alert at<input name="reorder" type="number" min="0" step="1" defaultValue="5" required /></label>
              </>}
              <label>Sales department<select name="departmentId" defaultValue={editingProduct?.departmentId ?? ""} required><option value="" disabled>Choose department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
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
      {centralStockProduct && <div className="preview-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !dispatching) setCentralStockProduct(null); }}>
        <section className="preview-modal__body" role="dialog" aria-modal="true" aria-labelledby="central-stock-title">
          <div className="preview-modal__heading"><h2 id="central-stock-title">Receive central stock</h2><button className="preview-modal__close" type="button" aria-label="Close" disabled={dispatching} onClick={() => setCentralStockProduct(null)}>×</button></div>
          <form className="form-card" onSubmit={(event) => void addCentralStock(event)}>
            <p className="muted-copy">{centralStockProduct.name} · Current central balance: {centralStockProduct.centralStock} {centralStockProduct.unit}</p>
            <label>Quantity received into central inventory<input type="number" min="1" max="1000000" step="1" required value={centralStockQuantity} onChange={(event) => setCentralStockQuantity(event.target.value)} /></label>
            <p className="muted-copy">Stock stays in central inventory until it is sent to a department.</p>
            <div className="form-actions"><button className="button button--outline" type="button" disabled={dispatching} onClick={() => setCentralStockProduct(null)}>Cancel</button><button className="button button--primary" type="submit" disabled={dispatching}>{dispatching ? "Recording…" : "Record stock receipt"}</button></div>
          </form>
        </section>
      </div>}
    </section>
  );
}
