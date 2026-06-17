import { useMemo, useState } from "react";
import {
  ListChecks,
  Columns3,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  AlertTriangle,
  PackageSearch,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACTIVE_LISTING_COLUMNS,
  MARGIN_OPTIONS,
  type ActiveListingRow,
} from "@shared/activeListings";
import { formatBRL, formatNumber, formatRatePct, formatDateShort } from "@/lib/format";

/** Opções de imposto agregado (%) para o seletor. */
const TAX_OPTIONS = [0, 4, 5.93, 8, 10, 12, 15, 18];

function defaultVisibleCols(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const c of ACTIVE_LISTING_COLUMNS) out[c.key] = c.defaultVisible;
  return out;
}

/** Célula de conteúdo para uma coluna "fixa" (não-simulação). */
function renderCell(col: string, row: ActiveListingRow) {
  switch (col) {
    case "thumbnail":
      return row.thumbnail ? (
        <img
          src={row.thumbnail}
          alt=""
          className="h-10 w-10 rounded-md border border-border object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
          <PackageSearch className="h-4 w-4" />
        </div>
      );
    case "title":
      return (
        <span className="line-clamp-2 max-w-[280px] text-sm font-medium">{row.title}</span>
      );
    case "sku":
      return <span className="font-mono text-xs">{row.sku || "—"}</span>;
    case "itemId":
      return <span className="font-mono text-xs">{row.itemId}</span>;
    case "mlListingType":
      return (
        <Badge variant={row.mlListingType === "premium" ? "default" : "secondary"}>
          {row.mlListingType === "premium" ? "Premium" : "Clássico"}
        </Badge>
      );
    case "price":
      return <span className="tabular-nums">{formatBRL(row.price)}</span>;
    case "cost":
      return row.cost != null ? (
        <span className="tabular-nums">{formatBRL(row.cost)}</span>
      ) : (
        <Badge variant="outline" className="gap-1 text-amber-600">
          <AlertTriangle className="h-3 w-3" /> sem custo
        </Badge>
      );
    case "realProfit":
      return row.realProfit != null ? (
        <span
          className={`tabular-nums font-semibold ${row.realProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}
        >
          {formatBRL(row.realProfit)}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "realMarginPct":
      return row.realMarginPct != null ? (
        <span
          className={`tabular-nums ${row.realMarginPct >= 0 ? "text-emerald-600" : "text-red-600"}`}
        >
          {row.realMarginPct.toFixed(1)}%
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "commissionPercent":
      return <span className="tabular-nums">{row.commissionPercent.toFixed(0)}%</span>;
    case "shippingCost":
      return <span className="tabular-nums">{formatBRL(row.shippingCost)}</span>;
    case "availableQuantity":
      return <span className="tabular-nums">{formatNumber(row.availableQuantity)}</span>;
    case "soldQuantity":
      return <span className="tabular-nums">{formatNumber(row.soldQuantity)}</span>;
    case "visits":
      return (
        <span className="tabular-nums">
          {row.visitsAvailable ? formatNumber(row.visits) : "—"}
        </span>
      );
    case "conversion":
      return <span className="tabular-nums">{formatRatePct(row.conversion)}</span>;
    case "health":
      return <span className="tabular-nums">{row.health != null ? `${Math.round(row.health * 100)}%` : "—"}</span>;
    case "freeShipping":
      return row.freeShipping ? <Badge variant="secondary">Sim</Badge> : <span className="text-muted-foreground">Não</span>;
    case "mlLogisticType":
      return (
        <span className="text-xs">
          {row.mlLogisticType === "full_super"
            ? "Full"
            : row.mlLogisticType === "cat_especial"
              ? "Especiais"
              : "Padrão"}
        </span>
      );
    case "catalogListing":
      return row.catalogListing ? <Badge variant="secondary">Sim</Badge> : <span className="text-muted-foreground">Não</span>;
    case "stockValue":
      return <span className="tabular-nums">{formatBRL(row.stockValue)}</span>;
    case "createdMs":
      return <span className="text-xs">{row.createdMs ? formatDateShort(row.createdMs) : "—"}</span>;
    case "updatedMs":
      return <span className="text-xs">{row.updatedMs ? formatDateShort(row.updatedMs) : "—"}</span>;
    case "permalink":
      return row.permalink ? (
        <a
          href={row.permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline"
        >
          abrir <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    default:
      return null;
  }
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default function AnunciosAtivos() {
  const [taxPercent, setTaxPercent] = useState<number>(5.93);
  const [margins, setMargins] = useState<[number, number, number]>([20, 30, 40]);
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(defaultVisibleCols);

  const { data, isLoading, isError, error, refetch, isFetching } =
    trpc.account.activeListings.useQuery(
      { margins, taxPercent },
      { refetchOnWindowFocus: false, retry: 1 },
    );

  const cols = useMemo(
    () => ACTIVE_LISTING_COLUMNS.filter((c) => visibleCols[c.key] || c.locked),
    [visibleCols],
  );

  const toggleCol = (key: string, locked?: boolean) => {
    if (locked) return;
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setMargin = (idx: number, value: number) => {
    setMargins((prev) => {
      const next = [...prev] as [number, number, number];
      next[idx] = value;
      return next;
    });
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho da ferramenta */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600">
            <ListChecks className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-display text-xl tracking-tight">Anúncios ativos</h2>
            <p className="text-sm text-muted-foreground">
              Somente anúncios com status ativo. Lucro real atual e preço-alvo por margem.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Anúncios ativos" value={formatNumber(data.summary.totalActive)} />
          <KpiCard
            label="Com custo"
            value={formatNumber(data.summary.withCost)}
            hint={data.summary.withoutCost > 0 ? `${data.summary.withoutCost} sem custo` : "todos com custo"}
          />
          <KpiCard label="Lucro real total" value={formatBRL(data.summary.totalRealProfit)} />
          <KpiCard label="Valor em estoque" value={formatBRL(data.summary.totalStockValue)} />
        </div>
      )}

      {/* Avisos */}
      {data && !data.summary.baselinkerConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            BaseLinker não configurado: sem o custo dos produtos não é possível calcular o lucro
            real nem os preços-alvo. Configure em Lucratividade para habilitar.
          </span>
        </div>
      )}
      {data?.stale && (
        <div className="rounded-lg border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
          Mostrando os últimos dados carregados (o Mercado Livre limitou as consultas há instantes).
        </div>
      )}

      {/* Controles */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
        {/* Imposto agregado */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Imposto (%)</label>
          <Select value={String(taxPercent)} onValueChange={(v) => setTaxPercent(Number(v))}>
            <SelectTrigger className="h-9 w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_OPTIONS.map((t) => (
                <SelectItem key={t} value={String(t)}>
                  {t.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 3 seletores de margem */}
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Simulação {idx + 1} (margem)
            </label>
            <Select value={String(margins[idx])} onValueChange={(v) => setMargin(idx, Number(v))}>
              <SelectTrigger className="h-9 w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MARGIN_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}

        {/* Seletor de colunas */}
        <div className="ml-auto space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">Colunas</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Columns3 className="mr-2 h-4 w-4" />
                Colunas visíveis
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60">
              <div className="max-h-80 space-y-2 overflow-y-auto">
                <p className="text-xs font-medium text-muted-foreground">
                  Escolha as colunas visíveis
                </p>
                {ACTIVE_LISTING_COLUMNS.map((c) => (
                  <label
                    key={c.key}
                    className={`flex items-center gap-2 text-sm ${c.locked ? "opacity-60" : "cursor-pointer"}`}
                  >
                    <Checkbox
                      checked={visibleCols[c.key] || c.locked}
                      disabled={c.locked}
                      onCheckedChange={() => toggleCol(c.key, c.locked)}
                    />
                    {c.label}
                    {c.locked && <span className="text-xs text-muted-foreground">(fixa)</span>}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              {cols.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium">
                  {c.label}
                </th>
              ))}
              {margins.map((m, idx) => (
                <th
                  key={`sim-${idx}`}
                  className="whitespace-nowrap border-l border-border bg-sky-500/5 px-3 py-2 font-medium text-sky-700"
                >
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Preço p/ {m}%
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {cols.map((c) => (
                    <td key={c.key} className="px-3 py-2">
                      <Skeleton className="h-5 w-16" />
                    </td>
                  ))}
                  {margins.map((_, idx) => (
                    <td key={idx} className="border-l border-border px-3 py-2">
                      <Skeleton className="h-5 w-16" />
                    </td>
                  ))}
                </tr>
              ))}

            {!isLoading &&
              data?.items.map((row) => (
                <tr key={row.itemId} className="border-b border-border last:border-0 hover:bg-muted/30">
                  {cols.map((c) => (
                    <td key={c.key} className="px-3 py-2 align-middle">
                      {renderCell(c.key, row)}
                    </td>
                  ))}
                  {margins.map((m, idx) => {
                    const target = row.targetPrices[String(m)];
                    return (
                      <td
                        key={`sim-${idx}`}
                        className="border-l border-border bg-sky-500/5 px-3 py-2 align-middle"
                      >
                        {target != null ? (
                          <span className="tabular-nums font-semibold text-sky-700">
                            {formatBRL(target)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>

        {!isLoading && data && data.items.length === 0 && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum anúncio ativo encontrado na sua conta no momento.
          </div>
        )}
      </div>

      {isError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
          Não foi possível carregar os anúncios ativos: {error?.message ?? "erro desconhecido"}.{" "}
          <button className="underline" onClick={() => refetch()}>
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
