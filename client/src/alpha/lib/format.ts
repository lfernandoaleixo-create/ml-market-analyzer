const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
export const money = (n: number) => (Number.isFinite(n) ? brl.format(n) : "—");
export const percent = (n: number) =>
  Number.isFinite(n) ? pct.format(n) + "%" : "—";
