import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/format";
import type { SourceUsage, UsageStatus } from "@shared/sources";
import { Gauge, ExternalLink, CircleSlash, AlertCircle } from "lucide-react";

/**
 * "Consumo & Limites" panel.
 *
 * Gives the team visibility over the paid scraper "tank" before it runs low.
 * It is deliberately honest per provider:
 *  - ScrapingBee exposes credits → show a progress bar + remaining + renewal.
 *  - Oxylabs / Unwrangle have no public balance endpoint → show "consumo no
 *    painel do provedor" with a link, never an invented number.
 * It also shows how many searches the current user started today / in 30 days.
 */

function pct(used: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

function renewalLabel(ts: number | null): string | null {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const PANEL_LINKS: Partial<Record<SourceUsage["id"], string>> = {
  oxylabs: "https://dashboard.oxylabs.io",
  unwrangle: "https://unwrangle.com",
};

function QuotaCard({ s }: { s: SourceUsage }) {
  const used = s.usedCredits ?? 0;
  const max = s.maxCredits ?? 0;
  const remaining = s.remainingCredits ?? Math.max(0, max - used);
  const usedPct = pct(used, max);
  // Color the bar by how much is LEFT: green > 25%, amber 10-25%, red < 10%.
  const remainingPct = 100 - usedPct;
  const barTone =
    remainingPct < 10
      ? "text-red-600"
      : remainingPct < 25
        ? "text-amber-600"
        : "text-emerald-600";
  const renewal = renewalLabel(s.renewalAt);

  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium">{s.label}</p>
        <span className={cn("text-[11px] font-semibold", barTone)}>
          {formatCompact(remaining)} restantes
        </span>
      </div>
      <Progress value={usedPct} className="h-1.5" />
      <p className="mt-1.5 text-[11px] leading-tight text-muted-foreground">
        {formatCompact(used)} de {formatCompact(max)} créditos usados
        {renewal ? ` · renova ${renewal}` : ""}
      </p>
    </div>
  );
}

function PanelOnlyCard({ s }: { s: SourceUsage }) {
  const link = PANEL_LINKS[s.id];
  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <Gauge className="h-3.5 w-3.5 shrink-0 text-sky-500" />
        <p className="truncate text-xs font-medium">{s.label}</p>
      </div>
      <p className="text-[11px] leading-tight text-muted-foreground">
        {s.note ?? "Consumo visível no painel do provedor."}
      </p>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 hover:underline"
        >
          Abrir painel <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function NeutralCard({ s }: { s: SourceUsage }) {
  const isError = s.kind === "error";
  const Icon = isError ? AlertCircle : CircleSlash;
  return (
    <div className={cn("rounded-lg border bg-card/50 p-3", !isError && "opacity-70")}>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            isError ? "text-amber-500" : "text-muted-foreground/50",
          )}
        />
        <p className="truncate text-xs font-medium">{s.label}</p>
      </div>
      <p className="text-[11px] leading-tight text-muted-foreground">
        {s.note ?? (isError ? "Não foi possível ler o consumo." : "Não configurada.")}
      </p>
    </div>
  );
}

function SourceUsageCard({ s }: { s: SourceUsage }) {
  if (s.kind === "quota") return <QuotaCard s={s} />;
  if (s.kind === "panel_only") return <PanelOnlyCard s={s} />;
  return <NeutralCard s={s} />;
}

export function UsagePanel({
  data,
  isLoading,
}: {
  data: UsageStatus | undefined;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (!data) return null;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Consumo & limites</p>
            <p className="text-xs text-muted-foreground">
              Acompanhe o saldo das fontes pagas antes que ele acabe.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">
            {data.searchesToday}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              hoje
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {data.searchesLast30Days} nos últimos 30 dias
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.sources.map((s) => (
          <SourceUsageCard key={s.id} s={s} />
        ))}
      </div>
    </Card>
  );
}
