import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertTriangle, PlugZap, type LucideIcon } from "lucide-react";
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
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  sublabel?: ReactNode;
  accent?: "primary" | "emerald" | "blue" | "amber" | "violet" | "rose" | "green" | "yellow" | "orange" | "red";
  loading?: boolean;
  valueClassName?: string;
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
    <Card className="card-soft card-lift relative overflow-hidden border-0 p-5 rounded-2xl">
      {/* Accent rail on the left edge */}
      <span className={cn("absolute inset-y-0 left-0 w-1", a.bar)} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="h-8 w-28" />
          ) : (
            <p className={cn("font-display text-2xl md:text-[1.75rem] leading-none tracking-tight", valueClassName)}>{value}</p>
          )}
          {sublabel && <div className="text-xs text-muted-foreground">{sublabel}</div>}
        </div>
        {Icon && (
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm", a.icon)}>
            <Icon className="h-5 w-5" strokeWidth={2.2} />
          </div>
        )}
      </div>
    </Card>
  );
}

/** A titled section panel (white card) for charts/tables. */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("card-soft border-0 rounded-2xl", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <div className="space-y-0.5">
            {title && (
              <h2 className="flex items-center gap-2 font-display text-base tracking-tight">
                <span className="h-4 w-1 rounded-full bg-primary" aria-hidden />
                {title}
              </h2>
            )}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
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

/** Generic error state. */
export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="card-soft border-0 rounded-2xl max-w-md w-full p-8 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="font-display text-lg tracking-tight">Não foi possível carregar</h2>
        <p className="text-sm text-muted-foreground">
          {message ?? "Tente novamente em instantes. Se persistir, reconecte sua conta nas configurações."}
        </p>
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
