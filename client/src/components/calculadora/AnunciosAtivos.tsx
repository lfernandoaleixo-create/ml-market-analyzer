import { useMemo, useState, useCallback } from "react";
import {
  ListChecks,
  Columns3,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  AlertTriangle,
  PackageSearch,
  SlidersHorizontal,
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
  computeListingProfit,
  computeTargetPrices,
  type ActiveListingRow,
  type ListingCalcInput,
  type ListingCalcParams,
  type ListingOverrides,
} from "@shared/activeListings";
import { formatBRL, formatNumber, formatRatePct, formatDateShort } from "@/lib/format";
import RecalibrarCard from "./RecalibrarCard";

/** Opções de imposto agregado (%) para o seletor. */
const TAX_OPTIONS = [0, 4, 5.93, 8, 10, 12, 15, 18];

function defaultVisibleCols(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const c of ACTIVE_LISTING_COLUMNS) out[c.key] = c.defaultVisible;
  return out;
}

/** Converte uma linha (já recalculada) em entrada da calculadora. */
function toCalcInput(row: ActiveListingRow): ListingCalcInput {
  return {
    price: row.price,
    cost: row.cost,
    mlListingType: row.mlListingType,
    mlLogisticType: row.mlLogisticType,
    commissionPercent: row.commissionPercent,
    weightIndex: row.weightIndex,
    freeShippingFast: row.freeShipping && row.price < 79,
    reputation: "verde",
  };
}

/**
 * Recalcula uma linha aplicando os overrides do anúncio (se houver). Devolve
 * uma cópia da linha com frete/lucro/margem/preços-alvo recomputados e os campos
 * efetivos refletindo os overrides (custo, comissão, tipo, logística).
 */
function recalcRow(
  row: ActiveListingRow,
  margins: number[],
  taxPercent: number,
  ov: ListingOverrides | undefined,
): ActiveListingRow {
  const params: ListingCalcParams = { taxPercent };
  const calcInput = toCalcInput(row);
  const overrides = ov ?? {};
  const profit = computeListingProfit(calcInput, params, overrides);
  const targetPrices = computeTargetPrices(calcInput, params, margins, overrides);

  return {
    ...row,
    cost: overrides.cost != null ? overrides.cost : row.cost,
    commissionPercent: overrides.commissionPercent ?? row.commissionPercent,
    mlListingType: overrides.mlListingType ?? row.mlListingType,
    mlLogisticType: overrides.mlLogisticType ?? row.mlLogisticType,
    weightIndex: overrides.weightIndex ?? row.weightIndex,
    shippingCost: profit.shippingCost,
    fixedFee: profit.fixedFee,
    realProfit: profit.realProfit,
    realMarginPct: profit.realMarginPct,
    targetPrices,
  };
}

