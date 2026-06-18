import { trpc } from "@/lib/trpc";
import { STEP_LABELS, STEP_ORDER, STEP_ICONS } from "@/lib/projectConstants";
import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  CheckCircle2,
  Loader2,
  ChevronRight,
  Calendar,
  Flame,
} from "lucide-react";

type StepStatus = "pendente" | "em_andamento" | "concluido";
type ProductStep = { key: string; status: StepStatus };
type Product = {
  id: number;
  name: string;
  priority: "alta" | "media" | "baixa";
  currentStep: string;
  expectedArrival?: Date | null;
  supplier?: string | null;
  steps: ProductStep[];
  completedCount: number;
  updatedAt: Date;
};

const TOTAL_STEPS = STEP_ORDER.length;

// Estilos por prioridade mapeados para os tokens do Mercato.
const PRIORITY_STYLE: Record<
  string,
  { label: string; dot: string; bg: string; border: string; text: string }
> = {
  alta: {
    label: "Alta",
    dot: "var(--destructive)",
    bg: "color-mix(in oklch, var(--destructive) 12%, transparent)",
    border: "color-mix(in oklch, var(--destructive) 35%, transparent)",
    text: "var(--destructive)",
  },
  media: {
    label: "Média",
    dot: "var(--warning)",
    bg: "color-mix(in oklch, var(--warning) 12%, transparent)",
    border: "color-mix(in oklch, var(--warning) 35%, transparent)",
    text: "var(--warning)",
  },
  baixa: {
    label: "Baixa",
    dot: "var(--primary)",
    bg: "color-mix(in oklch, var(--primary) 12%, transparent)",
    border: "color-mix(in oklch, var(--primary) 35%, transparent)",
    text: "var(--primary)",
  },
};

