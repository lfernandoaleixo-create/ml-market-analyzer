// Diagnóstico: onde está o SKU dos anúncios "sem SKU"?
// Usa o token do dono (mesma engine do app) e inspeciona itens reais do ML.
import { ensureUserAccessToken } from "./server/ml/oauthMl.ts";
import { listUsersWithMlCredentials } from "./server/dbMl.ts";

const API = "https://api.mercadolibre.com";

async function main() {
  const userIds = await listUsersWithMlCredentials();
  if (!userIds.length) {
    console.log("Nenhum usuário com credenciais ML.");
    return;
  }
  const userId = userIds[0];
  const token = await ensureUserAccessToken(userId);
  if (!token) {
    console.log("Sem token ML para userId", userId);
    return;
  }
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  // 1) Pega o ML user id
  const me = await fetch(`${API}/users/me`, { headers }).then((r) => r.json());
  const mlUserId = me.id;
  console.log("ML user:", mlUserId, me.nickname);

  // 2) Lista alguns itens ativos
  const search = await fetch(
    `${API}/users/${mlUserId}/items/search?status=active&limit=20`,
    { headers },
  ).then((r) => r.json());
  const ids = (search.results || []).slice(0, 20);
  console.log("IDs ativos (amostra):", ids.length);

  // 3) Multiget com todos os campos relevantes ao SKU
  const attrs =
    "id,title,seller_custom_field,seller_sku,attributes,variations,user_product_id,inventory_id";
  const csv = ids.join(",");
  const multi = await fetch(
    `${API}/items?ids=${csv}&attributes=${attrs}`,
    { headers },
  ).then((r) => r.json());

  for (const entry of multi) {
    const d = entry.body || {};
    const rootSku =
      d.seller_custom_field ||
      d.seller_sku ||
      (Array.isArray(d.attributes)
        ? d.attributes.find((a) => a?.id === "SELLER_SKU")?.value_name
        : null);
    const varSkus = Array.isArray(d.variations)
      ? d.variations.map((v) => ({
          id: v.id,
          scf: v.seller_custom_field,
          attrSku: Array.isArray(v.attributes)
            ? v.attributes.find((a) => a?.id === "SELLER_SKU")?.value_name
            : null,
        }))
      : [];
    console.log("\n---", d.id, "|", (d.title || "").slice(0, 50));
    console.log("  root SKU:", rootSku || "(vazio)");
    console.log("  user_product_id:", d.user_product_id || "(vazio)", "inventory_id:", d.inventory_id || "(vazio)");
    if (varSkus.length) console.log("  variations:", JSON.stringify(varSkus));
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
