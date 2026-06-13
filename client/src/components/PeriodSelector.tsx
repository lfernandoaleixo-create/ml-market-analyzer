// The single, system-wide period selector. Every page that filters by date
// renders this component so the experience is identical everywhere:
//   Mês atual · Mês anterior · 60 dias · Base histórica · Personalizado
//
// Visual language matches the segmented control already used in Painel/Vendas
// (a pill group on a `bg-secondary` track), plus an inline date range that only
// appears in "Personalizado", and a right-aligned title chip.
import { STANDARD_PERIOD_OPTIONS, type StandardPeriodKey } from "@shared/period";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayIsoBrt } from "@/lib/period";
import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PeriodSelectorProps {
  value: StandardPeriodKey;
  onChange: (key: StandardPeriodKey) => void;
  fromIso: string;
  toIso: string;
  onFromIso: (v: string) => void;
  onToIso: (v: string) => void;
  /** Title shown in the right-aligned chip (e.g. "Junho de 2026"). */
  title: string;
  /** Hide the right-aligned title chip if a page renders its own. */
  hideTitle?: boolean;
  className?: string;
}

export function PeriodSelector({
  value,
  onChange,
  fromIso,
  toIso,
  onFromIso,
  onToIso,
  title,
  hideTitle,
  className,
}: PeriodSelectorProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-secondary p-1">
        {STANDARD_PERIOD_OPTIONS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={value === t.key ? "default" : "ghost"}
            className="h-8 rounded-lg px-3 text-xs"
            onClick={() => onChange(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {value === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={fromIso}
            max={toIso || todayIsoBrt()}
            onChange={(e) => onFromIso(e.target.value)}
            className="h-9 w-[150px]"
          />
          <span className="text-sm text-muted-foreground">até</span>
          <Input
            type="date"
            value={toIso}
            min={fromIso}
            max={todayIsoBrt()}
            onChange={(e) => onToIso(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
      )}

      {!hideTitle && (
        <span className="ml-auto inline-flex items-center gap-2 rounded-xl bg-primary/10 px-3.5 py-2 font-display text-sm font-bold tracking-tight text-primary ring-1 ring-primary/20">
          <CalendarRange className="h-4 w-4" /> {title}
        </span>
      )}
    </div>
  );
}
