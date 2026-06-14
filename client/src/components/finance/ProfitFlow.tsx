import { Fragment } from "react";
import type { ProfitBreakdown } from "@shared/finance";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import {
  Wallet,
  Coins,
  Truck,
  Package,
  Receipt,
  Megaphone,
  TrendingUp,
  ChevronRight,
} from "lucide-react";

/**
 * Horizontal flow of small cards: Revenue first, then each cost, ending at the
 * net result. Each card shows the amount and what % of revenue it represents,
 * so it's easy to see the weight of every line. Shared between the Lucratividade
 * page and the Painel (dashboard) historic-base summary.
 */
export function ProfitFlow({ p }: { p: ProfitBreakdown }) {
  const rev = p.revenue;
  const share = (v: number) => (rev > 0 ? v / rev : null);
  const isLoss = p.netProfit < 0;

  const costItems: {
    key: string;
    label: string;
    icon: typeof Coins;
    amount: number;
  }[] = [
    { key: "commission", label: "Comissão ML", icon: Coins, amount: p.commission },
    { key: "shipping", label: "Frete", icon: Truck, amount: p.shipping },
    { key: "cmv", label: "Custo (CMV)", icon: Package, amount: p.cmv },
    { key: "tax", label: "Impostos", icon: Receipt, amount: p.tax },
  ];
  if (p.ads > 0) {
    costItems.push({ key: "ads", label: "Ads", icon: Megaphone, amount: p.ads });
  }

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {/* Revenue */}
      <FlowCard label="Receita" icon={Wallet} amount={p.revenue} tone="revenue" pctLabel="100%" />
      <FlowArrow />
      {/* Costs */}
      {costItems.map((c, i) => (
        <Fragment key={c.key}>
          <FlowCard
            label={c.label}
            icon={c.icon}
            amount={c.amount}
            tone="cost"
            pctLabel={share(c.amount) != null ? `${(share(c.amount)! * 100).toFixed(1)}%` : "—"}
          />
          {i < costItems.length - 1 && <FlowArrow />}
        </Fragment>
      ))}
      <FlowArrow result />
      {/* Result */}
      <FlowCard
        label="Resultado"
        icon={TrendingUp}
        amount={p.netProfit}
        tone={isLoss ? "loss" : "profit"}
        pctLabel={share(p.netProfit) != null ? `${(share(p.netProfit)! * 100).toFixed(1)}%` : "—"}
        emphasized
      />
    </div>
  );
}

function FlowArrow({ result }: { result?: boolean }) {
  return (
    <div className="hidden md:flex items-center self-center px-0.5 text-muted-foreground/40">
      <ChevronRight className={cn("h-4 w-4", result && "text-muted-foreground/60")} />
    </div>
  );
}

function FlowCard({
  label,
  icon: Icon,
  amount,
  tone,
  pctLabel,
  emphasized,
}: {
  label: string;
  icon: typeof Coins;
  amount: number;
  tone: "revenue" | "cost" | "profit" | "loss";
  pctLabel: string;
  emphasized?: boolean;
}) {
  const sign = tone === "cost" ? "−" : "";
  const valueColor =
    tone === "revenue"
      ? "text-foreground"
      : tone === "cost"
        ? "text-rose-600"
        : tone === "loss"
          ? "text-rose-600"
          : "text-emerald-600";
  const iconWrap =
    tone === "revenue"
      ? "bg-blue-500/10 text-blue-600"
      : tone === "cost"
        ? "bg-rose-500/10 text-rose-600"
        : tone === "loss"
          ? "bg-rose-500/10 text-rose-600"
          : "bg-emerald-500/10 text-emerald-600";
  return (
    <div
      className={cn(
        "flex-1 min-w-[120px] rounded-xl border bg-card px-3 py-2.5",
        emphasized
          ? tone === "loss"
            ? "border-rose-500/30 bg-rose-500/[0.05]"
            : "border-emerald-500/30 bg-emerald-500/[0.05]"
          : "border-border",
      )}
    >
      <div className="flex items-center gap-1.5">
        <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", iconWrap)}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
        </div>
        <span className="truncate text-[11px] font-medium text-muted-foreground">{label}</span>
      </div>
      <p className={cn("mt-1.5 font-display tabular-nums leading-tight", emphasized ? "text-lg" : "text-base", valueColor)}>
        {sign}
        {formatBRL(Math.abs(amount))}
      </p>
      <p className="text-[11px] tabular-nums text-muted-foreground">{pctLabel} da receita</p>
    </div>
  );
}
