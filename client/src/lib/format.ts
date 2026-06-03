export function formatBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatPercent(value: number | null | undefined, withSign = true): string {
  if (value == null) return "—";
  const sign = withSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function reputationLabel(level: string): string {
  const map: Record<string, string> = {
    "5_green": "Verde (excelente)",
    "4_light_green": "Verde-claro (boa)",
    "3_yellow": "Amarelo (regular)",
    "2_orange": "Laranja (atenção)",
    "1_red": "Vermelho (ruim)",
  };
  return map[level] ?? level;
}

export function reputationColor(level: string): string {
  const map: Record<string, string> = {
    "5_green": "bg-emerald-500",
    "4_light_green": "bg-green-400",
    "3_yellow": "bg-yellow-400",
    "2_orange": "bg-orange-400",
    "1_red": "bg-red-500",
  };
  return map[level] ?? "bg-muted";
}

export function powerSellerLabel(status: string | null): string | null {
  if (!status) return null;
  const map: Record<string, string> = {
    silver: "MercadoLíder Prata",
    gold: "MercadoLíder Ouro",
    platinum: "MercadoLíder Platinum",
  };
  return map[status] ?? status;
}

export function verdictMeta(verdict: "alto" | "medio" | "baixo") {
  switch (verdict) {
    case "alto":
      return { label: "Alto potencial", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" };
    case "medio":
      return { label: "Potencial médio", className: "bg-amber-500/15 text-amber-500 border-amber-500/30" };
    default:
      return { label: "Baixo potencial", className: "bg-muted text-muted-foreground border-border" };
  }
}

export function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-500";
  if (score >= 50) return "text-amber-500";
  return "text-muted-foreground";
}
