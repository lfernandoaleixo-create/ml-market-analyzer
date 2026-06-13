// Dump one raw BaseLinker order to inspect the real financial field names.
const token = process.env.BASELINKER_API_TOKEN;
if (!token) { console.error("no token"); process.exit(1); }

async function call(method, params = {}) {
  const body = new URLSearchParams();
  body.set("method", method);
  body.set("parameters", JSON.stringify(params));
  const res = await fetch("https://api.baselinker.com/connector.php", {
    method: "POST",
    headers: { "X-BLToken": token, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  return res.json();
}

async function main() {
  const from = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const r = await call("getOrders", { date_confirmed_from: from, get_unconfirmed_orders: true });
  const orders = r.orders ?? [];
  console.log("total pedidos:", orders.length);
  // Find one with products
  const withProd = orders.find((o) => (o.products ?? []).length > 0) ?? orders[0];
  if (!withProd) { console.log("sem pedidos"); return; }
  // Print top-level keys + a few financial ones
  console.log("\n=== TOP-LEVEL KEYS ===");
  console.log(Object.keys(withProd).join(", "));
  console.log("\n=== CAMPOS FINANCEIROS DO PEDIDO ===");
  for (const k of ["order_id","order_source","payment_method","delivery_price","delivery_method","delivery_state","delivery_country_code","currency","payment_done","commission","order_status_id"]) {
    console.log(k, "=", JSON.stringify(withProd[k]));
  }
  console.log("\n=== PRODUTO[0] ===");
  console.log(JSON.stringify(withProd.products[0], null, 2));
  // Count how many orders have a non-zero commission anywhere
  let withCommission = 0;
  for (const o of orders) {
    const c = o.commission;
    const has = (typeof c === "number" && c > 0) || (c && typeof c === "object" && (c.gross || c.net));
    if (has) withCommission++;
  }
  console.log("\npedidos com commission != 0:", withCommission, "/", orders.length);
  // Show distinct order_source values
  const sources = {};
  for (const o of orders) sources[o.order_source ?? "?"] = (sources[o.order_source ?? "?"] || 0) + 1;
  console.log("order_source:", sources);
}
main().catch((e) => { console.error(e); process.exit(1); });
