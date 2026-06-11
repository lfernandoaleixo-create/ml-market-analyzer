import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { SectionCard, KpiCard } from "@/components/account/AccountUI";
import { ProductCell } from "@/components/account/ProductCell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { toast } from "sonner";
import type { TechSpecListing, TechAttribute } from "@shared/account";
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
  Copy,
  Check,
  PartyPopper,
  ExternalLink,
} from "lucide-react";

type FilterMode = "all" | "incomplete" | "required";

const VALUE_TYPE_META: Record<
  TechAttribute["valueType"],
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
 * Raio-X da Ficha Técnica — analyses EVERY active listing's technical sheet,
 * tells the seller clearly whether everything is 100% complete, and provides a
 * correction area where missing attributes are filled in until the sheet is OK.
 * The seller then copies the full adjusted sheet to paste back into ML.
 */
export function TechSpecsCard({ connected }: { connected: boolean }) {
  const { data, isLoading, isFetching } = trpc.account.technicalSpecs.useQuery(
    undefined,
    { enabled: connected, staleTime: 5 * 60 * 1000 },
  );

  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<FilterMode>("incomplete");
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
      description="Analisamos TODOS os seus anúncios ativos, cruzando os atributos exigidos por cada categoria do Mercado Livre com o que está preenchido. Corrija o que falta aqui e copie a ficha pronta para colar no anúncio."
      actions={
        isFetching && !isLoading ? (
          <span className="text-xs text-muted-foreground">Analisando…</span>
        ) : undefined
      }
    >
      {/* Global status banner */}
      {isLoading ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : summary && summary.allComplete ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-4 py-3.5 text-emerald-800">
          <PartyPopper className="h-6 w-6 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold">
              Tudo certo! Todas as {formatNumber(summary.total)} fichas dos seus anúncios ativos estão 100% completas.
            </p>
            <p className="text-xs text-emerald-700/80">
              Nenhum atributo faltando. Não há nada para corrigir no momento.
            </p>
          </div>
        </div>
      ) : summary ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3.5 text-amber-900">
          <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold">
              {formatNumber(summary.incomplete)} de {formatNumber(summary.total)} anúncios ativos {summary.incomplete === 1 ? "está" : "estão"} com a ficha técnica incompleta.
            </p>
            <p className="text-xs text-amber-800/80">
              Abra cada anúncio abaixo, preencha os atributos faltantes e copie a ficha pronta para atualizar no Mercado Livre.
            </p>
          </div>
        </div>
      ) : null}

      {/* Summary KPIs */}
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Fichas completas"
          value={isLoading ? "" : `${formatNumber(summary?.complete ?? 0)} / ${formatNumber(summary?.total ?? 0)}`}
          loading={isLoading}
          icon={CheckCircle2}
          accent="emerald"
          sublabel={isLoading ? undefined : `${completePct}% dos ativos`}
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
              { key: "incomplete", label: "Pendentes" },
              { key: "required", label: "Faltam obrigatórios" },
              { key: "all", label: "Todos" },
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
          Analisando os primeiros {formatNumber(summary.total)} anúncios ativos da conta.
        </p>
      )}

      {/* Correction drawer */}
      <Sheet open={openId != null} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="flex w-full flex-col overflow-y-auto p-0 sm:max-w-lg">
          {selected && <TechSpecCorrection item={selected} />}
        </SheetContent>
      </Sheet>
    </SectionCard>
  );
}

/** Correction panel: fill in missing attributes until the sheet is OK, then
 *  copy the full adjusted sheet to paste back into Mercado Livre. */
const NOT_APPLICABLE_LABEL = "Não se aplica";

