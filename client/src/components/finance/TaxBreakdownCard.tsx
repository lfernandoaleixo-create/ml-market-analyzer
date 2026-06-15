import type { TaxDetailTotals } from "@shared/finance";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { Landmark, Building2, ArrowLeftRight, ShieldPlus, Receipt } from "lucide-react";

/**
 * Period tax breakdown for the Lucratividade page — makes it crystal clear how
 * much of the tax burden is plain ICMS (kept by the origin state), how much is
 * DIFAL (paid to the destination state) and how much is FCP. The DIFAL line is
 * visually highlighted because that is exactly what the user asked to see
 * clearly. Federal taxes are shown together for completeness.
 *
 * The sum of the four parts equals the total estimated tax of the period.
 */
export function TaxBreakdownCard({
  detail,
  withTts,
}: {
  detail: TaxDetailTotals;
  withTts: boolean;
}) {
  const total = detail.total;
  const share = (v: number) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "—");

  const parts: Array<{
    key: string;
    label: string;
    hint: string;
    icon: typeof Receipt;
    amount: number;
    tint: string;
    highlight?: boolean;
  }> = [
    {
      key: "federal",
      label: "Impostos federais",
      hint: "PIS, COFINS, IRPJ e CSLL",
      icon: Landmark,
      amount: detail.federal,
      tint: "bg-slate-500/10 text-slate-600",
    },
    {
      key: "icms",
      label: withTts ? "ICMS (efetivo TTS)" : "ICMS (origem)",
      hint: withTts ? "carga efetiva com o benefício TTS" : "parcela que fica no estado de origem",
      icon: Building2,
      amount: detail.icms,
      tint: "bg-amber-500/10 text-amber-600",
    },
    {
      key: "difal",
      label: "DIFAL",
      hint: "diferencial de alíquota pago ao estado de destino",
      icon: ArrowLeftRight,
      amount: detail.difal,
      tint: "bg-violet-500/12 text-violet-700",
      highlight: true,
    },
  ];
  if (detail.fcp > 0) {
    parts.push({
      key: "fcp",
      label: "FCP",
      hint: "Fundo de Combate à Pobreza (destino)",
      icon: ShieldPlus,
      amount: detail.fcp,
      tint: "bg-rose-500/10 text-rose-600",
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {parts.map((p) => (
          <div
            key={p.key}
            className={cn(
              "rounded-xl border px-3 py-3",
              p.highlight ? "border-violet-500/40 bg-violet-500/[0.06]" : "border-border bg-card",
            )}
          >
            <div className="flex items-center gap-2">
              <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", p.tint)}>
                <p.icon className="h-4 w-4" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <p className={cn("text-sm font-medium leading-none", p.highlight && "text-violet-700")}>{p.label}</p>
              </div>
            </div>
            <p
              className={cn(
                "mt-2 font-display tabular-nums leading-tight text-lg",
                p.highlight ? "text-violet-700" : "text-foreground",
              )}
            >
              {formatBRL(p.amount)}
            </p>
            <p className="text-[11px] tabular-nums text-muted-foreground">{share(p.amount)} do imposto</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{p.hint}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Receipt className="h-4 w-4" />
          <span>Total de impostos do período (estimativa)</span>
        </div>
        <span className="font-display tabular-nums text-base">{formatBRL(total)}</span>
      </div>

      {detail.difal > 0 && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          <strong className="text-violet-700">DIFAL</strong> é a diferença entre a alíquota interna do
          estado de destino e a alíquota interestadual de saída (12% para Sul/Sudeste exceto ES; 7% para
          os demais). É devido nas vendas interestaduais ao consumidor final e aqui aparece separado do
          ICMS para você e seu contador conferirem com clareza.
        </p>
      )}
    </div>
  );
}
