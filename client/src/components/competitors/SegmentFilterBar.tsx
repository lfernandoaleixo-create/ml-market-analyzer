import { BadgeCheck, Zap, Ticket, Megaphone, X, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  noFiltersActive,
  type SegmentFilters,
  type SegmentKey,
} from "@shared/competitorFilters";
import {
  SORT_LABELS,
  SORT_OPTIONS,
  type SortKey,
} from "@shared/competitorSort";

/**
 * Filter chips for the Radar results: Loja oficial / FULL / Cupom / Patrocinado.
 * Multi-select with AND semantics (handled by the parent). Each chip shows how
 * many competitors fall into that segment over the full (unfiltered) list, so
 * the user can gauge a segment before toggling it. Colors mirror AttributeBadges
 * for a consistent visual language.
 */

const CHIPS: {
  key: SegmentKey;
  icon: typeof BadgeCheck;
  label: string;
  /** Classes applied when the chip is ACTIVE. */
  on: string;
}[] = [
  { key: "officialStore", icon: BadgeCheck, label: "Loja oficial", on: "border-blue-300 bg-blue-50 text-blue-700" },
  { key: "fulfillment", icon: Zap, label: "FULL", on: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  { key: "hasCoupon", icon: Ticket, label: "Cupom", on: "border-rose-300 bg-rose-50 text-rose-700" },
  { key: "sponsored", icon: Megaphone, label: "Patrocinado", on: "border-amber-300 bg-amber-50 text-amber-700" },
];

export function SegmentFilterBar({
  filters,
  counts,
  matched,
  total,
  onToggle,
  onClear,
  sort,
  onSortChange,
}: {
  filters: SegmentFilters;
  counts: Record<SegmentKey, number>;
  /** How many competitors match the currently active filters. */
  matched: number;
  /** Total competitors before filtering. */
  total: number;
  onToggle: (key: SegmentKey) => void;
  onClear: () => void;
  /** Current sort key + handler (ordering is applied AFTER filtering). */
  sort: SortKey;
  onSortChange: (key: SortKey) => void;
}) {
  const active = !noFiltersActive(filters);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
      <span className="mr-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Filtrar
      </span>
      {CHIPS.map((chip) => {
        const isOn = filters[chip.key];
        const count = counts[chip.key] ?? 0;
        const disabled = count === 0 && !isOn;
        return (
          <button
            key={chip.key}
            type="button"
            aria-pressed={isOn}
            disabled={disabled}
            onClick={() => onToggle(chip.key)}
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150",
              "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
              isOn
                ? chip.on
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            ].join(" ")}
          >
            <chip.icon className="h-3.5 w-3.5" />
            {chip.label}
            <span
              className={[
                "ml-0.5 rounded-full px-1.5 text-[10px] tabular-nums",
                isOn ? "bg-white/60" : "bg-muted text-muted-foreground",
              ].join(" ")}
            >
              {count}
            </span>
          </button>
        );
      })}
      {active && (
        <>
          <span className="text-[11px] text-muted-foreground">
            {matched} de {total}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={onClear}
          >
            <X className="h-3 w-3" />
            Limpar
          </Button>
        </>
      )}

      {/* Sort control, pushed to the right. Applied after the filters above. */}
      <div className="ml-auto flex items-center gap-1.5">
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        <Select value={sort} onValueChange={(v) => onSortChange(v as SortKey)}>
          <SelectTrigger
            size="sm"
            className="h-7 w-[180px] text-xs"
            aria-label="Ordenar resultados"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((key) => (
              <SelectItem key={key} value={key} className="text-xs">
                {SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
