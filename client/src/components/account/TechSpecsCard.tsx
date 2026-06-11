import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { SectionCard, KpiCard } from "@/components/account/AccountUI";
import { ProductCell } from "@/components/account/ProductCell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { TechSpecListing } from "@shared/account";
import {
  Stethoscope,
  CheckCircle2,
  AlertTriangle,
  ListChecks,
  Search as SearchIcon,
  ChevronRight,
  CircleDot,
  Type,
  Hash,
  List as ListIcon,
  ToggleLeft,
  Ruler,
} from "lucide-react";

type FilterMode = "all" | "incomplete" | "required";

const VALUE_TYPE_META: Record<
  TechSpecListing["attributes"][number]["valueType"],
  { label: string; icon: typeof Type }
> = {
  string: { label: "Texto", icon: Type },
  number: { label: "Número", icon: Hash },
  number_unit: { label: "Número + unidade", icon: Ruler },
  list: { label: "Lista", icon: ListIcon },
  boolean: { label: "Sim/Não", icon: ToggleLeft },
};

function completenessColor(c: number): string {
  if (c >= 1) return "bg-emerald-500";
  if (c >= 0.7) return "bg-amber-500";
  return "bg-rose-500";
}

/**
 * Raio-X da Ficha Técnica — read-only diagnosis of every listing's technical
 * sheet (complete vs incomplete, missing attributes and which are required).
 * Mirrors the Seconds "Ficha Técnica" tool using the ML attributes API.
 */
