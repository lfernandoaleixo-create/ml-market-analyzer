import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  PageShell,
  PageHeader,
  KpiSkeletonRow,
  SectionCard,
  NotConnected,
  ErrorState,
} from "@/components/account/AccountUI";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatBRL, formatNumber, formatDateTime } from "@/lib/format";
import { exportTaxConfigPdf } from "@/lib/taxConfigPdf";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePeriod } from "@/hooks/usePeriod";
import { PeriodSelector } from "@/components/PeriodSelector";
import { ProfitFlow } from "@/components/finance/ProfitFlow";
import { TaxBreakdownCard } from "@/components/finance/TaxBreakdownCard";
import { toast } from "sonner";
import type { ProfitBreakdown, TaxConfig, TaxDetailTotals, UF } from "@shared/finance";
import {
  Wallet,
  Coins,
  Receipt,
  TrendingUp,
  Sparkles,
  Truck,
  Package,
  Megaphone,
  Clock,
  Info,
  MapPin,
  Settings2,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  ChevronRight,
  ListFilter,
  PackageSearch,
  FileDown,
  History,
} from "lucide-react";
import type { ListingProfitRow } from "@shared/finance";
import type { ListingRow, ListingStatus } from "@shared/account";

/** Human label + color classes for each ML listing status. */
const LISTING_STATUS_META: Record<ListingStatus, { label: string; cls: string }> = {
  active: { label: "Ativo", cls: "bg-emerald-500/12 text-emerald-700 border-emerald-500/20" },
  paused: { label: "Pausado", cls: "bg-amber-500/12 text-amber-700 border-amber-500/25" },
  closed: { label: "Encerrado", cls: "bg-rose-500/12 text-rose-700 border-rose-500/20" },
  under_review: { label: "Em revisão", cls: "bg-blue-500/12 text-blue-700 border-blue-500/20" },
  inactive: { label: "Inativo", cls: "bg-muted text-muted-foreground border-border" },
};

function StatusBadge({ status }: { status: ListingStatus }) {
  const meta = LISTING_STATUS_META[status] ?? LISTING_STATUS_META.inactive;
  return (
    <Badge variant="outline" className={cn("shrink-0 border text-[10px]", meta.cls)}>
      {meta.label}
    </Badge>
  );
}

function pct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function marginColor(margin: number | null): string {
  if (margin == null) return "text-muted-foreground";
  if (margin >= 0.15) return "text-emerald-600";
  if (margin >= 0.05) return "text-amber-600";
  if (margin >= 0) return "text-orange-600";
  return "text-rose-600";
}

/** A single row in the cost cascade (how revenue turns into profit). */
function CascadeRow({
  icon: Icon,
  label,
  amount,
  tone,
  isResult,
  hint,
}: {
  icon: typeof Coins;
  label: string;
  amount: number;
  tone: "revenue" | "cost" | "profit";
  isResult?: boolean;
  hint?: string;
}) {
  const sign = tone === "cost" ? "−" : "";
  const color =
    tone === "revenue"
      ? "text-foreground"
      : tone === "cost"
        ? "text-rose-600"
        : amount >= 0
          ? "text-emerald-600"
          : "text-rose-600";
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-2.5",
        isResult ? "border-t pt-3 mt-1" : "border-b border-dashed",
      )}
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            tone === "revenue"
              ? "bg-blue-500/10 text-blue-600"
              : tone === "cost"
                ? "bg-rose-500/10 text-rose-600"
                : "bg-emerald-500/10 text-emerald-600",
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <p className={cn("truncate text-sm", isResult && "font-semibold")}>{label}</p>
          {hint && <p className="text-[11px] text-muted-foreground truncate">{hint}</p>}
        </div>
      </div>
      <p className={cn("tabular-nums whitespace-nowrap font-display", isResult ? "text-lg" : "text-sm", color)}>
        {sign}
        {formatBRL(Math.abs(amount))}
      </p>
    </div>
  );
}

function Cascade({ p }: { p: ProfitBreakdown }) {
  return (
    <div>
      <CascadeRow icon={Wallet} label="Receita das vendas" amount={p.revenue} tone="revenue" />
      <CascadeRow icon={Coins} label="Comissão Mercado Livre" amount={p.commission} tone="cost" />
      <CascadeRow icon={Truck} label="Frete pago pelo vendedor" amount={p.shipping} tone="cost" />
      <CascadeRow icon={Package} label="Custo dos produtos (CMV)" amount={p.cmv} tone="cost" />
      <CascadeRow icon={Receipt} label="Impostos (estimativa)" amount={p.tax} tone="cost" />
      {p.ads > 0 && <CascadeRow icon={Megaphone} label="Investimento em Ads" amount={p.ads} tone="cost" />}
      <CascadeRow
        icon={TrendingUp}
        label="Lucro líquido"
        amount={p.netProfit}
        tone="profit"
        isResult
        hint={`Margem ${pct(p.margin)}`}
      />
    </div>
  );
}

