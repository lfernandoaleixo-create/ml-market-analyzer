import { ReactNode, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertTriangle, PlugZap, TrendingUp, TrendingDown, Minus, ChevronDown, Loader2, RefreshCw, type LucideIcon } from "lucide-react";
import { useLocation } from "wouter";

/** Page header with title, subtitle and optional right-side actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl md:text-3xl tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A KPI tile: label, big value, optional icon, sublabel and accent color. */
export function KpiCard({
  label,
  value,
  icon: Icon,
  sublabel,
  accent = "primary",
  loading,
  valueClassName,
  trend,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  sublabel?: ReactNode;
  accent?: "primary" | "emerald" | "blue" | "amber" | "violet" | "rose" | "green" | "yellow" | "orange" | "red";
  loading?: boolean;
  valueClassName?: string;
  /**
   * Optional evolution indicator. `pct` is the percentage change vs. a
   * reference period (e.g. previous half of the window). `label` is the small
   * caption shown next to the arrow (e.g. "vs. período anterior").
   */
  trend?: { pct: number | null; label?: string };
}) {
  const accentMap: Record<string, { icon: string; bar: string }> = {
    primary: { icon: "bg-primary/12 text-primary", bar: "bg-primary" },
    emerald: { icon: "bg-emerald-500/12 text-emerald-600", bar: "bg-emerald-500" },
    blue: { icon: "bg-blue-500/12 text-blue-600", bar: "bg-blue-500" },
    amber: { icon: "bg-amber-500/12 text-amber-600", bar: "bg-amber-500" },
    violet: { icon: "bg-violet-500/12 text-violet-600", bar: "bg-violet-500" },
    rose: { icon: "bg-rose-500/12 text-rose-600", bar: "bg-rose-500" },
    green: { icon: "bg-emerald-500/12 text-emerald-600", bar: "bg-emerald-500" },
    yellow: { icon: "bg-yellow-400/15 text-yellow-600", bar: "bg-yellow-400" },
    orange: { icon: "bg-orange-500/12 text-orange-600", bar: "bg-orange-500" },
    red: { icon: "bg-red-500/12 text-red-600", bar: "bg-red-500" },
  };
  const a = accentMap[accent];
  return (
    <Card className="card-soft card-lift relative flex h-full flex-col overflow-hidden border-0 rounded-xl px-4 py-3">
      {/* Slim accent rail on the top edge (delicate, like the reference). */}
      <span className={cn("absolute inset-x-0 top-0 h-[3px]", a.bar)} aria-hidden />
      {/* Header row: compact uppercase label + small icon aligned to the right. */}
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {Icon && (
          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", a.icon)}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
          </div>
        )}
      </div>
      {/* Value row */}
      <div className="mt-1.5">
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <p
            className={cn(
              // Proportional, uniform size across every card. clamp() keeps long
              // numbers from overflowing narrow cards while staying readable on
              // wide ones. All cards share the same baseline.
              "font-display leading-none tracking-tight tabular-nums whitespace-nowrap",
              "text-[clamp(1.35rem,1.9vw,1.7rem)]",
              valueClassName,
            )}
          >
            {value}
          </p>
        )}
        {!loading && trend && trend.pct != null && Number.isFinite(trend.pct) && (
          <TrendPill pct={trend.pct} caption={trend.label} />
        )}
        {/* Reserve a consistent slot for the small caption so cards WITH and
            WITHOUT a sublabel keep their numbers aligned on the same baseline. */}
        {sublabel ? (
          <div className="mt-1 min-h-[0.95rem] text-[11px] leading-tight text-muted-foreground">{sublabel}</div>
        ) : (
          <div className="mt-1 min-h-[0.95rem]" aria-hidden />
        )}
      </div>
    </Card>
  );
}