export function TechSpecsCard({ connected }: { connected: boolean }) {
  const { data, isLoading, isFetching } = trpc.account.technicalSpecs.useQuery(
    undefined,
    { enabled: connected, staleTime: 5 * 60 * 1000 },
  );

  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<FilterMode>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const items = useMemo<TechSpecListing[]>(() => data?.items ?? [], [data]);
  const summary = data?.summary;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items;
    if (mode === "incomplete") list = list.filter((i) => !i.complete);
    else if (mode === "required") list = list.filter((i) => i.missingRequired > 0);
    if (q) {
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.itemId.toLowerCase().includes(q),
      );
    }
    // Worst first: most missing-required, then most missing, then lowest completeness.
    return [...list].sort((a, b) => {
      if (b.missingRequired !== a.missingRequired)
        return b.missingRequired - a.missingRequired;
      if (b.missingAttributes !== a.missingAttributes)
        return b.missingAttributes - a.missingAttributes;
      return a.completeness - b.completeness;
    });
  }, [items, search, mode]);

  const selected = useMemo(
    () => (openId ? items.find((i) => i.itemId === openId) ?? null : null),
    [openId, items],
  );

  const completePct =
    summary && summary.total > 0
      ? Math.round((summary.complete / summary.total) * 100)
      : 0;

  return (
    <SectionCard
      title="Raio-X da Ficha Técnica"
      description="Cruzamos os atributos exigidos por cada categoria do Mercado Livre com o que está preenchido no anúncio. Veja onde a ficha está incompleta e o que falta para deixá-la perfeita."
      actions={
        isFetching && !isLoading ? (
          <span className="text-xs text-muted-foreground">Atualizando…</span>
        ) : undefined
      }
    >
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Fichas completas"
          value={isLoading ? "" : `${formatNumber(summary?.complete ?? 0)} / ${formatNumber(summary?.total ?? 0)}`}
          loading={isLoading}
          icon={CheckCircle2}
          accent="emerald"
          sublabel={isLoading ? undefined : `${completePct}% dos anúncios`}
        />
        <KpiCard
          label="Fichas incompletas"
          value={isLoading ? "" : formatNumber(summary?.incomplete ?? 0)}
          loading={isLoading}
          icon={AlertTriangle}
          accent="amber"
          sublabel="com algum atributo faltando"
        />
        <KpiCard
          label="Faltam obrigatórios"
          value={isLoading ? "" : formatNumber(summary?.withMissingRequired ?? 0)}
          loading={isLoading}
          icon={CircleDot}
          accent="rose"
          sublabel="atributos exigidos em falta"
        />
        <KpiCard
          label="Completude média"
          value={isLoading ? "" : `${Math.round((summary?.avgCompleteness ?? 0) * 100)}%`}
          loading={isLoading}
          icon={ListChecks}
          accent="violet"
          sublabel={isLoading ? undefined : `${formatNumber(summary?.totalMissing ?? 0)} atributos a preencher`}
        />
      </div>

      {/* Toolbar */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título ou MLB…"
            className="h-9 bg-card pl-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-secondary p-1">
          {(
            [
              { key: "all", label: "Todos" },
              { key: "incomplete", label: "Incompletos" },
              { key: "required", label: "Faltam obrigatórios" },
            ] as { key: FilterMode; label: string }[]
          ).map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={mode === t.key ? "default" : "ghost"}
              className="h-8 rounded-lg px-3 text-xs"
              onClick={() => setMode(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="mt-4 space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium">
              {mode === "all"
                ? "Nenhum anúncio encontrado."
                : "Nenhum anúncio nesta condição — tudo certo por aqui!"}
            </p>
          </div>
        ) : (
          filtered.map((it) => (
            <button
              key={it.itemId}
              onClick={() => setOpenId(it.itemId)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all",
                "hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              )}
            >
              <div className="min-w-0 flex-1">
                <ProductCell
                  title={it.title}
                  thumbnail={it.thumbnail}
                  permalink={undefined}
                  titleClassName="max-w-full pr-2"
                />
              </div>

              {/* Completeness bar */}
              <div className="hidden w-36 shrink-0 sm:block">
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{it.filledAttributes}/{it.totalAttributes}</span>
                  <span className="tabular-nums">{Math.round(it.completeness * 100)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full transition-all", completenessColor(it.completeness))}
                    style={{ width: `${Math.round(it.completeness * 100)}%` }}
                  />
                </div>
              </div>

              {/* Status badge */}
              <div className="shrink-0">
                {it.complete ? (
                  <Badge className="border-emerald-500/20 bg-emerald-500/12 text-emerald-700">
                    Completa
                  </Badge>
                ) : it.missingRequired > 0 ? (
                  <Badge className="border-rose-500/20 bg-rose-500/12 text-rose-700">
                    {it.missingRequired} obrigatório{it.missingRequired === 1 ? "" : "s"}
                  </Badge>
                ) : (
                  <Badge className="border-amber-500/20 bg-amber-500/12 text-amber-700">
                    Faltam {it.missingAttributes}
                  </Badge>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))
        )}
      </div>

      {summary?.capped && !isLoading && (
        <p className="mt-3 text-xs text-muted-foreground">
          Analisando os primeiros {formatNumber(summary.total)} anúncios da conta.
        </p>
      )}

      {/* Detail drawer */}
      <Sheet open={openId != null} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selected && <TechSpecDetail item={selected} />}
        </SheetContent>
      </Sheet>
    </SectionCard>
  );
}

function TechSpecDetail({ item }: { item: TechSpecListing }) {
  const missing = item.attributes.filter((a) => a.isMissing);
  const filled = item.attributes.filter((a) => !a.isMissing);
  return (
    <>
      <SheetHeader className="space-y-3">
        <SheetTitle className="flex items-center gap-2 text-base">
          <Stethoscope className="h-4 w-4 text-primary" />
          Detalhes da Ficha Técnica
        </SheetTitle>
        <div className="flex items-start gap-3 rounded-xl border bg-card p-3">
          <ProductCell
            title={item.title}
            thumbnail={item.thumbnail}
            permalink={item.permalink}
            titleClassName="max-w-full"
          />
        </div>
        <SheetDescription asChild>
          <div className="flex items-center gap-2">
            {item.complete ? (
              <Badge className="border-emerald-500/20 bg-emerald-500/12 text-emerald-700">
                Ficha completa
              </Badge>
            ) : (
              <Badge className="border-amber-500/20 bg-amber-500/12 text-amber-700">
                {item.filledAttributes}/{item.totalAttributes} preenchidos · {Math.round(item.completeness * 100)}%
              </Badge>
            )}
            {item.missingRequired > 0 && (
              <Badge className="border-rose-500/20 bg-rose-500/12 text-rose-700">
                {item.missingRequired} obrigatório{item.missingRequired === 1 ? "" : "s"} em falta
              </Badge>
            )}
          </div>
        </SheetDescription>
      </SheetHeader>

      <div className="mt-6 space-y-6">
        {/* Missing */}
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Atributos faltantes
            <span className="text-muted-foreground">({missing.length})</span>
          </h3>
          {missing.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              Nenhum atributo faltando. Ficha completa!
            </p>
          ) : (
            <ul className="space-y-1.5">
              {missing.map((a) => {
                const TypeIcon = VALUE_TYPE_META[a.valueType].icon;
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <TypeIcon className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span className="truncate text-sm">{a.name}</span>
                    </div>
                    {a.required && (
                      <Badge variant="outline" className="shrink-0 border-rose-500/30 text-[10px] text-rose-600">
                        Obrigatório
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Filled */}
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Atributos preenchidos
            <span className="text-muted-foreground">({filled.length})</span>
          </h3>
          {filled.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              Nenhum atributo preenchido ainda.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {filled.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
                >
                  <span className="truncate text-sm text-muted-foreground">{a.name}</span>
                  <span className="ml-2 shrink-0 truncate text-sm font-medium" title={a.valueName ?? undefined}>
                    {a.valueName ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
          A edição dos atributos direto por aqui chega em breve. Por enquanto, use o
          {" "}
          {item.permalink ? (
            <a href={item.permalink} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
              anúncio no Mercado Livre
            </a>
          ) : (
            "anúncio no Mercado Livre"
          )}
          {" "}para completar a ficha.
        </p>
      </div>
    </>
  );
}
