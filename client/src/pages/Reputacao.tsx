import { trpc } from "@/lib/trpc";
import {
  PageShell,
  PageHeader,
  KpiCard,
  KpiSkeletonRow,
  SectionCard,
  NotConnected,
  ErrorState,
} from "@/components/account/AccountUI";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatNumber,
  formatRatePct,
  reputationLabel,
  reputationColor,
  powerSellerLabel,
} from "@/lib/format";
import {
  CheckCircle2,
  XCircle,
  ThumbsUp,
  Minus,
  ThumbsDown,
  ExternalLink,
  Award,
} from "lucide-react";

const LEVELS = ["1_red", "2_orange", "3_yellow", "4_light_green", "5_green"];

export default function Reputacao() {
  const conn = trpc.account.connection.useQuery();
  const { data, isLoading, error, isFetching, refetch } = trpc.account.reputation.useQuery(undefined, {
    enabled: conn.data?.connected === true,
  });

  if (conn.isLoading && conn.data === undefined) {
    return (
      <PageShell>
        <Skeleton className="h-9 w-64" />
        <KpiSkeletonRow count={4} />
      </PageShell>
    );
  }
  if (conn.data && conn.data.connected !== true && !conn.isFetching && !data) {
    return <NotConnected />;
  }
  if (error && !data) return <ErrorState onRetry={() => refetch()} retrying={isFetching} />;

  const r = data;
  const level = r?.levelId ?? null;
  const ps = powerSellerLabel(r?.powerSellerStatus ?? null);

  return (
    <PageShell>
      <PageHeader
        title="Reputação"
        subtitle="Saúde da sua conta de vendedor no Mercado Livre: termômetro, transações e avaliações."
        actions={
          r?.permalink ? (
            <a
              href={r.permalink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Ver perfil <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : undefined
        }
      />

      <SectionCard title="Termômetro do Mercado Livre">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-display text-xl tracking-tight">
                  {r?.nickname ?? "—"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {level ? reputationLabel(level) : "Sem nível definido"}
                </p>
              </div>
              {ps && (
                <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/10 text-primary">
                  <Award className="h-3.5 w-3.5" /> {ps}
                </Badge>
              )}
            </div>
            <div className="flex gap-1.5">
              {LEVELS.map((lvl) => {
                const active = lvl === level;
                return (
                  <div
                    key={lvl}
                    className={cn(
                      "h-3 flex-1 rounded-full transition-all",
                      active ? reputationColor(lvl) : "bg-secondary",
                      active && "ring-2 ring-offset-2 ring-offset-card",
                    )}
                    style={active ? { boxShadow: "0 0 0 2px var(--card)" } : undefined}
                  />
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Transações totais"
          value={isLoading ? "" : formatNumber(r?.transactionsTotal ?? 0)}
          loading={isLoading}
          accent="primary"
        />
        <KpiCard
          label="Concluídas"
          value={isLoading ? "" : formatNumber(r?.transactionsCompleted ?? 0)}
          loading={isLoading}
          icon={CheckCircle2}
          accent="emerald"
        />
        <KpiCard
          label="Canceladas"
          value={isLoading ? "" : formatNumber(r?.transactionsCanceled ?? 0)}
          loading={isLoading}
          icon={XCircle}
          accent="rose"
        />
        <KpiCard
          label="Experiência"
          value={isLoading ? "" : (r?.sellerExperience ?? "—")}
          loading={isLoading}
          icon={Award}
          accent="violet"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Avaliações dos compradores">
          {isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <RatingTile
                icon={ThumbsUp}
                label="Positivas"
                value={r?.ratingsPositive ?? 0}
                className="bg-emerald-500/10 text-emerald-700"
              />
              <RatingTile
                icon={Minus}
                label="Neutras"
                value={r?.ratingsNeutral ?? 0}
                className="bg-amber-500/10 text-amber-700"
              />
              <RatingTile
                icon={ThumbsDown}
                label="Negativas"
                value={r?.ratingsNegative ?? 0}
                className="bg-rose-500/10 text-rose-700"
              />
            </div>
          )}
        </SectionCard>

        <SectionCard title="Indicadores de atendimento">
          {isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : (
            <div className="space-y-3">
              <MetricRow label="Taxa de reclamações" value={formatRatePct(r?.metrics?.claimsRate ?? null)} />
              <MetricRow label="Envios com atraso" value={formatRatePct(r?.metrics?.delayedRate ?? null)} />
              <MetricRow
                label="Cancelamentos"
                value={formatRatePct(r?.metrics?.cancellationsRate ?? null)}
              />
            </div>
          )}
        </SectionCard>
      </div>
    </PageShell>
  );
}

function RatingTile({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: typeof ThumbsUp;
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-1 rounded-xl py-4", className)}>
      <Icon className="h-5 w-5" />
      <span className="font-display text-xl leading-none">{formatNumber(value)}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
