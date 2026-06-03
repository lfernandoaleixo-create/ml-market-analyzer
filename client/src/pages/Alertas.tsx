import { DataSourceBanner, EmptyState, PageContainer, PageHeader } from "@/components/market/Common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BellOff,
  CheckCheck,
  Flame,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

const TYPE_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; className: string; tone: string }
> = {
  price_drop: { icon: ArrowDownRight, className: "text-emerald-500 bg-emerald-500/10", tone: "Queda de preço" },
  price_rise: { icon: ArrowUpRight, className: "text-orange-500 bg-orange-500/10", tone: "Aumento de preço" },
  sales_surge: { icon: Flame, className: "text-primary bg-primary/10", tone: "Disparada de vendas" },
  position_gain: { icon: TrendingUp, className: "text-emerald-500 bg-emerald-500/10", tone: "Subiu no ranking" },
  position_loss: { icon: TrendingDown, className: "text-red-500 bg-red-500/10", tone: "Caiu no ranking" },
};

const SEVERITY_META: Record<string, string> = {
  info: "border-border text-muted-foreground",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  critical: "border-red-500/30 bg-red-500/10 text-red-500",
};

export default function Alertas() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.monitor.alerts.useQuery();

  const markRead = trpc.monitor.markAlertRead.useMutation({
    onMutate: async ({ id }) => {
      await utils.monitor.alerts.cancel();
      const prev = utils.monitor.alerts.getData();
      utils.monitor.alerts.setData(undefined, (old) =>
        (old ?? []).map((a) => (a.id === id ? { ...a, isRead: true } : a)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.monitor.alerts.setData(undefined, ctx.prev);
    },
    onSettled: () => utils.monitor.alerts.invalidate(),
  });

  const markAll = trpc.monitor.markAllAlertsRead.useMutation({
    onSuccess: () => {
      utils.monitor.alerts.invalidate();
      toast.success("Todos os alertas marcados como lidos.");
    },
  });

  const unread = (data ?? []).filter((a) => !a.isRead).length;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Notificações"
        title="Alertas"
        description="Variações significativas detectadas nos produtos monitorados — quedas e aumentos de preço, disparadas de vendas e mudanças de posição na busca."
        actions={
          (data?.length ?? 0) > 0 && (
            <Button variant="outline" onClick={() => markAll.mutate()} disabled={unread === 0}>
              <CheckCheck className="h-4 w-4" /> Marcar todos como lidos
            </Button>
          )
        }
      />

      <DataSourceBanner />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={BellOff}
          title="Nenhum alerta por enquanto"
          description="Quando um produto monitorado variar de forma relevante, o alerta aparecerá aqui. Ajuste os limiares em Configurações."
        />
      ) : (
        <div className="space-y-2.5">
          {data?.map((a) => {
            const meta = TYPE_META[a.type] ?? TYPE_META.price_rise;
            const Icon = meta.icon;
            return (
              <Card
                key={a.id}
                className={`flex items-start gap-3 p-4 transition-colors ${a.isRead ? "opacity-65" : ""}`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.className}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{a.title}</p>
                    <Badge variant="outline" className={`h-5 text-[10px] ${SEVERITY_META[a.severity]}`}>
                      {a.severity === "critical" ? "Crítico" : a.severity === "warning" ? "Atenção" : "Info"}
                    </Badge>
                    {a.changePercent != null && (
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatPercent(a.changePercent)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground leading-snug">{a.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    {new Date(a.createdAt).toLocaleString("pt-BR")}
                  </p>
                </div>
                {!a.isRead && (
                  <Button variant="ghost" size="sm" onClick={() => markRead.mutate({ id: a.id })}>
                    <Bell className="h-3.5 w-3.5" /> Lido
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
