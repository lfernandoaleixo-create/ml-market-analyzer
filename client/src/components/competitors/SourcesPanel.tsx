import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SourceStatus } from "@shared/sources";
import {
  CheckCircle2,
  AlertTriangle,
  ShieldX,
  Circle,
  HelpCircle,
} from "lucide-react";

/**
 * Visual panel that summarizes the health of each of the four competitor data
 * sources (official ML API, Unwrangle, Oxylabs, ScrapingBee).
 *
 * It is intentionally honest: sources that are not configured are shown as
 * "neutral/standby" so the user understands the system works with whatever is
 * available and gets stronger as more keys are added (gradual activation).
 */

type HealthMeta = {
  Icon: typeof CheckCircle2;
  label: string;
  dot: string;
  text: string;
};

function healthMeta(s: SourceStatus): HealthMeta {
  if (!s.configured) {
    return {
      Icon: Circle,
      label: "Não configurada",
      dot: "text-muted-foreground/50",
      text: "text-muted-foreground",
    };
  }
  switch (s.health) {
    case "ok":
      return {
        Icon: CheckCircle2,
        label: "Ativa",
        dot: "text-emerald-500",
        text: "text-emerald-600",
      };
    case "upstream":
      return {
        Icon: AlertTriangle,
        label: "Instável",
        dot: "text-amber-500",
        text: "text-amber-600",
      };
    case "auth":
      return {
        Icon: ShieldX,
        label: "Credencial",
        dot: "text-red-500",
        text: "text-red-600",
      };
    case "unconfigured":
      return {
        Icon: Circle,
        label: "Não configurada",
        dot: "text-muted-foreground/50",
        text: "text-muted-foreground",
      };
    default:
      return {
        Icon: HelpCircle,
        label: "Pronta",
        dot: "text-sky-500",
        text: "text-sky-600",
      };
  }
}

export function SourcesPanel({
  sources,
  configuredCount,
}: {
  sources: SourceStatus[];
  configuredCount: number;
}) {
  const total = sources.length;
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Fontes de dados</p>
          <p className="text-xs text-muted-foreground">
            {configuredCount} de {total} fontes ativas — quanto mais fontes, maior a
            precisão por triangulação.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {sources.map((s) => {
          const m = healthMeta(s);
          return (
            <div
              key={s.id}
              className={cn(
                "flex items-start gap-2 rounded-lg border bg-card/50 px-3 py-2.5",
                !s.configured && "opacity-70",
              )}
            >
              <m.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", m.dot)} />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{s.label}</p>
                <p className={cn("text-[11px] leading-tight", m.text)}>{m.label}</p>
                {s.note && (
                  <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                    {s.note}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
