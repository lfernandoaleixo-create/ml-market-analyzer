import {
  parseCatalogProducts,
  serializeCatalogProducts,
  type ProductCatalogRecord,
} from "@shared/alpha/productCatalog";

export const PRODUCT_LOGIN_DRAFT_KEY = "mercato-alpha-product-login-draft-v1";

export function readProductLoginDraft(): ProductCatalogRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const source = sessionStorage.getItem(PRODUCT_LOGIN_DRAFT_KEY);
    return source ? (parseCatalogProducts(source)[0] ?? null) : null;
  } catch {
    return null;
  }
}

export function writeProductLoginDraft(record: ProductCatalogRecord): void {
  sessionStorage.setItem(
    PRODUCT_LOGIN_DRAFT_KEY,
    serializeCatalogProducts([record])
  );
}

export function clearProductLoginDraft(): void {
  try {
    sessionStorage.removeItem(PRODUCT_LOGIN_DRAFT_KEY);
  } catch {}
}
