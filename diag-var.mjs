// Inspeção completa de um anúncio com variação para achar o SKU real.
import { ensureUserAccessToken } from "./server/ml/oauthMl.ts";
import { listUsersWithMlCredentials } from "./server/dbMl.ts";

const API = "https://api.mercadolibre.com";
const TARGETS = ["MLB6728481906", "MLB6956212670", "MLB6795503928"]; // Hashi, Palito dente, Espeto 5000

async function main() {
  const [userId] = await listUsersWithMlCredentials();
  const token = await ensureUserAccessToken(userId);
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  for (const id of TARGETS) {
    // Item completo, SEM filtro de attributes
    const d = await fetch(`${API}/items/${id}`, { headers }).then((r) => r.json());
    console.log("\n===== ", id, "|", (d.title || "").slice(0, 55));
    console.log("  seller_custom_field:", JSON.stringify(d.seller_custom_field));
    console.log("  seller_sku:", JSON.stringify(d.seller_sku));
    console.log("  user_product_id:", JSON.stringify(d.user_product_id));
    const sellerSkuAttr = Array.isArray(d.attributes)
      ? d.attributes.find((a) => a?.id === "SELLER_SKU")
      : null;
    console.log("  attr SELLER_SKU:", JSON.stringify(sellerSkuAttr?.value_name));
    if (Array.isArray(d.variations) && d.variations.length) {
      console.log("  -- variations:", d.variations.length);
      for (const v of d.variations.slice(0, 3)) {
        const vAttr = Array.isArray(v.attributes)
          ? v.attributes.find((a) => a?.id === "SELLER_SKU")?.value_name
          : null;
        console.log("    var", v.id, "scf:", JSON.stringify(v.seller_custom_field),
          "attrSku:", JSON.stringify(vAttr), "user_product_id:", JSON.stringify(v.user_product_id));
        // imprime todas as keys da variação para descobrir onde mora o sku
        console.log("    var keys:", Object.keys(v).join(","));
      }
    }
    // Se houver user_product_id, busca o user product (catálogo do vendedor)
    const upid = d.user_product_id || (d.variations || []).find((v) => v.user_product_id)?.user_product_id;
    if (upid) {
      const up = await fetch(`${API}/user-products/${upid}`, { headers })
        .then((r) => r.json())
        .catch(() => null);
      console.log("  user-product:", upid, "->", up ? JSON.stringify({
        sku: up.sku, seller_sku: up.seller_sku, attributes: (up.attributes||[]).filter(a=>/SKU/i.test(a.id||"")),
      }) : "(falhou)");
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error("ERRO:", e); process.exit(1); });
