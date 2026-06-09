import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConsensusLevel } from "@shared/sources";

/**
 * Confidence seal derived from how many sources agree on a value.
 *  - high   → "Alta concordância" (vários concordam)
 *  - medium → "Média concordância"
 *  - low    → "Baixa concordância" (fontes divergem)
 *  - single → "Fonte única"
 *  - none   → sem dado
 */

const META: Record<
  ConsensusLevel,
  { label: string; className: string }
> = {
  high: {
    label: "Alta concordância",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  },
  medium: {
    label: "Média concordância",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700",
  },
  low: {
    label: "Baixa concordância",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  },
  single: {
    label: "Fonte única",
    className: "border-border bg-muted text-muted-foreground",
  },
  none: {
    label: "Sem dados",
    className: "border-border bg-muted text-muted-foreground",
  },
};

export function ConsensusBadge({
  level,
  className,
  short = false,
}: {
  level: ConsensusLevel;
  className?: string;
  short?: boolean;
}) {
  const m = META[level];
  const shortLabel =
    level === "high"
      ? "Alta"
      : level === "medium"
        ? "Média"
        : level === "low"
          ? "Baixa"
          : level === "single"
            ? "Única"
            : "—";
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 text-[11px] font-medium", m.className, className)}
    >
      {short ? shortLabel : m.label}
    </Badge>
  );
}