/** Small up/down/flat pill showing a percentage change, colored by direction. */
function TrendPill({ pct, caption }: { pct: number; caption?: string }) {
  const rounded = Math.round(pct);
  const up = rounded > 0;
  const down = rounded < 0;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  const color = up
    ? "text-emerald-600"
    : down
      ? "text-rose-600"
      : "text-muted-foreground";
  const sign = up ? "+" : "";
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-xs">
      <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums", color)}>
        <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
        {sign}{rounded}%
      </span>
      {caption && <span className="text-muted-foreground">{caption}</span>}
    </div>
  );
}

/**
 * A titled section panel (white card) for charts/tables.
 *
 * When `collapsible` is true the header becomes a toggle (chevron rotates) and
 * the body expands/collapses. `defaultOpen` sets the initial state. Any
 * `actions` stay clickable without toggling the section. Non-collapsible usage
 * is unchanged and fully backward compatible.
 */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  collapsible = false,
  defaultOpen = true,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const showHeader = title || actions;

  const headerInner = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 space-y-0.5">
          {title && (
            <h2 className="flex items-center gap-2 font-display text-base tracking-tight">
              {!collapsible && <span className="h-4 w-1 rounded-full bg-primary" aria-hidden />}
              {title}
            </h2>
          )}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {actions && (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
        {/* Chevron lives on the RIGHT for collapsible sections (like the reference). */}
        {collapsible && (
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open ? "rotate-0" : "-rotate-90",
            )}
            aria-hidden
          />
        )}
      </div>
    </>
  );

  return (
    <Card className={cn("card-soft border-0 rounded-2xl", className)}>
      {showHeader &&
        (collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={cn(
              "flex w-full items-center justify-between gap-3 px-5 text-left transition-colors hover:bg-muted/30",
              // Slim header; only show the bottom divider when expanded.
              open ? "border-b py-3 rounded-t-2xl" : "py-3 rounded-2xl",
            )}
            style={{ borderColor: "var(--border)" }}
          >
            {headerInner}
          </button>
        ) : (
          <div
            className="flex items-center justify-between gap-3 border-b px-5 py-4"
            style={{ borderColor: "var(--border)" }}
          >
            {headerInner}
          </div>
        ))}
      {(!collapsible || open) && <div className="p-5">{children}</div>}
    </Card>
  );
}

/** Shown when the ML account is not connected. */
export function NotConnected() {
  const [, setLocation] = useLocation();
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="card-soft border-0 rounded-2xl max-w-md w-full p-8 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <PlugZap className="h-7 w-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-display text-xl tracking-tight">Conecte sua conta do Mercado Livre</h2>
          <p className="text-sm text-muted-foreground">
            Para ver vendas, anúncios, pós-venda e reputação com dados reais, conecte sua conta de
            vendedor nas configurações.
          </p>
        </div>
        <Button onClick={() => setLocation("/configuracoes")} className="w-full">
          Ir para Configurações
        </Button>
      </Card>
    </div>
  );
}

/**
 * Generic error state. Optionally renders a "Tentar novamente" button so a
 * transient ML hiccup (rate limit / timeout) never leaves the user stuck on a
 * dead screen — they can retry in place without reloading or reconnecting.
 */
export function ErrorState({
  message,
  onRetry,
  retrying,
}: {
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="card-soft border-0 rounded-2xl max-w-md w-full p-8 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="font-display text-lg tracking-tight">Não foi possível carregar</h2>
        <p className="text-sm text-muted-foreground">
          {message ??
            "O Mercado Livre demorou a responder ou está com limite de requisições no momento. Seus dados estão seguros — tente novamente em instantes."}
        </p>
        {onRetry && (
          <Button onClick={onRetry} disabled={retrying} className="w-full">
            {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Tentar novamente
          </Button>
        )}
      </Card>
    </div>
  );
}

/** Page-level container with consistent padding/spacing. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="canvas-wash min-h-full">
      <div className="container max-w-[1320px] py-6 md:py-8 space-y-6 animate-rise">{children}</div>
    </div>
  );
}

/** A simple loading skeleton grid for KPIs. */
export function KpiSkeletonRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <KpiCard key={i} label="" value="" loading />
      ))}
    </div>
  );
}
