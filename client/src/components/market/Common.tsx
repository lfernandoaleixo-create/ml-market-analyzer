import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Database, Radio } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        {eyebrow && (
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{eyebrow}</div>
        )}
        <h1 className="text-2xl font-display font-600 tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1320px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 animate-rise">{children}</div>;
}

export function DataSourceBanner() {
  const { data } = trpc.market.status.useQuery();
  if (!data) return null;
  const isDemo = data.mode === "demo";
  const isScraping = data.mode === "scraping";
  const isLive = data.mode === "official" && (data as any).oauthConnected === true;
  const tone = isDemo
    ? "border-amber-500/25 bg-amber-500/8 text-amber-600 dark:text-amber-400"
    : isLive
      ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400"
      : isScraping
        ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400"
        : "border-sky-500/25 bg-sky-500/8 text-sky-600 dark:text-sky-400";
  const label = isDemo
    ? "Demonstração"
    : isLive
      ? "Ao vivo"
      : isScraping
        ? "Dados reais"
        : "Conectar";
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${tone}`}>
      {isDemo ? (
        <Database className="h-4 w-4 shrink-0" />
      ) : (
        <Radio className="h-4 w-4 shrink-0" />
      )}
      <span className="leading-snug">{data.message}</span>
      <Badge variant="outline" className="ml-auto shrink-0 capitalize">
        {label}
      </Badge>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? "var(--success)" : score >= 50 ? "var(--primary)" : "var(--muted-foreground)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s var(--ease-out-quint)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-display font-600">{Math.round(score)}</span>
      </div>
    </div>
  );
}
