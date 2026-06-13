// Probe where commission/fees might live in this BaseLinker account.
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
  const o = orders[0];

  // 1) Look for any field on the order whose name hints at fee/commission/tax/net.
  console.log("=== campos do pedido contendo fee/comm/tax/net/extra ===");
  for (const [k, v] of Object.entries(o)) {
    if (/fee|comm|tax|net|cost|extra|profit/i.test(k)) console.log(k, "=", JSON.stringify(v));
  }

  // 2) Try getOrderExtraFields (definitions) — maybe commission stored there.
  console.log("\n=== getOrderExtraFields ===");
  const ef = await call("getOrderExtraFields");
  console.log(JSON.stringify(ef).slice(0, 600));

  // 3) Try getInvoices for one order (ML often exposes fees via invoice).
  console.log("\n=== getJournalList (recent log types) ===");
  const jl = await call("getJournalList", { last_log_id: 0, logs_types: [], order_id: o.order_id });
  console.log(JSON.stringify(jl).slice(0, 400));

  // 4) getOrderPaymentsHistory — payment/commission breakdown?
  console.log("\n=== getOrderPaymentsHistory ===");
  const ph = await call("getOrderPaymentsHistory", { order_id: o.order_id, show_full_history: true });
  console.log(JSON.stringify(ph).slice(0, 600));
}
main().catch((e) => { console.error(e); process.exit(1); });
