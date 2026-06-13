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
import { formatNumber, formatRatePct, formatDateTime } from "@/lib/format";
import { Undo2, AlertOctagon, XCircle, RotateCcw, ShieldCheck } from "lucide-react";

export default function PosVenda() {
  const conn = trpc.account.connection.useQuery();
  const { data, isLoading, error, isFetching, refetch } = trpc.account.postSale.useQuery(
    { days: 60 },
    { enabled: conn.data?.connected === true },
  );

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

  const s = data?.summary;
  const healthy = !isLoading && (s?.openClaims ?? 0) === 0;

  return (
    <PageShell>
      <PageHeader
        title="Pós-venda"
        subtitle="Reclamações, cancelamentos e devoluções da sua loja. Acompanhe a saúde do atendimento."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Reclamações abertas"
          value={isLoading ? "" : formatNumber(s?.openClaims ?? 0)}
          loading={isLoading}
          icon={AlertOctagon}
          accent={healthy ? "emerald" : "rose"}
        />
        <KpiCard
          label="Cancelamentos"
          value={isLoading ? "" : formatNumber(s?.cancellations ?? 0)}
          loading={isLoading}
          icon={XCircle}
          accent="amber"
        />
        <KpiCard
          label="Devoluções"
          value={isLoading ? "" : formatNumber(s?.returns ?? 0)}
          loading={isLoading}
          icon={RotateCcw}
          accent="blue"
        />
        <KpiCard
          label="Taxa de reclamação"
          value={isLoading ? "" : formatRatePct(s?.claimRate ?? null)}
          loading={isLoading}
          icon={Undo2}
          accent="violet"
          sublabel="sobre pedidos do período"
        />
      </div>

      {healthy && (data?.items.length ?? 0) === 0 ? (
        <SectionCard>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h2 className="font-display text-lg tracking-tight">Tudo certo por aqui</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Nenhuma reclamação aberta no período. Continue mantendo bons prazos de envio e
              comunicação com os compradores.
            </p>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="Ocorrências" description="Reclamações e mediações recentes">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (data?.items.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma ocorrência registrada no período.
            </p>
          ) : (
            <div className="divide-y">
              {data!.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {it.itemTitle ?? it.reason ?? "Ocorrência"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {it.type}
                      {it.dateCreated ? ` • ${formatDateTime(it.dateCreated)}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {it.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </PageShell>
  );
}
