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
}

interface OpenFoodFactsResponse {
  status?: number;
  product?: {
    code?: string;
    product_name?: string;
    image_front_url?: string;
  };
}

const fallbackImage = "/product-fallback.svg";
const openFoodFactsPhotos = new Map<string, OpenFoodFactsPhoto | null>();
const openFoodFactsRequests = new Map<string, Promise<OpenFoodFactsPhoto | null>>();
const verifiedProductPhotos: Record<string, OpenFoodFactsPhoto> = {
  absolutvodka: {
    imageUrl: "https://images.openfoodfacts.org/images/products/731/204/001/7683/front_en.31.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/7312040017683",
  },
};

function normalizeProductName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function namesMatch(localName: string, catalogName: string) {
  const local = normalizeProductName(localName);
  const catalog = normalizeProductName(catalogName);
  return local.length >= 5 && catalog.length >= 5 && (local.includes(catalog) || catalog.includes(local));
}

function getVerifiedPhoto(name: string) {
  return verifiedProductPhotos[normalizeProductName(name)] ?? null;
}

function findOpenFoodFactsPhoto(barcode: string, name: string): Promise<OpenFoodFactsPhoto | null> {
  const cached = openFoodFactsPhotos.get(barcode);
  if (cached !== undefined) return Promise.resolve(cached);

  const inFlight = openFoodFactsRequests.get(barcode);
  if (inFlight) return inFlight;

  const request = fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,image_front_url`,
    { headers: { Accept: "application/json" } },
  )
    .then(async (response) => {
      if (!response.ok) return null;
      const result = await response.json() as OpenFoodFactsResponse;
      const product = result.product;
      if (result.status !== 1 || !product?.image_front_url || !product.product_name || !namesMatch(name, product.product_name)) {
        return null;
      }
      return {
        imageUrl: product.image_front_url,
        productUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(product.code ?? barcode)}`,
      };
    })
    .catch(() => null)
    .then((photo) => {
      openFoodFactsPhotos.set(barcode, photo);
      openFoodFactsRequests.delete(barcode);
      return photo;
    });

  openFoodFactsRequests.set(barcode, request);
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
    if ((uploadedImageUrl && uploadedImageUrl !== failedImageUrl) || verifiedPhoto || !barcode || onlinePhoto) return;
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
        loading="lazy"
        onError={() => {
          if (imageUrl !== fallbackImage) setFailedImageUrl(imageUrl);
        }}
      />
      {selectedPhoto && imageUrl === selectedPhoto.imageUrl && <span
        className="product-photo__credit"
        aria-label={`${name} image from Open Food Facts contributors under Creative Commons Attribution ShareAlike 3.0`}
        title={`Open Food Facts contributors · CC BY-SA 3.0 · ${selectedPhoto.productUrl}`}
      >OFF</span>}
    </span>
  );
}
