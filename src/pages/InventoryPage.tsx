import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ImagePlus, Package, Search } from "lucide-react";
import PageHeading from "../components/PageHeading";
import { useToast } from "../components/ToastProvider";
import { apiRequest, getProductImageUrl } from "../lib/api";
import type { InventoryProduct } from "../lib/api";
import { supabase } from "../lib/supabase";
import "./../css/OperationsPages.css";

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

export default function InventoryPage({ onMovements }: { onMovements: () => void }) {
  const { showToast } = useToast();
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiRequest<{ products: InventoryProduct[] }>("/api/v1/inventory/products")
      .then(({ products: loadedProducts }) => {
        if (active) setProducts(loadedProducts);
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

  async function createProduct(form: HTMLFormElement) {
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    const category = String(values.get("category") ?? "").trim();
    const stock = Number(values.get("stock") ?? 0);
    const unit = String(values.get("unit") ?? "items").trim();
    const reorder = Number(values.get("reorder") ?? 5);
    if (!name || !category || !Number.isInteger(stock) || stock < 0 || !Number.isInteger(reorder) || reorder < 0) {
      showToast("Check the product details and quantities, then try again.", "error");
      return;
    }
    if (!supabase) {
      showToast("Product image storage is unavailable. Please contact your administrator.", "error");
      return;
    }

    setSaving(true);
    let imagePath: string | null = null;
    try {
      if (imageFile) {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) throw new Error("Your sign-in session has expired. Please sign in again.");
        const extension = imageFile.type === "image/png" ? "png" : imageFile.type === "image/webp" ? "webp" : "jpg";
        imagePath = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(imagePath, imageFile, { contentType: imageFile.type, upsert: false });
        if (uploadError) throw new Error("We couldn't upload the product image. Check that product image storage is set up.");
      }

      try {
        const result = await apiRequest<{ product: InventoryProduct }>("/api/v1/inventory/products", {
          method: "POST",
          body: JSON.stringify({ name, category, stock, unit, reorder, imagePath }),
        });
        setProducts((current) => [...current, result.product].sort((left, right) => left.name.localeCompare(right.name)));
      } catch (error: unknown) {
        if (imagePath) {
          const { error: cleanupError } = await supabase.storage.from("product-images").remove([imagePath]);
          if (cleanupError) console.error("Could not clean up an unlinked product image.", cleanupError);
        }
        throw error;
      }

      form.reset();
      setImageFile(null);
      setImagePreview(null);
      setShowForm(false);
      showToast("Product added to inventory.", "success");
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "We couldn't add the product. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="module-page">
      <PageHeading title="Inventory" description="Stock levels, low-stock alerts and item movement." action={{ label: "Add Product", onClick: () => setShowForm(true) }} />
      <button className="icon-link" onClick={onMovements}><ArrowDownToLine size={15} /> View stock movement history</button>
      <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products…" /></label>
      <div className="tab-strip">{["All", "In Stock", "Low Stock", "Out of Stock"].map((tab) => <button className={`tab-chip${filter === tab ? " tab-chip--active" : ""}`} key={tab} onClick={() => setFilter(tab)}>{tab}</button>)}</div>
      {loadError && <p className="inline-error" role="alert">{loadError}</p>}
      <div className="surface-card inventory-list">
        {loading && <p className="empty-state">Loading inventory…</p>}
        {!loading && filtered.map((product) => {
          const low = product.stock <= product.reorder;
          const imageUrl = getProductImageUrl(product.imagePath);
          return (
            <div className="record-row" key={product.id}>
              {imageUrl
                ? <img className="product-thumbnail" src={imageUrl} alt="" />
                : <span className="product-token"><Package size={18} /></span>}
              <span className="record-row__main"><strong>{product.name}</strong><small>{product.category} · Stock: {product.stock} {product.unit}</small></span>
              <span className={`status-pill${low ? " status-pill--warning" : ""}`}>{product.stock === 0 ? "Out of Stock" : low ? "Low Stock" : "In Stock"}</span>
              <button className="icon-link inventory-move" aria-label={`Record a movement for ${product.name}`} onClick={onMovements}><ArrowUpFromLine size={16} /></button>
            </div>
          );
        })}
        {!loading && !loadError && filtered.length === 0 && <p className="empty-state">{products.length ? "No products match this filter." : "No products have been added yet."}</p>}
      </div>
      {showForm && (
        <div className="preview-modal">
          <section className="preview-modal__body" role="dialog" aria-modal="true" aria-labelledby="add-product-title">
            <div className="preview-modal__heading"><h2 id="add-product-title">Add product</h2><button className="preview-modal__close" type="button" aria-label="Close" onClick={() => setShowForm(false)}>×</button></div>
            <form className="form-card" onSubmit={(event) => { event.preventDefault(); void createProduct(event.currentTarget); }}>
              <label>Product name<input name="name" required minLength={2} maxLength={120} /></label>
              <label>Category<select name="category"><option>Beverage</option><option>Snacks</option><option>Tobacco</option><option>Food</option><option>Other</option></select></label>
              <div className="inventory-form-grid">
                <label>Opening quantity<input name="stock" type="number" min="0" step="1" defaultValue="0" required /></label>
                <label>Unit<select name="unit"><option>bottles</option><option>cans</option><option>packs</option><option>items</option><option>kg</option><option>litres</option></select></label>
              </div>
              <label>Low-stock alert at<input name="reorder" type="number" min="0" step="1" defaultValue="5" required /></label>
              <label className="product-image-field">
                Product image <span className="muted-copy">Optional · JPG, PNG or WebP · up to 8 MB</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event.currentTarget.files?.[0])} />
              </label>
              {imagePreview && <img className="product-image-preview" src={imagePreview} alt="Selected product preview" />}
              <div className="form-actions">
                <button className="button button--outline" type="button" disabled={saving} onClick={() => { setShowForm(false); setImageFile(null); setImagePreview(null); }}>Cancel</button>
                <button className="button button--primary" type="submit" disabled={saving}>{saving ? "Saving…" : <><ImagePlus size={15} /> Add product</>}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