function TechSpecCorrection({ item }: { item: TechSpecListing }) {
  // Local edits keyed by attribute id (the value the seller typed/picked).
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<Record<string, string>>({});
  // Attributes the seller explicitly marked as "Não se aplica" (counts as done).
  const [notApplicable, setNotApplicable] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const missing = item.attributes.filter((a) => a.isMissing);
  const filled = item.attributes.filter((a) => !a.isMissing);

  function setEdit(id: string, value: string) {
    setEdits((prev) => ({ ...prev, [id]: value }));
  }

  /** Toggle "Não se aplica" for an attribute. When turned on, clears any typed
   *  value so the field reads as resolved-via-N/A. */
  function toggleNA(id: string) {
    setNotApplicable((prev) => {
      const next = !prev[id];
      if (next) {
        // Clear any partial value when marking N/A.
        setEdits((e) => ({ ...e, [id]: "" }));
      }
      return { ...prev, [id]: next };
    });
  }

  /** Resolved value for a missing attribute: combine number + unit, or N/A. */
  function resolvedValue(a: TechAttribute): string {
    if (notApplicable[a.id]) return NOT_APPLICABLE_LABEL;
    const raw = (edits[a.id] ?? "").trim();
    if (!raw) return "";
    if (a.valueType === "number_unit") {
      const unit = (units[a.id] ?? a.defaultUnit ?? a.allowedUnits?.[0] ?? "").trim();
      return unit ? `${raw} ${unit}` : raw;
    }
    return raw;
  }

  const stillMissing = missing.filter((a) => resolvedValue(a) === "");
  const resolvedNow = missing.length - stillMissing.length;
  const isOk = stillMissing.length === 0;

  // The full adjusted sheet = already-filled attributes + the values typed now.
  const fullSheetLines = useMemo(() => {
    const lines: string[] = [];
    // Keep a stable, readable order: required first, then the rest by name.
    const ordered = [...item.attributes].sort((a, b) => {
      if (a.required !== b.required) return a.required ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const a of ordered) {
      const value = a.isMissing ? resolvedValue(a) : (a.valueName ?? "");
      if (value && value.trim() !== "") lines.push(`${a.name}: ${value.trim()}`);
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, edits, units, notApplicable]);

  async function copyFullSheet() {
    const header = `Ficha técnica — ${item.title}`;
    const text = [header, "", ...fullSheetLines].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Ficha completa copiada! Cole no anúncio do Mercado Livre.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Tente novamente.");
    }
  }

  return (
    <>
      <SheetHeader className="space-y-3 border-b p-5 pr-12 text-left">
        <SheetTitle className="flex items-center gap-2 text-base leading-tight">
          <Stethoscope className="h-4 w-4 shrink-0 text-primary" />
          <span>Corrigir Ficha Técnica</span>
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
          <div className="flex flex-wrap items-center gap-2">
            {isOk ? (
              <Badge className="border-emerald-500/20 bg-emerald-500/12 text-emerald-700">
                <Check className="mr-1 h-3 w-3" /> Pronto · ficha 100%
              </Badge>
            ) : (
              <Badge className="border-amber-500/20 bg-amber-500/12 text-amber-700">
                Faltam {stillMissing.length} de {missing.length}
              </Badge>
            )}
            {item.missingRequired > 0 && !isOk && (
              <Badge className="border-rose-500/20 bg-rose-500/12 text-rose-700">
                {item.missingRequired} obrigatório{item.missingRequired === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-6 p-5">
        {/* Progress to OK */}
        {missing.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium">Preenchimento dos faltantes</span>
              <span className="tabular-nums text-muted-foreground">{resolvedNow}/{missing.length}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", isOk ? "bg-emerald-500" : "bg-amber-500")}
                style={{ width: `${missing.length ? Math.round((resolvedNow / missing.length) * 100) : 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Missing — correction fields */}
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
            <div className="space-y-3">
              {missing.map((a) => {
                const TypeIcon = VALUE_TYPE_META[a.valueType].icon;
                const isNA = !!notApplicable[a.id];
                const done = resolvedValue(a) !== "";
                return (
                  <div
                    key={a.id}
                    className={cn(
                      "rounded-xl border p-3 transition-colors",
                      done ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5",
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <TypeIcon className={cn("h-3.5 w-3.5 shrink-0", done ? "text-emerald-600" : "text-amber-600")} />
                        <span className="truncate text-sm font-medium">{a.name}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {done && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                        {a.required && (
                          <Badge variant="outline" className="border-rose-500/30 text-[10px] text-rose-600">
                            Obrigatório
                          </Badge>
                        )}
                      </div>
                    </div>

                    {isNA ? (
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/8 px-3 py-2 text-sm text-emerald-700">
                        <Check className="h-4 w-4 shrink-0" />
                        Marcado como “Não se aplica”
                      </div>
                    ) : (
                      <AttributeInput
                        attr={a}
                        value={edits[a.id] ?? ""}
                        unit={units[a.id] ?? a.defaultUnit ?? a.allowedUnits?.[0] ?? ""}
                        onValue={(v) => setEdit(a.id, v)}
                        onUnit={(u) => setUnits((prev) => ({ ...prev, [a.id]: u }))}
                      />
                    )}

                    <div className="mt-2 flex items-center justify-between gap-2">
                      {a.hint && !isNA ? (
                        <p className="truncate text-[11px] text-muted-foreground">Ex.: {a.hint}</p>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={() => toggleNA(a.id)}
                        className={cn(
                          "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                          isNA
                            ? "bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/20"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-3.5 w-3.5 items-center justify-center rounded border",
                            isNA ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40",
                          )}
                        >
                          {isNA && <Check className="h-2.5 w-2.5" />}
                        </span>
                        Não se aplica
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Already filled */}
        {filled.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Já preenchidos
              <span className="text-muted-foreground">({filled.length})</span>
            </h3>
            <ul className="space-y-1.5">
              {filled.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
                  <span className="truncate text-sm text-muted-foreground">{a.name}</span>
                  <span className="ml-2 shrink-0 truncate text-sm font-medium" title={a.valueName ?? undefined}>
                    {a.valueName ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Sticky footer: copy full sheet */}
      <div className="sticky bottom-0 space-y-2 border-t bg-background/95 p-4 backdrop-blur">
        {isOk ? (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Ficha pronta! Copie abaixo e cole no anúncio do Mercado Livre.
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Preencha os {stillMissing.length} atributo{stillMissing.length === 1 ? "" : "s"} faltante{stillMissing.length === 1 ? "" : "s"} para liberar a ficha completa.
          </div>
        )}
        <div className="flex gap-2">
          <Button
            className="flex-1 gap-1.5"
            disabled={!isOk}
            onClick={copyFullSheet}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado!" : "Copiar ficha completa"}
          </Button>
          {item.permalink && (
            <Button asChild variant="outline" className="gap-1.5 bg-card">
              <a href={item.permalink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Abrir no ML
              </a>
            </Button>
          )}
        </div>
        {isOk && (
          <details className="rounded-lg border bg-muted/40 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Pré-visualizar ficha que será copiada
            </summary>
            <Textarea
              readOnly
              value={[`Ficha técnica — ${item.title}`, "", ...fullSheetLines].join("\n")}
              className="mt-2 h-40 resize-none bg-card font-mono text-xs"
            />
          </details>
        )}
      </div>
    </>
  );
}

/** Renders the right input for an attribute's value type. */
function AttributeInput({
  attr,
  value,
  unit,
  onValue,
  onUnit,
}: {
  attr: TechAttribute;
  value: string;
  unit: string;
  onValue: (v: string) => void;
  onUnit: (u: string) => void;
}) {
  if (attr.valueType === "list" && (attr.allowedValues?.length ?? 0) > 0) {
    return (
      <Select value={value} onValueChange={onValue}>
        <SelectTrigger className="h-9 bg-card">
          <SelectValue placeholder="Selecione…" />
        </SelectTrigger>
        <SelectContent>
          {attr.allowedValues!.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (attr.valueType === "boolean") {
    return (
      <Select value={value} onValueChange={onValue}>
        <SelectTrigger className="h-9 bg-card">
          <SelectValue placeholder="Selecione…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Sim">Sim</SelectItem>
          <SelectItem value="Não">Não</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (attr.valueType === "number_unit") {
    const hasUnits = (attr.allowedUnits?.length ?? 0) > 0;
    return (
      <div className="flex gap-2">
        <Input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          placeholder="Valor"
          className="h-9 flex-1 bg-card"
        />
        {hasUnits ? (
          <Select value={unit} onValueChange={onUnit}>
            <SelectTrigger className="h-9 w-28 shrink-0 bg-card">
              <SelectValue placeholder="Un." />
            </SelectTrigger>
            <SelectContent>
              {attr.allowedUnits!.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={unit}
            onChange={(e) => onUnit(e.target.value)}
            placeholder="Unid."
            className="h-9 w-24 shrink-0 bg-card"
          />
        )}
      </div>
    );
  }

  if (attr.valueType === "number") {
    return (
      <Input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onValue(e.target.value)}
        placeholder="Digite o número"
        className="h-9 bg-card"
      />
    );
  }

  // string (default)
  return (
    <Input
      value={value}
      onChange={(e) => onValue(e.target.value)}
      placeholder="Digite o valor"
      className="h-9 bg-card"
    />
  );
}