function getDaysLeft(date: Date | null | undefined): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const arrival = new Date(date);
  arrival.setHours(0, 0, 0, 0);
  return Math.round((arrival.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const URGENCY = (daysLeft: number | null) => {
  if (daysLeft === null) return { label: "Sem data", color: "var(--muted-foreground)", icon: Calendar };
  if (daysLeft < 0) return { label: "Atrasado", color: "var(--destructive)", icon: AlertTriangle };
  if (daysLeft === 0) return { label: "Hoje!", color: "var(--destructive)", icon: Flame };
  if (daysLeft <= 7) return { label: `${daysLeft}d`, color: "var(--warning)", icon: Flame };
  if (daysLeft <= 30) return { label: `${daysLeft}d`, color: "var(--warning)", icon: Clock };
  return { label: `${daysLeft}d`, color: "var(--success)", icon: CheckCircle2 };
};

function StepTimelineBar({
  steps,
  completedCount,
  priorityColor,
}: {
  steps: ProductStep[];
  completedCount: number;
  priorityColor: string;
}) {
  const progressPct = Math.round((completedCount / TOTAL_STEPS) * 100);
  return (
    <div className="w-full space-y-2">
      <div className="relative flex w-full justify-between" style={{ paddingTop: "28px" }}>
        <div
          className="absolute left-0 right-0 h-0.5 bg-muted"
          style={{ top: "28px", transform: "translateY(10px)" }}
        />
        <div
          className="absolute left-0 h-0.5 transition-all duration-700"
          style={{
            top: "28px",
            transform: "translateY(10px)",
            width: completedCount === 0 ? "0%" : `${((completedCount - 0.5) / TOTAL_STEPS) * 100}%`,
            background: priorityColor,
          }}
        />
        {steps.map((step, idx) => {
          const isDone = step.status === "concluido";
          const isCurrent = step.status === "em_andamento";
          const emoji = STEP_ICONS[step.key] ?? "·";
          const label = STEP_LABELS[step.key] ?? step.key;
          const shortLabel = label.split(/[/\s]/)[0];
          return (
            <div key={step.key} className="flex flex-col items-center gap-1 relative" style={{ flex: "0 0 auto" }}>
              <div
                className="absolute bottom-full mb-1 text-center"
                style={{ width: "44px", transform: "translateX(-50%)", left: "50%" }}
              >
                <span
                  className="text-[8px] leading-tight block truncate"
                  style={{
                    color: isCurrent ? "var(--primary)" : "var(--muted-foreground)",
                    fontWeight: isCurrent ? 700 : 400,
                  }}
                >
                  {shortLabel}
                </span>
              </div>
              <div
                className="relative z-10 flex items-center justify-center rounded-full transition-all duration-300"
                style={{
                  width: isCurrent ? "28px" : "22px",
                  height: isCurrent ? "28px" : "22px",
                  background: isDone
                    ? priorityColor
                    : isCurrent
                      ? `color-mix(in oklch, ${priorityColor} 30%, transparent)`
                      : "var(--muted)",
                  border: isDone || isCurrent ? `2px solid ${priorityColor}` : "2px solid var(--border)",
                }}
                title={label}
              >
                {isDone ? (
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : isCurrent ? (
                  <span style={{ fontSize: "10px", lineHeight: 1 }}>{emoji}</span>
                ) : (
                  <span className="text-muted-foreground" style={{ fontSize: "8px", lineHeight: 1 }}>
                    {idx + 1}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {completedCount} de {TOTAL_STEPS} etapas concluídas
        </span>
        <span
          className="text-xs font-semibold"
          style={{ color: progressPct === 100 ? "var(--success)" : priorityColor }}
        >
          {progressPct}%
        </span>
      </div>
    </div>
  );
}

function ProductRow({
  product,
  index,
  onNavigate,
}: {
  product: Product;
  index: number;
  onNavigate: (id: number) => void;
}) {
  const pStyle = PRIORITY_STYLE[product.priority] ?? PRIORITY_STYLE.media;
  const daysLeft = getDaysLeft(product.expectedArrival as any);
  const urgency = URGENCY(daysLeft);
  const UrgencyIcon = urgency.icon;
  const isOverdue = daysLeft !== null && daysLeft < 0;

  return (
    <button onClick={() => onNavigate(product.id)} className="group w-full text-left">
      <div className="relative flex items-stretch gap-0 rounded-2xl overflow-hidden bg-card card-soft transition-all duration-200 hover:card-lift">
        <div className="w-1 shrink-0 rounded-l-2xl" style={{ background: pStyle.dot }} />
        <div className="flex-1 min-w-0 p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <span
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
              style={{ background: pStyle.bg, color: pStyle.text, border: `1px solid ${pStyle.border}` }}
            >
              {index + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display font-semibold text-foreground text-base leading-tight">
                  {product.name}
                </h3>
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full border shrink-0"
                  style={{ background: pStyle.bg, color: pStyle.text, borderColor: pStyle.border }}
                >
                  {pStyle.label}
                </span>
                {isOverdue && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 bg-destructive/15 text-destructive border border-destructive/40">
                    <AlertTriangle className="w-3 h-3" />
                    Atrasado
                  </span>
                )}
              </div>
              {product.supplier && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{product.supplier}</p>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1.5 ml-2">
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                style={{
                  background: `color-mix(in oklch, ${urgency.color} 15%, transparent)`,
                  border: `1px solid color-mix(in oklch, ${urgency.color} 40%, transparent)`,
                }}
              >
                <UrgencyIcon className="w-3.5 h-3.5 shrink-0" style={{ color: urgency.color }} />
                <span className="text-xs font-bold" style={{ color: urgency.color }}>
                  {urgency.label}
                </span>
              </div>
              {product.expectedArrival ? (
                <span className="text-xs text-muted-foreground text-right">
                  {new Date(product.expectedArrival).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground italic">Sem data</span>
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </div>
          <StepTimelineBar steps={product.steps} completedCount={product.completedCount} priorityColor={pStyle.dot} />
        </div>
      </div>
    </button>
  );
}

function MonthHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-primary" />
        <span className="font-display font-semibold text-sm text-primary">{label}</span>
        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-primary/12 text-primary">
          {count}
        </span>
      </div>
      <div className="flex-1 h-px bg-primary/20" />
    </div>
  );
}

export default function ProjetoTimeline() {
  const [, setLocation] = useLocation();
  const { data: products, isLoading } = trpc.project.products.timelineOverview.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const groups = useMemo(() => {
    if (!products) return [];
    const map = new Map<string, { label: string; sortKey: number; items: Product[] }>();
    for (const p of products) {
      let key: string;
      let label: string;
      let sortKey: number;
      if (p.expectedArrival) {
        const d = new Date(p.expectedArrival);
        const yr = d.getFullYear();
        const mo = d.getMonth();
        key = `${yr}-${String(mo).padStart(2, "0")}`;
        label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        label = label.charAt(0).toUpperCase() + label.slice(1);
        sortKey = yr * 100 + mo;
      } else {
        key = "sem-data";
        label = "Sem data definida";
        sortKey = 99999;
      }
      if (!map.has(key)) map.set(key, { label, sortKey, items: [] });
      map.get(key)!.items.push(p as unknown as Product);
    }
    return Array.from(map.values()).sort((a, b) => a.sortKey - b.sortKey);
  }, [products]);

  const stats = useMemo(() => {
    if (!products) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = products.filter((p) => {
      if (!p.expectedArrival) return false;
      const d = new Date(p.expectedArrival);
      d.setHours(0, 0, 0, 0);
      return d < today;
    }).length;
    const urgent = products.filter((p) => {
      const days = getDaysLeft(p.expectedArrival as any);
      return days !== null && days >= 0 && days <= 7;
    }).length;
    const alta = products.filter((p) => p.priority === "alta").length;
    return { total: products.length, overdue, urgent, alta };
  }, [products]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-display font-semibold text-foreground">Cronograma de Chegadas</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Produtos ordenados por data de chegada prevista — do mais urgente ao mais distante. A linha do tempo mostra as
          etapas concluídas, a etapa atual e as pendentes.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, color: "var(--primary)" },
            { label: "Prioridade Alta", value: stats.alta, color: "var(--destructive)" },
            { label: "Urgentes (≤7d)", value: stats.urgent, color: "var(--warning)" },
            { label: "Atrasados", value: stats.overdue, color: "var(--destructive)" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl p-3 flex flex-col gap-1 bg-card card-soft"
              style={{ borderTop: `2px solid ${s.color}` }}
            >
              <span className="text-2xl font-display font-bold" style={{ color: s.color }}>
                {s.value}
              </span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl p-3 flex flex-wrap gap-4 text-xs bg-card card-soft">
        <span className="font-medium text-foreground">Etapas:</span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="w-4 h-4 rounded-full flex items-center justify-center bg-primary">
            <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Concluída
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="w-4 h-4 rounded-full bg-primary/25 border-2 border-primary" />
          Em andamento
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="w-4 h-4 rounded-full bg-muted border-2 border-border" />
          Pendente
        </span>
        <span className="ml-auto font-medium text-foreground">Urgência:</span>
        {[
          { color: "var(--destructive)", label: "Atrasado" },
          { color: "var(--warning)", label: "≤7d" },
          { color: "var(--warning)", label: "≤30d" },
          { color: "var(--success)", label: ">30d" },
        ].map((l, i) => (
          <span key={`${l.label}-${i}`} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-16">
          <CalendarClock className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">Nenhum produto encontrado</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group, gi) => {
            const offset = groups.slice(0, gi).reduce((acc, g) => acc + g.items.length, 0);
            return (
              <div key={group.label} className="space-y-2">
                <MonthHeader label={group.label} count={group.items.length} />
                <div className="space-y-3 pl-2">
                  {group.items.map((product, i) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      index={offset + i}
                      onNavigate={(id) => setLocation(`/projeto/produto/${id}`)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
