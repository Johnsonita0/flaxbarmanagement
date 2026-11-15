import { useEffect, useState } from "react";
import { getProductImageUrl } from "../lib/api";

interface ProductPhotoProps {
  imagePath: string | null;
  name: string;
  barcode?: string | null;
  className?: string;
}

interface OpenFoodFactsPhoto {
  imageUrl: string;
  productUrl: string;
  showCredit: boolean;
}

interface OpenFoodFactsResponse {
  status?: number;
  product?: {
    code?: string;
    product_name?: string;
    image_front_url?: string;
  };
  products?: {
    code?: string;
    product_name?: string;
    image_front_url?: string;
  }[];
}

const fallbackImage = "/product-fallback.svg";
const openFoodFactsPhotos = new Map<string, OpenFoodFactsPhoto | null>();
const openFoodFactsRequests = new Map<string, Promise<OpenFoodFactsPhoto | null>>();
const verifiedProductPhotos: Record<string, OpenFoodFactsPhoto> = {
  absolutvodka: {
    imageUrl: "https://images.openfoodfacts.org/images/products/731/204/001/7683/front_en.31.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/7312040017683",
    showCredit: false,
  },
};

function normalizeProductName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nameMatchScore(localName: string, catalogName: string) {
  const local = normalizeProductName(localName);
  const catalog = normalizeProductName(catalogName);
  if (local.length < 5 || catalog.length < 5) return 0;
  if (local === catalog) return 3;
  if (local.includes(catalog) || catalog.includes(local)) return 2;

  const localTokens = localName.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const catalogTokens = new Set(catalogName.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  return localTokens.length > 0 && localTokens.every((token) => catalogTokens.has(token)) ? 1 : 0;
}

function getVerifiedPhoto(name: string) {
  return verifiedProductPhotos[normalizeProductName(name)] ?? null;
}

function findOpenFoodFactsPhoto(barcode: string | null | undefined, name: string): Promise<OpenFoodFactsPhoto | null> {
  const normalizedBarcode = barcode?.trim() ?? "";
  const cacheKey = normalizedBarcode ? `barcode:${normalizedBarcode}` : `name:${normalizeProductName(name)}`;
  const cached = openFoodFactsPhotos.get(cacheKey);
  if (cached !== undefined) return Promise.resolve(cached);

  const inFlight = openFoodFactsRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const request = (async () => {
    if (normalizedBarcode) {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(normalizedBarcode)}.json?fields=code,product_name,image_front_url`,
        { headers: { Accept: "application/json" } },
      );
      if (response.ok) {
        const result = await response.json() as OpenFoodFactsResponse;
        const product = result.product;
        if (result.status === 1 && product?.image_front_url && product.product_name && nameMatchScore(name, product.product_name) > 0) {
          return {
            imageUrl: product.image_front_url,
            productUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(product.code ?? normalizedBarcode)}`,
            showCredit: true,
          };
        }
      }
    }

    const search = new URLSearchParams({
      search_terms: name,
      fields: "code,product_name,image_front_url",
      page_size: "12",
    });
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/search?${search}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const result = await response.json() as OpenFoodFactsResponse;
    const matches = (result.products ?? [])
      .filter((product) => product.code && product.product_name && product.image_front_url)
      .map((product) => ({
        score: nameMatchScore(name, product.product_name ?? ""),
        product,
      }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score);
    const product = matches[0]?.product;
    if (!product?.image_front_url || !product.product_name || !product.code) return null;
    return {
      imageUrl: product.image_front_url,
      productUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(product.code)}`,
      showCredit: true,
    };
  })()
    .catch((error: unknown) => {
      console.warn(`Could not find a catalog image for "${name}".`, error);
      return null;
    })
    .then((photo) => {
      openFoodFactsPhotos.set(cacheKey, photo);
      openFoodFactsRequests.delete(cacheKey);
      return photo;
    });

  openFoodFactsRequests.set(cacheKey, request);
  return request;
}

export default function ProductPhoto({ imagePath, name, barcode, className }: ProductPhotoProps) {
  const uploadedImageUrl = getProductImageUrl(imagePath);
  const verifiedPhoto = getVerifiedPhoto(name);
  const [onlinePhoto, setOnlinePhoto] = useState<OpenFoodFactsPhoto | null>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    setOnlinePhoto(null);
    setFailedImageUrl(null);
  }, [imagePath, name, barcode]);

  useEffect(() => {
    if ((uploadedImageUrl && uploadedImageUrl !== failedImageUrl) || verifiedPhoto || onlinePhoto) return;
    let active = true;
    void findOpenFoodFactsPhoto(barcode, name).then((photo) => {
      if (active) setOnlinePhoto(photo);
    });
    return () => {
      active = false;
    };
  }, [barcode, failedImageUrl, name, onlinePhoto, uploadedImageUrl, verifiedPhoto]);

  const selectedPhoto = uploadedImageUrl && uploadedImageUrl !== failedImageUrl
    ? null
    : verifiedPhoto ?? onlinePhoto;
  const imageUrl = uploadedImageUrl && uploadedImageUrl !== failedImageUrl
    ? uploadedImageUrl
    : selectedPhoto?.imageUrl && selectedPhoto.imageUrl !== failedImageUrl
      ? selectedPhoto.imageUrl
      : fallbackImage;

  return (
    <span className={`product-photo${className ? ` ${className}` : ""}`}>
      <img
        className="product-photo__image"
        src={imageUrl}
        alt={`${name} product`}
        title={selectedPhoto ? `Image from Open Food Facts contributors · CC BY-SA 3.0 · ${selectedPhoto.productUrl}` : undefined}
        loading="lazy"
        onError={() => {
          if (imageUrl !== fallbackImage) setFailedImageUrl(imageUrl);
        }}
      />
      {selectedPhoto?.showCredit && imageUrl === selectedPhoto.imageUrl && <span
        className="product-photo__credit"
        aria-label={`${name} image from Open Food Facts contributors under Creative Commons Attribution ShareAlike 3.0`}
        title={`Open Food Facts contributors · CC BY-SA 3.0 · ${selectedPhoto.productUrl}`}
      >OFF</span>}
    </span>
  );
}