/** Editable tax-config panel. Self-contained: hydrates from query, saves on demand. */
function ConfigPanel({
  config,
  ufList,
  inventoryId,
  taxDetail,
  periodLabel,
  onSaved,
}: {
  config: TaxConfig;
  ufList: UF[];
  inventoryId: number | null;
  taxDetail?: TaxDetailTotals | null;
  periodLabel?: string | null;
  onSaved: () => void;
}) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const [draft, setDraft] = useState<TaxConfig>(config);
  const inventories = trpc.finance.inventories.useQuery(undefined, { staleTime: 5 * 60_000 });
  const [invId, setInvId] = useState<number | null>(inventoryId);
  const [note, setNote] = useState("");
  const history = trpc.finance.configHistory.useQuery({ limit: 20 }, { staleTime: 30_000 });

  const save = trpc.finance.saveConfig.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.finance.profitability.invalidate(),
        utils.finance.getConfig.invalidate(),
        utils.finance.status.invalidate(),
        utils.finance.configHistory.invalidate(),
      ]);
      setNote("");
      toast.success("Configuração salva.");
      onSaved();
    },
    onError: (e) => toast.error(e.message || "Falha ao salvar."),
  });

  /** Resolve the selected catalog name (for the PDF header). */
  function selectedInventoryName(): string | null {
    const list = inventories.data ?? [];
    const found = list.find((inv) => inv.inventoryId === invId);
    return found?.name ?? null;
  }

  function handleExportPdf() {
    const ok = exportTaxConfigPdf({
      config: draft,
      ufList,
      inventoryName: selectedInventoryName(),
      note: note.trim() || null,
      storeName: user?.name ?? null,
      taxDetail: taxDetail ?? null,
      periodLabel: periodLabel ?? null,
    });
    if (!ok) {
      toast.error(
        "O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente novamente.",
      );
    }
  }

  function setNum(key: keyof TaxConfig, v: string) {
    const n = Number(v.replace(",", "."));
    setDraft((d) => ({ ...d, [key]: Number.isFinite(n) ? n : 0 }));
  }
  function setUF(uf: UF, v: string) {
    const n = Number(v.replace(",", "."));
    setDraft((d) => ({
      ...d,
      icmsInternalByUF: { ...d.icmsInternalByUF, [uf]: Number.isFinite(n) ? n : 0 },
    }));
  }

  const federalSum = draft.pis + draft.cofins + draft.irpjEffective + draft.csllEffective;

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-blue-500/5 border border-blue-500/15 p-3 flex gap-2.5">
        <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Estes valores são uma <strong>estimativa gerencial</strong> para te ajudar a precificar e
          decidir. A apuração e o recolhimento oficial dos tributos continuam sendo
          responsabilidade do seu contador. Todos os campos são editáveis.
        </p>
      </div>

      {/* Catalog selector */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Catálogo do BaseLinker (origem dos custos)
        </Label>
        <Select
          value={invId != null ? String(invId) : undefined}
          onValueChange={(v) => setInvId(Number(v))}
        >
          <SelectTrigger className="max-w-md">
            <SelectValue placeholder={inventories.isLoading ? "Carregando…" : "Selecione o catálogo"} />
          </SelectTrigger>
          <SelectContent>
            {(inventories.data ?? []).map((inv) => (
              <SelectItem key={inv.inventoryId} value={String(inv.inventoryId)}>
                {inv.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Federal */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Tributos federais (sobre a receita)</h3>
          <Badge variant="secondary" className="tabular-nums">
            Soma: {federalSum.toFixed(2)}%
          </Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <RateField label="PIS" value={draft.pis} onChange={(v) => setNum("pis", v)} />
          <RateField label="COFINS" value={draft.cofins} onChange={(v) => setNum("cofins", v)} />
          <RateField label="IRPJ efetivo" value={draft.irpjEffective} onChange={(v) => setNum("irpjEffective", v)} />
          <RateField label="CSLL efetiva" value={draft.csllEffective} onChange={(v) => setNum("csllEffective", v)} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Lucro Presumido: IRPJ efetivo ≈ 15% × 8% de presunção = 1,2%; CSLL ≈ 9% × 12% = 1,08%.
        </p>
      </div>

      {/* TTS scenario rates */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">ICMS com o benefício TTS (Minas Gerais)</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <RateField label="ICMS interestadual (TTS)" value={draft.ttsInterstate} onChange={(v) => setNum("ttsInterstate", v)} />
          <RateField label="ICMS dentro de MG (TTS)" value={draft.ttsInternal} onChange={(v) => setNum("ttsInternal", v)} />
          <RateField label="ICMS interno MG (sem TTS)" value={draft.icmsInternalOrigin} onChange={(v) => setNum("icmsInternalOrigin", v)} />
        </div>
      </div>

      {/* DIFAL explainer (Fernando's request) */}
      <div className="rounded-lg border border-violet-500/30 bg-violet-500/[0.05] p-3 space-y-1.5">
        <h3 className="text-sm font-semibold text-violet-700">O que é o DIFAL</h3>
        <p className="text-[12px] leading-snug text-muted-foreground">
          Nas vendas <strong>interestaduais ao consumidor final</strong>, o ICMS se divide em duas partes:
          a <strong>alíquota interestadual de saída</strong> (12% para Sul/Sudeste, exceto ES; 7% para os
          demais estados), que fica no estado de origem, e o <strong>DIFAL</strong> (diferencial de alíquota),
          que é a diferença até a alíquota interna do estado de destino e é pago a esse estado.
        </p>
        <p className="text-[12px] leading-snug text-muted-foreground">
          Exemplo: venda para SP (alíquota interna 18%). Saída interestadual = 12% → <strong>DIFAL = 6%</strong>.
          Venda para a Bahia (interna 20,5%). Saída = 7% → <strong>DIFAL = 13,5%</strong>. A soma sempre
          equivale à alíquota interna do destino, e na tela mostramos cada parte separada.
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground/80">
          Observação: produtos importados podem ter saída interestadual de 4%; se a sua operação for
          majoritariamente importada, avise que ajustamos a alíquota de saída.
        </p>
      </div>

      {/* Per-UF internal ICMS (without TTS) */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">
          ICMS interno por estado de destino <span className="font-normal text-muted-foreground">(cenário sem TTS)</span>
        </h3>
        <p className="text-[11px] text-muted-foreground -mt-1">
          Em venda interestadual ao consumidor final, a carga efetiva de ICMS equivale à alíquota
          interna do estado de destino. O sistema separa automaticamente quanto é ICMS interestadual e
          quanto é DIFAL.
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9 gap-2">
          {ufList.map((uf) => (
            <div key={uf} className="space-y-1">
              <Label className="text-[10px] font-semibold text-muted-foreground">{uf}</Label>
              <Input
                inputMode="decimal"
                value={String(draft.icmsInternalByUF[uf] ?? 0)}
                onChange={(e) => setUF(uf, e.target.value)}
                className="h-8 text-xs tabular-nums px-2"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Observation field — describe what changed (saved to the history). */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Observação (opcional) — o que mudou nesta alteração?
        </Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 500))}
          placeholder="Ex.: Atualizei o ICMS de SP para 18% conforme orientação do contador."
          rows={2}
          className="resize-none text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          A data e a hora são registradas automaticamente a cada salvamento.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          onClick={() =>
            save.mutate({
              config: {
                ttsEnabled: draft.ttsEnabled,
                originUF: draft.originUF,
                pis: draft.pis,
                cofins: draft.cofins,
                irpjEffective: draft.irpjEffective,
                csllEffective: draft.csllEffective,
                icmsInternalOrigin: draft.icmsInternalOrigin,
                icmsInternalByUF: draft.icmsInternalByUF,
                fcpByUF: draft.fcpByUF ?? {},
                ttsInterstate: draft.ttsInterstate,
                ttsInternal: draft.ttsInternal,
              },
              inventoryId: invId,
              note: note.trim() || undefined,
            })
          }
          disabled={save.isPending}
        >
          {save.isPending ? "Salvando…" : "Salvar configuração"}
        </Button>
        <Button
          variant="outline"
          className="bg-background"
          onClick={handleExportPdf}
          disabled={save.isPending}
        >
          <FileDown className="h-4 w-4" />
          Exportar PDF
        </Button>
        <Button variant="outline" className="bg-background" onClick={() => setDraft(config)} disabled={save.isPending}>
          Desfazer
        </Button>
      </div>

      {/* Change history */}
      <div className="space-y-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Histórico de alterações</h3>
        </div>
        {history.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-2/3 rounded-lg" />
          </div>
        ) : (history.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma alteração registrada ainda. Ao salvar, o histórico aparece aqui com a data.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {(history.data ?? []).map((h) => (
              <li
                key={h.id}
                className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium tabular-nums">
                    {formatDateTime(new Date(h.createdAt).getTime())}
                  </p>
                  {h.note ? (
                    <p className="text-[11px] text-muted-foreground break-words">{h.note}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/70 italic">Sem observação</p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 text-[10px] border",
                    h.ttsEnabled
                      ? "bg-emerald-500/12 text-emerald-700 border-emerald-500/20"
                      : "bg-amber-500/12 text-amber-700 border-amber-500/25",
                  )}
                >
                  {h.ttsEnabled ? "Com TTS" : "Sem TTS"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RateField({ label, value, onChange }: { label: string; value: number; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          inputMode="decimal"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 tabular-nums pr-7"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
      </div>
    </div>
  );
}

export default function Lucratividade() {
  const [showConfig, setShowConfig] = useState(false);
  // Listing detail dialog (per-ad profit breakdown) + "loss only" filter.
  const [selectedListing, setSelectedListing] = useState<ListingProfitRow | null>(null);
  const [onlyLoss, setOnlyLoss] = useState(false);

  // Connection to ML (for the same "connect first" gate as the other pages).
  const connection = trpc.account.connection.useQuery(undefined, { staleTime: 60_000 });
  const status = trpc.finance.status.useQuery(undefined, { staleTime: 30_000 });
  const lifetime = trpc.account.storeLifetime.useQuery(undefined, {
    enabled: connection.data?.connected === true,
  });

  // Unified period selector (system-wide standard). The finance backend works on
  // a rolling-day window, so we feed it the equivalent day count for the active
  // selection (historic -> days since the first sale, etc.).
  const period = usePeriod({
    initialKey: "current",
    firstSaleMs: lifetime.data?.firstSaleMs ?? null,
  });
  const days = period.days;
  const profitInput = useMemo(() => ({ days }), [days]);

  const profit = trpc.finance.profitability.useQuery(profitInput, {
    enabled: !!status.data?.baselinkerConfigured,
    staleTime: 2 * 60_000,
    retry: false,
  });
  const cfg = trpc.finance.getConfig.useQuery(undefined, {
    enabled: !!status.data?.baselinkerConfigured,
    staleTime: 60_000,
  });

  // Current listing status/price (matched by itemId) so the profit dialog and
  // the "Todos os anúncios" card can show whether an ad is active/paused/closed.
  const listingsQuery = trpc.account.listings.useQuery(
    { lastDays: 30 },
    { enabled: connection.data?.connected === true, staleTime: 5 * 60_000, retry: false },
  );
  const listingMetaById = useMemo(() => {
    const map = new Map<string, ListingRow>();
    for (const it of listingsQuery.data?.items ?? []) map.set(it.itemId, it);
    return map;
  }, [listingsQuery.data]);

  const utils = trpc.useUtils();
  const toggleTts = trpc.finance.toggleTts.useMutation({
    onMutate: async ({ enabled }) => {
      await utils.finance.profitability.cancel();
      const prev = utils.finance.profitability.getData(profitInput);
      // Optimistic: swap the displayed totals to the other scenario instantly.
      if (prev) {
        const totals = enabled ? prev.comparison.comTts : prev.comparison.semTts;
        utils.finance.profitability.setData(profitInput, {
          ...prev,
          scenario: enabled ? "com_tts" : "sem_tts",
          totals,
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.finance.profitability.setData(profitInput, ctx.prev);
      toast.error("Não foi possível alternar o cenário.");
    },
    onSettled: () => {
      utils.finance.profitability.invalidate();
      utils.finance.status.invalidate();
      utils.finance.getConfig.invalidate();
    },
  });

  // --- Gates -----------------------------------------------------------------
  if (connection.isLoading || status.isLoading) {
    return (
      <PageShell>
        <PageHeader title="Lucratividade Real" subtitle="Carregando…" />
        <KpiSkeletonRow count={4} />
      </PageShell>
    );
  }
  if (connection.data && connection.data.connected !== true) {
    return (
      <PageShell>
        <NotConnected />
      </PageShell>
    );
  }
  if (status.data && !status.data.baselinkerConfigured) {
    return (
      <PageShell>
        <PageHeader title="Lucratividade Real" />
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="card-soft border-0 rounded-2xl max-w-md w-full p-8 text-center space-y-3 bg-card">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
              <Info className="h-6 w-6" />
            </div>
            <h2 className="font-display text-lg tracking-tight">Conecte o BaseLinker</h2>
            <p className="text-sm text-muted-foreground">
              O cálculo de lucro real usa o custo dos produtos e os pedidos do seu BaseLinker.
              O token ainda não está configurado neste ambiente.
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  const ttsOn = status.data?.ttsEnabled ?? false;
  const data = profit.data;
  const comp = data?.comparison;

  return (
    <PageShell>
      <PageHeader
        title="Lucratividade Real"
        subtitle="Lucro líquido por venda e por anúncio — receita menos comissão, frete, custo do produto, impostos e Ads."
        actions={
          <Button
            variant="outline"
            className="bg-background"
            onClick={() => setShowConfig((v) => !v)}
          >
            <Settings2 className="h-4 w-4" />
            Configurar
          </Button>
        }
      />

      {/* Unified period selector (system-wide standard). */}
      <PeriodSelector
        value={period.key}
        onChange={period.setKey}
        fromIso={period.fromIso}
        toIso={period.toIso}
        onFromIso={period.setFromIso}
        onToIso={period.setToIso}
        title={period.title}
      />

      {/* Config panel (collapsible). Rendered OUTSIDE the profit data branch so
          the "Configurar" button always opens it — even while the profit query
          is loading, empty, or errored (BaseLinker slow/limited). */}
      {showConfig && (
        <SectionCard title="Configuração de impostos" description="Ajuste as alíquotas. Tudo editável.">
          {cfg.isError ? (
            <ErrorState
              message={cfg.error?.message ?? "Não foi possível carregar a configuração."}
              onRetry={() => cfg.refetch()}
              retrying={cfg.isFetching}
            />
          ) : cfg.isLoading || !cfg.data ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-2/3 rounded-xl" />
            </div>
          ) : (
            <ConfigPanel
              config={cfg.data.config}
              ufList={cfg.data.ufList}
              inventoryId={cfg.data.inventoryId}
              taxDetail={profit.data?.taxDetail ?? null}
              periodLabel={period.title}
              onSaved={() => setShowConfig(false)}
            />
          )}
        </SectionCard>
      )}

      {/* TTS hero toggle */}
      <div
        className={cn(
          "rounded-2xl border p-4 md:p-5 transition-colors",
          ttsOn
            ? "border-emerald-500/30 bg-emerald-500/[0.06]"
            : "border-amber-500/25 bg-amber-500/[0.05]",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                ttsOn ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600",
              )}
            >
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base tracking-tight">Benefício TTS — Minas Gerais</h2>
                <Badge
                  className={cn(
                    "border",
                    ttsOn
                      ? "bg-emerald-500/12 text-emerald-700 border-emerald-500/20"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {ttsOn ? "Ativado" : "Desativado"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground max-w-xl mt-0.5 leading-relaxed">
                Quando você conseguir o TTS, ligue aqui para ver o lucro com a carga de ICMS
                reduzida. Os números do painel passam a refletir o cenário escolhido.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {comp && (
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Ganho potencial no período
                </p>
                <p className="font-display text-lg text-emerald-600 tabular-nums">
                  + {formatBRL(comp.ttsGain)}
                </p>
              </div>
            )}
            <Switch
              checked={ttsOn}
              disabled={toggleTts.isPending}
              onCheckedChange={(v) => toggleTts.mutate({ enabled: v })}
              aria-label="Ativar TTS"
            />
          </div>
        </div>
      </div>

      {/* Error / loading for the data itself */}
      {profit.isError ? (
        <ErrorState
          message={profit.error?.message}
          onRetry={() => profit.refetch()}
          retrying={profit.isFetching}
        />
      ) : profit.isLoading || !data ? (
        <>
          <KpiSkeletonRow count={4} />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </>
      ) : (
        <>
          {/* Stale indicator */}
          {data.stale && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Clock className="h-3.5 w-3.5" />
              Dados em cache{data.asOf ? ` · de ${new Date(data.asOf).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}.
              O BaseLinker está congestionado; mostrando o último resultado bom.
            </div>
          )}

          {/* Effective-sales filter notice */}
          {(data.excludedCount ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-blue-300/50 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-blue-600" />
              <span>
                Contando apenas <strong>vendas efetivadas</strong>:{" "}
                <strong>{formatNumber(data.orderCount)}</strong> de{" "}
                {formatNumber(data.totalOrdersSeen ?? data.orderCount)} pedidos.{" "}
                <strong>{formatNumber(data.excludedCount ?? 0)}</strong> excluídos
                {data.excludedByStatus && Object.keys(data.excludedByStatus).length > 0
                  ? ` (${Object.entries(data.excludedByStatus)
                      .map(([k, v]) => `${v} ${k.toLowerCase()}`)
                      .join(", ")})`
                  : ""}
                . Cancelamentos e devoluções não entram no lucro.
              </span>
            </div>
          )}

          {/* Top flow: Revenue → each cost (with % of revenue) → Result */}
          <SectionCard
            title="Da receita ao resultado"
            description={`${formatNumber(data.orderCount)} vendas efetivadas · cada gasto mostra quanto representa da receita · cenário ${ttsOn ? "com TTS" : "sem TTS"}.`}
          >
            <ProfitFlow p={data.totals} />
          </SectionCard>

          {/* Tax breakdown of the period: ICMS vs DIFAL vs FCP (Fernando's request) */}
          <SectionCard
            title="Impostos do período: ICMS x DIFAL"
            description="Quanto do imposto foi ICMS, quanto foi DIFAL (diferencial pago ao estado de destino) e quanto foi FCP."
          >
            <TaxBreakdownCard detail={data.taxDetail} withTts={ttsOn} />
          </SectionCard>

          {/* Cascade + scenario comparison */}
          <div className="grid grid-cols-1 gap-6">
            <SectionCard
              title="Comparativo de cenários"
              description="Mesmo período, com e sem o benefício TTS."
            >
              {comp && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <ScenarioMini
                      title="Sem TTS"
                      p={comp.semTts}
                      active={!ttsOn}
                    />
                    <ScenarioMini
                      title="Com TTS"
                      p={comp.comTts}
                      active={ttsOn}
                      highlight
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-emerald-500/[0.07] border border-emerald-500/15 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      Lucro adicional com o TTS
                    </div>
                    <span className="font-display text-lg text-emerald-600 tabular-nums">
                      + {formatBRL(comp.ttsGain)}
                    </span>
                  </div>
                </div>
              )}
            </SectionCard>
          </div>

          {/* Margin history (daily snapshots) */}
          <MarginHistory />

          {/* Profit by listing */}
          {(() => {
            const lossCount = data.listings.filter((r) => r.current.netProfit < 0).length;
            const visibleListings = onlyLoss
              ? data.listings.filter((r) => r.current.netProfit < 0)
              : data.listings;
            return (
          <SectionCard
            title="Lucro por anúncio"
            description="Clique em um anúncio para ver a quebra completa do lucro. Inclui Ads quando houver."
            actions={
              lossCount > 0 ? (
                <Button
                  variant={onlyLoss ? "default" : "outline"}
                  size="sm"
                  className={cn(!onlyLoss && "bg-background")}
                  onClick={() => setOnlyLoss((v) => !v)}
                >
                  <AlertTriangle className="h-4 w-4" />
                  {onlyLoss ? "Mostrando só prejuízo" : `Só prejuízo (${lossCount})`}
                </Button>
              ) : undefined
            }
          >
            {data.listings.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma venda com anúncio identificável no período.
              </p>
            ) : visibleListings.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum anúncio em prejuízo no período. 🎉
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2.5 pr-3 font-semibold">Anúncio</th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Un.</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Receita</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Custo unit.</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Impostos</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Lucro</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Margem</th>
                      <th className="py-2.5 pl-3 font-semibold text-right w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleListings.map((row) => {
                      const isLoss = row.current.netProfit < 0;
                      return (
                      <tr
                        key={row.itemId}
                        onClick={() => setSelectedListing(row)}
                        className={cn(
                          "group cursor-pointer border-b border-dashed last:border-0 transition-colors",
                          isLoss ? "bg-rose-500/[0.04] hover:bg-rose-500/[0.09]" : "hover:bg-muted/50",
                        )}
                      >
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {isLoss && (
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/12 text-rose-600" title="Anúncio no prejuízo">
                                <AlertTriangle className="h-3 w-3" />
                              </span>
                            )}
                            <span className="truncate max-w-[300px]" title={row.title}>
                              {row.title}
                            </span>
                            <a
                              href={`https://www.mercadolivre.com.br/p/${row.itemId}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-muted-foreground hover:text-primary shrink-0"
                              title="Abrir no Mercado Livre"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            {row.missingCost && (
                              <Badge variant="outline" className="shrink-0 text-[10px] text-amber-700 border-amber-300/60">
                                custo faltando
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {listingMetaById.get(row.itemId) ? (
                            <StatusBadge status={listingMetaById.get(row.itemId)!.status} />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{formatNumber(row.unitsSold)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{formatBRL(row.current.revenue)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                          {row.unitCost != null ? formatBRL(row.unitCost) : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                          {formatBRL(row.current.tax)}
                        </td>
                        <td className={cn("py-2.5 px-3 text-right tabular-nums font-semibold", isLoss ? "text-rose-600" : "text-emerald-600")}>
                          {formatBRL(row.current.netProfit)}
                        </td>
                        <td className={cn("py-2.5 px-3 text-right tabular-nums", marginColor(row.current.margin))}>
                          {pct(row.current.margin)}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
            );
          })()}

          {/* By UF */}
          <SectionCard
            title="Vendas por estado de destino"
            description="O imposto (ICMS/DIFAL) varia conforme o destino — por isso o estado importa."
          >
            {data.byUF.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem dados de destino no período.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {data.byUF.map((u) => (
                  <div key={u.uf} className="rounded-xl border bg-card p-3" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {u.uf === "??" ? "Não informado" : u.uf}
                    </div>
                    <p className="mt-1 font-display tabular-nums">{formatBRL(u.revenue)}</p>
                    <p className="text-[11px] text-muted-foreground">{formatNumber(u.orders)} pedidos</p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Missing-cost note */}
          {data.productsMissingCost > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Info className="h-3.5 w-3.5" />
              {data.productsMissingCost} produto(s) sem custo cadastrado no BaseLinker — o CMV deles
              entrou como zero, então o lucro pode estar superestimado nesses casos.
            </div>
          )}

          {/* Collapsible "all listings" card with its OWN period + status filter */}
          <AllListingsCard
            firstSaleMs={lifetime.data?.firstSaleMs ?? null}
            baselinkerConfigured={!!status.data?.baselinkerConfigured}
            connected={connection.data?.connected === true}
            listingMetaById={listingMetaById}
            onOpenListing={setSelectedListing}
          />

          {/* Per-listing profit detail dialog */}
          <ListingDetailDialog
            listing={selectedListing}
            ttsOn={ttsOn}
            meta={selectedListing ? listingMetaById.get(selectedListing.itemId) : undefined}
            onOpenChange={(open) => !open && setSelectedListing(null)}
          />

        </>
      )}
    </PageShell>
  );
}

function ScenarioMini({
  title,
  p,
  active,
  highlight,
}: {
  title: string;
  p: ProfitBreakdown;
  active?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5 transition-colors",
        active
          ? highlight
            ? "border-emerald-500/40 bg-emerald-500/[0.07]"
            : "border-primary/40 bg-primary/[0.05]"
          : "border-border bg-card",
      )}
      style={!active ? { borderColor: "var(--border)" } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        {active && (
          <Badge variant="secondary" className="text-[10px]">
            Atual
          </Badge>
        )}
      </div>
      <p
        className={cn(
          "mt-1.5 font-display text-xl tabular-nums",
          p.netProfit >= 0 ? "text-emerald-600" : "text-rose-600",
        )}
      >
        {formatBRL(p.netProfit)}
      </p>
      <p className="text-[11px] text-muted-foreground">
        Margem {pct(p.margin)} · imposto {formatBRL(p.tax)}
      </p>
    </div>
  );
}

/**
 * Daily margin history fed by the Heartbeat snapshots. Renders a compact,
 * dependency-free SVG line chart comparing net profit (sem TTS x com TTS) over
 * the captured days. Hidden until at least two data points exist.
 */
function MarginHistory() {
  const history = trpc.finance.history.useQuery(
    { days: 60 },
    { staleTime: 5 * 60_000, retry: false },
  );
  const points = history.data ?? [];

  if (history.isLoading) {
    return <Skeleton className="h-56 w-full rounded-2xl" />;
  }
  if (points.length < 2) {
    return (
      <SectionCard
        title="Evolução da margem"
        description="Histórico diário de lucro, capturado automaticamente todos os dias."
      >
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <TrendingUp className="h-5 w-5" />
          </div>
          <p className="text-sm text-muted-foreground max-w-sm">
            O histórico começa a aparecer assim que houver pelo menos dois dias de
            captura. O robô diário registra automaticamente o lucro de cada dia.
          </p>
        </div>
      </SectionCard>
    );
  }

  const W = 720;
  const H = 200;
  const PAD = { top: 16, right: 16, bottom: 28, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = points.flatMap((p) => [p.netProfitSemTts, p.netProfitComTts]);
  const minV = Math.min(0, ...values);
  const maxV = Math.max(0, ...values);
  const span = maxV - minV || 1;

  const x = (i: number) =>
    PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - minV) / span) * innerH;

  const line = (key: "netProfitSemTts" | "netProfitComTts") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");

  const zeroY = y(0);
  const last = points[points.length - 1];

  return (
    <SectionCard
      title="Evolução da margem"
      description="Lucro líquido por dia — comparando os dois cenários. Capturado automaticamente."
    >
      <div className="flex flex-wrap items-center gap-4 mb-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" /> Sem TTS
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> Com TTS
        </span>
        <span className="ml-auto text-muted-foreground">
          Último dia: <strong className="text-foreground">{formatBRL(last.netProfitComTts)}</strong> (com TTS)
        </span>
      </div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }} role="img" aria-label="Histórico de lucro diário">
          {/* zero baseline */}
          <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY} stroke="var(--border)" strokeDasharray="3 3" />
          {/* y labels */}
          <text x={8} y={y(maxV) + 4} className="fill-muted-foreground" style={{ fontSize: 10 }}>
            {formatBRL(maxV)}
          </text>
          <text x={8} y={zeroY + 4} className="fill-muted-foreground" style={{ fontSize: 10 }}>
            R$ 0
          </text>
          {/* lines */}
          <path d={line("netProfitSemTts")} fill="none" stroke="#94a3b8" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={line("netProfitComTts")} fill="none" stroke="#10b981" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
          {/* last-point dots */}
          <circle cx={x(points.length - 1)} cy={y(last.netProfitSemTts)} r={3} fill="#94a3b8" />
          <circle cx={x(points.length - 1)} cy={y(last.netProfitComTts)} r={3.4} fill="#10b981" />
          {/* x labels: first & last */}
          <text x={PAD.left} y={H - 8} className="fill-muted-foreground" style={{ fontSize: 10 }}>
            {fmtDay(points[0].date)}
          </text>
          <text x={W - PAD.right} y={H - 8} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>
            {fmtDay(last.date)}
          </text>
        </svg>
      </div>
    </SectionCard>
  );
}

/** YYYY-MM-DD -> DD/MM */
function fmtDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return d && m ? `${d}/${m}` : iso;
}

type StatusFilter = "all" | ListingStatus;

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "active", label: "Ativos" },
  { value: "paused", label: "Pausados" },
  { value: "closed", label: "Encerrados" },
  { value: "under_review", label: "Em revisão" },
  { value: "inactive", label: "Inativos" },
];

/**
 * Collapsible "Todos os anúncios" card with its OWN independent period selector
 * (defaulting to the historic base) and a status filter. It merges the profit
 * per listing (for the chosen period) with the current listing status/price so
 * paused/closed ads that still had sales are clearly surfaced.
 */
function AllListingsCard({
  firstSaleMs,
  baselinkerConfigured,
  connected,
  listingMetaById,
  onOpenListing,
}: {
  firstSaleMs: number | null;
  baselinkerConfigured: boolean;
  connected: boolean;
  listingMetaById: Map<string, ListingRow>;
  onOpenListing: (row: ListingProfitRow) => void;
}) {
  // Independent period selector — starts on the historic base by request.
  const period = usePeriod({ initialKey: "historic", firstSaleMs });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const allInput = useMemo(() => ({ days: period.days }), [period.days]);
  // Query is cached/deduped by tRPC; it shares the cache key with the main card
  // when the day count matches, so this rarely costs an extra round-trip.
  const profit = trpc.finance.profitability.useQuery(allInput, {
    enabled: baselinkerConfigured && connected,
    staleTime: 2 * 60_000,
    retry: false,
  });

  const rows = useMemo(() => {
    const list = profit.data?.listings ?? [];
    if (statusFilter === "all") return list;
    return list.filter((r) => {
      const meta = listingMetaById.get(r.itemId);
      // Unknown status only matches "all".
      return meta?.status === statusFilter;
    });
  }, [profit.data, statusFilter, listingMetaById]);

  const counts = useMemo(() => {
    const list = profit.data?.listings ?? [];
    const c: Record<string, number> = {};
    for (const r of list) {
      const s = listingMetaById.get(r.itemId)?.status ?? "unknown";
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [profit.data, listingMetaById]);

  return (
    <SectionCard
      collapsible
      defaultOpen={false}
      title="Todos os anúncios (filtro independente)"
      description="Período e status próprios deste card. Inclui anúncios pausados/encerrados que tiveram vendas no período."
      actions={
        <Badge variant="outline" className="bg-background text-[10px]">
          <PackageSearch className="mr-1 h-3 w-3" />
          {profit.data ? `${formatNumber(profit.data.listings.length)} anúncios` : "abrir"}
        </Badge>
      }
    >
      {/* Controls: independent period + status filter */}
      <div className="space-y-3">
        <PeriodSelector
          value={period.key}
          onChange={period.setKey}
          fromIso={period.fromIso}
          toIso={period.toIso}
          onFromIso={period.setFromIso}
          onToIso={period.setToIso}
          title={period.title}
        />
        <div className="flex flex-wrap items-center gap-2">
          <ListFilter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-9 w-[200px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                  {opt.value !== "all" && counts[opt.value]
                    ? ` (${counts[opt.value]})`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Body */}
      <div className="mt-4">
        {profit.isError ? (
          <ErrorState
            message={profit.error?.message}
            onRetry={() => profit.refetch()}
            retrying={profit.isFetching}
          />
        ) : profit.isLoading || !profit.data ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum anúncio para este período e status.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2.5 pr-3 font-semibold">Anúncio</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Un.</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Preço un.</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Receita</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Lucro</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Margem</th>
                  <th className="py-2.5 pl-3 font-semibold text-right w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const meta = listingMetaById.get(row.itemId);
                  const isLoss = row.current.netProfit < 0;
                  const unitPrice =
                    row.unitsSold > 0 ? row.current.revenue / row.unitsSold : null;
                  return (
                    <tr
                      key={row.itemId}
                      onClick={() => onOpenListing(row)}
                      className={cn(
                        "group cursor-pointer border-b border-dashed last:border-0 transition-colors",
                        isLoss ? "bg-rose-500/[0.04] hover:bg-rose-500/[0.09]" : "hover:bg-muted/50",
                      )}
                    >
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {isLoss && (
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/12 text-rose-600" title="Anúncio no prejuízo">
                              <AlertTriangle className="h-3 w-3" />
                            </span>
                          )}
                          <span className="truncate max-w-[260px]" title={row.title}>
                            {row.title}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        {meta ? <StatusBadge status={meta.status} /> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{formatNumber(row.unitsSold)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                        {unitPrice != null ? formatBRL(unitPrice) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{formatBRL(row.current.revenue)}</td>
                      <td className={cn("py-2.5 px-3 text-right tabular-nums font-semibold", isLoss ? "text-rose-600" : "text-emerald-600")}>
                        {formatBRL(row.current.netProfit)}
                      </td>
                      <td className={cn("py-2.5 px-3 text-right tabular-nums", marginColor(row.current.margin))}>
                        {pct(row.current.margin)}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

/**
 * Per-listing profit detail. Opens when a row in "Lucro por anúncio" is clicked
 * and shows the full cost cascade for that single ad, calling out a loss clearly.
 */
function ListingDetailDialog({
  listing,
  ttsOn,
  meta,
  onOpenChange,
}: {
  listing: ListingProfitRow | null;
  ttsOn: boolean;
  /** Current listing status/price from account.listings, matched by itemId. */
  meta?: ListingRow;
  onOpenChange: (open: boolean) => void;
}) {
  const p = listing?.current;
  const isLoss = !!p && p.netProfit < 0;
  // Per-unit net profit helps decide if each extra sale makes or loses money.
  const perUnit =
    p && listing && listing.unitsSold > 0 ? p.netProfit / listing.unitsSold : null;
  // Average sale price per unit in the period (revenue / units sold).
  const avgUnitPrice =
    p && listing && listing.unitsSold > 0 ? p.revenue / listing.unitsSold : null;

  return (
    <Dialog open={!!listing} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {listing && p && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-start gap-2 pr-6 text-left leading-snug">
                {isLoss && (
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500/12 text-rose-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="text-base">{listing.title}</span>
                {meta && <StatusBadge status={meta.status} />}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{formatNumber(listing.unitsSold)} unidade(s) vendida(s)</span>
                <span className="text-muted-foreground/50">·</span>
                <span>{formatNumber(listing.orders)} pedido(s)</span>
                <span className="text-muted-foreground/50">·</span>
                <span>Cenário {ttsOn ? "com TTS" : "sem TTS"}</span>
                <a
                  href={`https://www.mercadolivre.com.br/p/${listing.itemId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Abrir no ML <ExternalLink className="h-3 w-3" />
                </a>
              </DialogDescription>
            </DialogHeader>

            {/* Loss / profit verdict banner */}
            <div
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
                isLoss
                  ? "border-rose-500/25 bg-rose-500/[0.06]"
                  : "border-emerald-500/25 bg-emerald-500/[0.06]",
              )}
            >
              <div className="flex items-center gap-2 text-sm">
                {isLoss ? (
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                )}
                <span className="font-medium">
                  {isLoss ? "Este anúncio está no prejuízo" : "Este anúncio dá lucro"}
                </span>
              </div>
              <div className="text-right">
                <p
                  className={cn(
                    "font-display text-lg tabular-nums",
                    isLoss ? "text-rose-600" : "text-emerald-600",
                  )}
                >
                  {formatBRL(p.netProfit)}
                </p>
                <p className="text-[11px] text-muted-foreground">Margem {pct(p.margin)}</p>
              </div>
            </div>

            {/* Full cascade for this single listing */}
            <Cascade p={p} />

            {/* Per-unit + missing-cost footnotes */}
            <div className="space-y-2">
              {avgUnitPrice != null && (
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">
                    Preço de venda por unidade
                    {meta?.price != null && Math.abs(meta.price - avgUnitPrice) > 0.01 ? (
                      <span className="text-muted-foreground/70"> (anúncio hoje: {formatBRL(meta.price)})</span>
                    ) : null}
                  </span>
                  <span className="font-semibold tabular-nums">{formatBRL(avgUnitPrice)}</span>
                </div>
              )}
              {perUnit != null && (
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Lucro por unidade vendida</span>
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      perUnit >= 0 ? "text-emerald-600" : "text-rose-600",
                    )}
                  >
                    {formatBRL(perUnit)}
                  </span>
                </div>
              )}
              {listing.missingCost && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Este anúncio tem produto(s) sem custo cadastrado no BaseLinker — o CMV
                    entrou como zero, então o lucro real pode ser <strong>menor</strong> do que o
                    mostrado.
                  </span>
                </div>
              )}
              {isLoss && !listing.missingCost && (
                <p className="px-1 text-xs text-muted-foreground leading-relaxed">
                  Cada venda deste anúncio diminui seu lucro. Vale revisar o preço, o custo do
                  produto, o frete ou o investimento em Ads para reverter o resultado.
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