/** Célula de conteúdo para uma coluna "fixa" (não-simulação). */
function renderCell(col: string, row: ActiveListingRow, adjusted: boolean) {
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
        <div className="flex max-w-[280px] flex-col gap-1">
          <span className="line-clamp-2 text-sm font-medium">{row.title}</span>
          {adjusted && (
            <Badge variant="outline" className="w-fit gap-1 border-sky-500/40 text-sky-600">
              <SlidersHorizontal className="h-3 w-3" /> ajustado
            </Badge>
          )}
        </div>
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
          {row.visitsAvailable ? (
            formatNumber(row.visits)
          ) : (
            <span className="text-xs text-muted-foreground italic">carregando…</span>
          )}
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

  // Seleção de anúncios (para recalibragem em lote/individual).
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // Overrides por anúncio (itemId → overrides). Não persistido (decisão do Fernando).
  const [overrides, setOverrides] = useState<Record<string, ListingOverrides>>({});

  const { data, isLoading, isError, error, refetch, isFetching } =
    trpc.account.activeListings.useQuery(
      { margins, taxPercent },
      {
        refetchOnWindowFocus: false,
        retry: 1,
        // Enquanto a montagem roda em background (cold start), o backend devolve
        // `ready:false` com status "loading"/"stale". Fazemos poll a cada 4s até
        // ficar pronto. Se vier status "error" (ML 429), PARAMOS o poll para não
        // agravar o rate limit — o usuário reativa com "Tentar novamente".
        refetchInterval: (query) => {
          const d = query.state.data as { ready?: boolean; status?: string } | undefined;
          if (d?.ready === false && d?.status !== "error") return 4000;
          return false;
        },
      },
    );

  // Só há dados completos quando ready === true. Em loading/cold start, payload = null.
  const payload = data && data.ready === true ? data : null;
  // ready:false pode ser "preparando" (coleta em background) OU "erro" (a coleta
  // falhou, típico ML 429). O backend envia status e message para distinguir.
  const notReady = data != null && data.ready === false;
  const coldError =
    notReady && (data as { status?: string }).status === "error";
  const coldErrorMessage =
    (data as { message?: string } | null)?.message ??
    "Não foi possível carregar os anúncios agora. Tente novamente em instantes.";
  const preparing = notReady && !coldError;

  const cols = useMemo(
    () => ACTIVE_LISTING_COLUMNS.filter((c) => visibleCols[c.key] || c.locked),
    [visibleCols],
  );

  // Linhas recalculadas no cliente, aplicando os overrides por anúncio.
  const rows = useMemo(() => {
    if (!payload) return [] as ActiveListingRow[];
    return payload.items.map((row) => recalcRow(row, margins, taxPercent, overrides[row.itemId]));
  }, [payload, margins, taxPercent, overrides]);

  // Resumo recalculado (reflete overrides).
  const summary = useMemo(() => {
    if (!payload) return null;
    const withCost = rows.filter((r) => r.cost != null).length;
    const totalRealProfit = rows.reduce((s, r) => s + (r.realProfit ?? 0), 0);
    const totalStockValue = rows.reduce((s, r) => s + r.stockValue, 0);
    return {
      ...payload.summary,
      withCost,
      withoutCost: rows.length - withCost,
      totalRealProfit: Math.round(totalRealProfit * 100) / 100,
      totalStockValue: Math.round(totalStockValue * 100) / 100,
    };
  }, [payload, rows]);

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

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === rows.length) return new Set();
      return new Set(rows.map((r) => r.itemId));
    });
  }, [rows]);

  const toggleOne = (itemId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  // Override "representativo" exibido no card: quando 1 selecionado, mostra o dele;
  // em lote, mostra um override comum vazio (cada alteração é aplicada a todos).
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const cardValue: ListingOverrides = useMemo(() => {
    if (selectedIds.length === 1) return overrides[selectedIds[0]] ?? {};
    return {};
  }, [selectedIds, overrides]);

  // Aplica um patch de override a todos os anúncios selecionados.
  const applyPatch = useCallback(
    (patch: ListingOverrides) => {
      setOverrides((prev) => {
        const next = { ...prev };
        for (const id of selectedIds) {
          next[id] = { ...(next[id] ?? {}), ...patch };
        }
        return next;
      });
    },
    [selectedIds],
  );

  // Limpa os overrides dos selecionados.
  const clearSelected = useCallback(() => {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) delete next[id];
      return next;
    });
  }, [selectedIds]);

  const closeCard = useCallback(() => setSelected(new Set()), []);

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
      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Anúncios ativos" value={formatNumber(summary.totalActive)} />
          <KpiCard
            label="Com custo"
            value={formatNumber(summary.withCost)}
            hint={summary.withoutCost > 0 ? `${summary.withoutCost} sem custo` : "todos com custo"}
          />
          <KpiCard label="Lucro real total" value={formatBRL(summary.totalRealProfit)} />
          <KpiCard label="Valor em estoque" value={formatBRL(summary.totalStockValue)} />
        </div>
      )}

      {/* Progresso da coleta de visitas (1 item/req no ML — enche aos poucos). */}
      {payload &&
        typeof payload.summary.visitsResolved === "number" &&
        typeof payload.summary.visitsAttempted === "number" &&
        payload.summary.visitsResolved < payload.summary.visitsAttempted && (
          <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-700">
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
            <span>
              Coletando visitas no Mercado Livre: {payload.summary.visitsResolved} de{" "}
              {payload.summary.visitsAttempted} anúncios já atualizados. O ML responde 1 anúncio por
              vez, então os números completam aos poucos — clique em Atualizar em alguns segundos.
            </span>
          </div>
        )}

      {/* Avisos */}
      {payload && !payload.summary.baselinkerConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            BaseLinker não configurado: sem o custo dos produtos não é possível calcular o lucro
            real nem os preços-alvo. Configure em Lucratividade para habilitar.
          </span>
        </div>
      )}

      {payload?.stale && (
        <div className="rounded-lg border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
          Mostrando os últimos dados carregados (o Mercado Livre limitou as consultas há instantes).
        </div>
      )}

      {/* Cold start falhou (típico ML 429): aviso honesto + retomar, sem zerar nada. */}
      {coldError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
          <RefreshCw className="h-4 w-4 shrink-0" />
          <span>
            {coldErrorMessage}{" "}
            <button className="underline font-medium" onClick={() => refetch()}>
              Tentar novamente
            </button>
          </span>
        </div>
      )}

      {/* Preparando: a montagem (anúncios + custos) roda em background no 1º acesso. */}
      {preparing && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-700">
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
          <span>
            Preparando seus anúncios ativos — buscando preços, custos e peso no Mercado Livre e na
            BaseLinker. Isso pode levar alguns segundos no primeiro acesso e a tela atualiza sozinha.
          </span>
        </div>
      )}

      {/* Controles */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
        {/* Imposto agregado (default global) */}
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

      {/* Card de recalibragem (aparece com seleção) */}
      {selected.size > 0 && (
        <RecalibrarCard
          selectedCount={selected.size}
          value={cardValue}
          onChange={applyPatch}
          onClear={clearSelected}
          onClose={closeCard}
        />
      )}

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-3 py-2">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Selecionar todos"
                />
              </th>
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
            {(isLoading || preparing) &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-4" />
                  </td>
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

            {!isLoading && !preparing &&
              rows.map((row) => {
                const isSel = selected.has(row.itemId);
                const adjusted = overrides[row.itemId] != null;
                return (
                  <tr
                    key={row.itemId}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 ${isSel ? "bg-sky-500/[0.04]" : ""}`}
                  >
                    <td className="px-3 py-2 align-middle">
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={() => toggleOne(row.itemId)}
                        aria-label="Selecionar anúncio"
                      />
                    </td>
                    {cols.map((c) => (
                      <td key={c.key} className="px-3 py-2 align-middle">
                        {renderCell(c.key, row, adjusted)}
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
                );
              })}
          </tbody>
        </table>

        {!isLoading && !preparing && payload && rows.length === 0 && (
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
