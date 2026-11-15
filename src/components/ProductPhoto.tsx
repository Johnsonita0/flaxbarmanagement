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
  cocacola: {
    imageUrl: "https://images.openfoodfacts.org/images/products/544/900/000/0996/front_en.1129.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/5449000000996",
    showCredit: true,
  },
  fanta: {
    imageUrl: "https://images.openfoodfacts.org/images/products/000/009/037/7204/front_fr.6.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/90377204",
    showCredit: true,
  },
  sprite: {
    imageUrl: "https://images.openfoodfacts.org/images/products/890/176/403/2905/front_en.28.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/8901764032905",
    showCredit: true,
  },
  nescafe: {
    imageUrl: "https://images.openfoodfacts.org/images/products/611/101/890/3185/front_ar.19.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/6111018903185",
    showCredit: true,
  },
  chivita: {
    imageUrl: "https://images.openfoodfacts.org/images/products/615/110/005/4791/front_fr.3.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/6151100054791",
    showCredit: true,
  },
  maltina: {
    imageUrl: "https://images.openfoodfacts.org/images/products/502/586/600/1096/front_en.15.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/5025866001096",
    showCredit: true,
  },
  amstelmalta: {
    imageUrl: "https://images.openfoodfacts.org/images/products/502/586/600/0082/front_en.17.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/5025866000082",
    showCredit: true,
  },
  fayrouz: {
    imageUrl: "https://images.openfoodfacts.org/images/products/622/300/008/3536/front_fr.3.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/6223000083536",
    showCredit: true,
  },
  maltaguinness: {
    imageUrl: "https://images.openfoodfacts.org/images/products/603/400/010/6091/front_en.3.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/6034000106091",
    showCredit: true,
  },
  heineken: {
    imageUrl: "https://images.openfoodfacts.org/images/products/311/978/025/9625/front_fr.84.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/3119780259625",
    showCredit: true,
  },
  guinnessforeignextrastout: {
    imageUrl: "https://images.openfoodfacts.org/images/products/008/382/018/1104/front_en.3.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/0083820181104",
    showCredit: true,
  },
  carlorossi: {
    imageUrl: "https://images.openfoodfacts.org/images/products/008/500/000/6986/front_en.3.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/0085000006986",
    showCredit: true,
  },
  "4thstreet": {
    imageUrl: "https://images.openfoodfacts.org/images/products/600/110/804/9599/front_fr.3.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/6001108049599",
    showCredit: true,
  },
  jameson: {
    imageUrl: "https://images.openfoodfacts.org/images/products/501/100/700/3227/front_fr.34.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/5011007003227",
    showCredit: true,
  },
  hennessy: {
    imageUrl: "https://images.openfoodfacts.org/images/products/324/599/641/1714/front_fr.11.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/3245996411714",
    showCredit: true,
  },
  martell: {
    imageUrl: "https://images.openfoodfacts.org/images/products/008/043/240/0814/front_en.3.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/0080432400814",
    showCredit: true,
  },
  remymartin: {
    imageUrl: "https://images.openfoodfacts.org/images/products/302/448/000/8797/front_fr.14.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/3024480008797",
    showCredit: true,
  },
  tanqueray: {
    imageUrl: "https://images.openfoodfacts.org/images/products/500/029/102/7248/front_en.3.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/5000291027248",
    showCredit: true,
  },
  gordonsgin: {
    imageUrl: "https://images.openfoodfacts.org/images/products/500/028/911/0808/front_en.9.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/5000289110808",
    showCredit: true,
  },
  smirnoffvodka: {
    imageUrl: "https://images.openfoodfacts.org/images/products/541/031/699/4019/front_en.3.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/5410316994019",
    showCredit: true,
  },
  bacardirum: {
    imageUrl: "https://images.openfoodfacts.org/images/products/008/048/001/6210/front_en.12.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/0080480016210",
    showCredit: true,
  },
  moetchandon: {
    imageUrl: "https://images.openfoodfacts.org/images/products/318/537/072/9960/front_de.3.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/3185370729960",
    showCredit: true,
  },
  aromaticbitters: {
    imageUrl: "https://images.openfoodfacts.org/images/products/007/549/600/1602/front_en.21.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/0075496001602",
    showCredit: true,
  },
  campari: {
    imageUrl: "https://images.openfoodfacts.org/images/products/800/004/000/2028/front_de.4.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/8000040002028",
    showCredit: true,
  },
  baileysirishcream: {
    imageUrl: "https://images.openfoodfacts.org/images/products/008/676/721/0067/front_en.3.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/0086767210067",
    showCredit: true,
  },
  absolutvodka: {
    imageUrl: "https://images.openfoodfacts.org/images/products/731/204/001/7683/front_en.31.400.jpg",
    productUrl: "https://world.openfoodfacts.org/product/7312040017683",
    showCredit: true,
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
  if (catalog.includes(local)) return 2;

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
    if (!response.ok) throw new Error(`Open Food Facts search failed with HTTP ${response.status}`);

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
    .then((photo) => {
      openFoodFactsPhotos.set(cacheKey, photo);
      return photo;
    })
    .catch((error: unknown) => {
      console.warn(`Could not find a catalog image for "${name}".`, error);
      return null;
    })
    .finally(() => {
      openFoodFactsRequests.delete(cacheKey);
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
