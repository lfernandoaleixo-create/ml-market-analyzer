import { useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatNumber, formatRatePct } from "@/lib/format";
import type { ListingRow, ListingStatus } from "@shared/account";
import {
  Package,
  Eye,
  PauseCircle,
  AlertCircle,
  ExternalLink,
  Search as SearchIcon,
} from "lucide-react";

const STATUS_META: Record<ListingStatus, { label: string; className: string }> = {
  active: { label: "Ativo", className: "bg-emerald-500/12 text-emerald-700 border-emerald-500/20" },
  paused: { label: "Pausado", className: "bg-amber-500/12 text-amber-700 border-amber-500/20" },
  closed: { label: "Encerrado", className: "bg-muted text-muted-foreground border-border" },
  under_review: { label: "Em revisão", className: "bg-blue-500/12 text-blue-700 border-blue-500/20" },
  inactive: { label: "Inativo", className: "bg-muted text-muted-foreground border-border" },
};

type FilterKey = "all" | "active" | "paused" | "stagnant";

export default function Anuncios() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const conn = trpc.account.connection.useQuery();
  const { data, isLoading, error } = trpc.account.listings.useQuery(
    { lastDays: 30 },
    { enabled: conn.data?.connected === true },
  );

  const filtered = useMemo(() => {
    let rows: ListingRow[] = data?.items ?? [];
    if (filter === "active") rows = rows.filter((r) => r.status === "active");
    if (filter === "paused") rows = rows.filter((r) => r.status === "paused");
    if (filter === "stagnant")
      rows = rows.filter((r) => r.availableQuantity > 0 && r.soldQuantity === 0);
    const q = query.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.title.toLowerCase().includes(q));
    return rows;
  }, [data, filter, query]);

  if (conn.isLoading) {
    return (
      <PageShell>
        <Skeleton className="h-9 w-64" />
        <KpiSkeletonRow count={4} />
      </PageShell>
    );
  }
  if (conn.data && !conn.data.connected) return <NotConnected />;
  if (error) return <ErrorState message={error.message} />;

  const s = data?.summary;
  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "active", label: "Ativos" },
    { key: "paused", label: "Pausados" },
    { key: "stagnant", label: "Sem vendas" },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Meus anúncios"
        subtitle="Desempenho real dos seus anúncios: visitas, vendas, conversão e estoque (últimos 30 dias de visitas)."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Anúncios ativos"
          value={isLoading ? "" : `${formatNumber(s?.active ?? 0)} / ${formatNumber(s?.total ?? 0)}`}
          loading={isLoading}
          icon={Package}
          accent="primary"
        />
        <KpiCard
          label="Visitas (30d)"
          value={isLoading ? "" : formatNumber(s?.totalVisits ?? 0)}
          loading={isLoading}
          icon={Eye}
          accent="blue"
        />
        <KpiCard
          label="Pausados"
          value={isLoading ? "" : formatNumber(s?.paused ?? 0)}
          loading={isLoading}
          icon={PauseCircle}
          accent="amber"
        />
        <KpiCard
          label="Sem vendas"
          value={isLoading ? "" : formatNumber(s?.stagnant ?? 0)}
          loading={isLoading}
          icon={AlertCircle}
          accent="rose"
          sublabel="com estoque parado"
        />
      </div>

      <SectionCard
        title="Lista de anúncios"
        actions={
          <div className="relative w-48 md:w-64">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título..."
              className="h-9 pl-9"
            />
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-1 rounded-xl bg-secondary p-1 w-fit">
          {filters.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "ghost"}
              className="h-8 rounded-lg px-3 text-xs"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhum anúncio encontrado com os filtros atuais.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Anúncio</th>
                  <th className="pb-2 px-3 font-medium text-right">Preço</th>
                  <th className="pb-2 px-3 font-medium text-right">Estoque</th>
                  <th className="pb-2 px-3 font-medium text-right">Vendas</th>
                  <th className="pb-2 px-3 font-medium text-right">Visitas</th>
                  <th className="pb-2 px-3 font-medium text-right">Conversão</th>
                  <th className="pb-2 pl-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.itemId} className="group">
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-3">
                        {r.thumbnail ? (
                          <img
                            src={r.thumbnail}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-lg object-cover bg-secondary"
                          />
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded-lg bg-secondary" />
                        )}
                        <div className="min-w-0 max-w-[260px]">
                          <p className="truncate font-medium">{r.title}</p>
                          {r.permalink && (
                            <a
                              href={r.permalink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              Ver no ML <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 text-right tabular-nums">{formatBRL(r.price)}</td>
                    <td className="px-3 text-right tabular-nums">
                      {r.availableQuantity === 0 ? (
                        <span className="text-rose-600">0</span>
                      ) : (
                        formatNumber(r.availableQuantity)
                      )}
                    </td>
                    <td className="px-3 text-right tabular-nums">{formatNumber(r.soldQuantity)}</td>
                    <td className="px-3 text-right tabular-nums">{formatNumber(r.visits)}</td>
                    <td className="px-3 text-right tabular-nums">{formatRatePct(r.conversion)}</td>
                    <td className="pl-3">
                      <Badge variant="outline" className={STATUS_META[r.status]?.className}>
                        {STATUS_META[r.status]?.label ?? r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
