const token = process.env.BASELINKER_API_TOKEN;
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
  const r = await call("getOrders", { date_confirmed_from: from });
  const orders = r.orders ?? [];
  let withComm = 0, withFrete = 0;
  for (const o of orders) {
    const c = (o.admin_comments ?? "").replace(/\s+/g, " ").trim();
    const hasComm = /comiss[ãa]o/i.test(c);
    const hasFrete = /frete pago pelo vendedor/i.test(c);
    if (hasComm) withComm++;
    if (hasFrete) withFrete++;
    console.log(`#${o.order_id} pay=${o.payment_done} dlv=${o.delivery_price} :: ${c.slice(0, 120)}`);
  }
  console.log(`\n${withComm}/${orders.length} com 'comissão'; ${withFrete}/${orders.length} com 'Frete pago pelo vendedor'`);
}
main().catch((e) => { console.error(e); process.exit(1); });
