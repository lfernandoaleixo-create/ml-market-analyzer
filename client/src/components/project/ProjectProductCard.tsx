import { PRIORITY_LABELS } from "@/lib/projectConstants";
import { ChevronRight, Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

type Product = {
  id: number;
  name: string;
  priority: "alta" | "media" | "baixa";
  currentStep: string;
  supplier?: string | null;
  description?: string | null;
  updatedAt: Date;
  expectedArrival?: Date | null;
  completedCount?: number;
  progressPct?: number;
};

interface ProductCardProps {
  product: Product;
  viewMode: "grid" | "list";
  onClick: () => void;
  // Overrides vindos do overview dinamico (espelho do Cronograma).
  // Quando presentes, tem prioridade sobre os campos do produto.
  completedCount?: number;
  totalSteps?: number;
  progressPct?: number;
  currentStageLabel?: string | null;
}

// Cores por prioridade mapeadas para os tokens do Mercato.
const PRIORITY_CONFIG: Record<
  string,
  { label: string; dot: string; badge: string }
> = {
  alta: {
    label: "Alta",
    dot: "var(--destructive)",
    badge: "bg-destructive/10 text-destructive border-destructive/20",
  },
  media: {
    label: "Média",
    dot: "var(--warning)",
    badge: "bg-warning/10 text-warning border-warning/20",
  },
  baixa: {
    label: "Baixa",
    dot: "var(--primary)",
    badge: "bg-primary/10 text-primary border-primary/20",
  },
};

export default function ProjectProductCard({
  product,
  viewMode,
  onClick,
  completedCount: completedOverride,
  totalSteps: totalOverride,
  progressPct: progressOverride,
  currentStageLabel,
}: ProductCardProps) {
  const pConfig = PRIORITY_CONFIG[product.priority] ?? PRIORITY_CONFIG.media;
  // ESPELHO DO CRONOGRAMA: usa as etapas dinamicas quando disponiveis.
  const completedCount = completedOverride ?? product.completedCount ?? 0;
  const totalSteps = totalOverride ?? 0;
  const progress =
    progressOverride ?? (totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0);
  const isLaunched = totalSteps > 0 && completedCount >= totalSteps;
  const accent = isLaunched ? "var(--success)" : "var(--primary)";
  // Etapa atual: primeira pendente do Cronograma (fallback para o campo antigo).
  const stepLabel = currentStageLabel ?? product.currentStep;

  if (viewMode === "list") {
    return (
      <button
        onClick={onClick}
        className="w-full text-left rounded-xl p-4 bg-card card-soft hover:card-lift transition-all duration-200 active:scale-[0.995] group"
      >
        <div className="flex items-center gap-4">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: pConfig.dot }}
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{product.name}</h3>
            {product.supplier && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{product.supplier}</p>
            )}
          </div>
          <span className={cn("shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border", pConfig.badge)}>
            {pConfig.label}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground hidden md:block w-40 text-right">
            {stepLabel}
          </span>
          <div className="shrink-0 w-24 hidden lg:block">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: accent }}
              />
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
        </div>
        {product.expectedArrival && (
          <div className="mt-2 pt-2 border-t border-border/60 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3 shrink-0 text-primary" />
            <span>
              Chegada prevista:{" "}
              <span className="font-medium text-foreground">
                {new Date(product.expectedArrival).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </span>
          </div>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl p-5 bg-card card-soft hover:card-lift transition-all duration-200 active:scale-[0.98] group flex flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {product.name}
          </h3>
          {product.supplier && (
            <p className="text-xs text-muted-foreground mt-1 truncate">{product.supplier}</p>
          )}
        </div>
        <span className={cn("shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border", pConfig.badge)}>
          {pConfig.label}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
        <span className="text-xs text-muted-foreground">
          {stepLabel}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">Progresso</span>
          <span className="text-xs font-medium" style={{ color: accent }}>
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, background: accent }}
          />
        </div>
        {totalSteps > 0 && (
          <div className="flex gap-0.5 mt-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className="flex-1 h-0.5 rounded-full transition-all duration-300"
                style={{
                  background: i < completedCount ? "var(--primary)" : "var(--muted)",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {product.expectedArrival && (
        <div className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary/8 border border-primary/20">
          <Calendar className="w-3.5 h-3.5 shrink-0 text-primary" />
          <span className="text-muted-foreground">Chegada prevista:</span>
          <span className="font-semibold text-primary">
            {new Date(product.expectedArrival).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between mt-auto pt-1 border-t border-border/60">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {new Date(product.updatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </button>
  );
}

export { PRIORITY_LABELS };
