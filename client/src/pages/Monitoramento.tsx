import { DataSourceBanner, EmptyState, PageContainer, PageHeader } from "@/components/market/Common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { formatBRL, formatCompact } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { LineChart as LineChartIcon, Play, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

type Metric = "price" | "sold" | "position";

export default function Monitoramento() {
  const utils = trpc.useUtils();
  const list = trpc.monitor.list.useQuery();
  const [openId, setOpenId] = useState<number | null>(null);

  const runNow = trpc.monitor.runNow.useMutation({
    onSuccess: (r) => {
      utils.monitor.list.invalidate();
      utils.monitor.alerts.invalidate();
      toast.success(`Monitoramento executado: ${r.snapshots} registros, ${r.alertsCreated} alertas.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = trpc.monitor.remove.useMutation({
    onSuccess: () => {
      utils.monitor.list.invalidate();
      toast.success("Produto removido do monitoramento.");
    },
  });

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Acompanhamento contínuo"
        title="Monitoramento"
        description="Acompanhe a evolução de preço, vendas e posição dos produtos que você escolheu monitorar. O histórico é registrado ao longo do tempo pelo robô de monitoramento."
        actions={
          <Button
            variant="outline"
            onClick={() => runNow.mutate()}
            disabled={runNow.isPending || (list.data?.length ?? 0) === 0}
          >
            <RefreshCw className={`h-4 w-4 ${runNow.isPending ? "animate-spin" : ""}`} />
            Capturar agora
          </Button>
        }
      />

      <DataSourceBanner />

      {list.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : (list.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={LineChartIcon}
          title="Nenhum produto monitorado ainda"
          description="Use a busca ou o ranking de mais vendidos e clique em 'Monitorar' para começar a registrar o histórico de um produto."
        />
      ) : (
        <div className="space-y-3">
          {list.data?.map((m) => (
            <Card key={m.id} className="flex items-center gap-4 p-4">
              <img src={m.thumbnail ?? ""} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.title}</p>
                <p className="text-xs text-muted-foreground">{m.categoryName}</p>
              </div>
              <div className="hidden gap-6 text-right sm:flex">
                <div>
                  <p className="text-xs text-muted-foreground">Preço</p>
                  <p className="text-sm font-medium">{formatBRL(m.lastPrice)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vendidos</p>
                  <p className="text-sm font-medium">{formatCompact(m.lastSoldQuantity)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setOpenId(m.id)}>
                  <LineChartIcon className="h-3.5 w-3.5" /> Histórico
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => remove.mutate({ id: m.id })}
                  aria-label="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <HistoryDialog id={openId} onClose={() => setOpenId(null)} />
    </PageContainer>
  );
}

function HistoryDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [metric, setMetric] = useState<Metric>("price");
  const { data, isLoading } = trpc.monitor.history.useQuery(
    { id: id ?? 0, days: 90 },
    { enabled: id != null },
  );

  const chartData = useMemo(() => {
    return (data?.snapshots ?? []).map((s) => ({
      date: new Date(s.capturedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      price: s.price ?? null,
      sold: s.soldQuantity ?? null,
      position: s.position ?? null,
    }));
  }, [data]);

  const metricMeta: Record<Metric, { label: string; key: string; color: string; invert?: boolean }> = {
    price: { label: "Preço (R$)", key: "price", color: "var(--chart-1)" },
    sold: { label: "Vendas acumuladas", key: "sold", color: "var(--chart-2)" },
    position: { label: "Posição na busca", key: "position", color: "var(--chart-3)", invert: true },
  };
  const meta = metricMeta[metric];

  return (
    <Dialog open={id != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-6 text-left font-display">
            <span className="line-clamp-1">{data?.product.title ?? "Histórico"}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="price">Preço</TabsTrigger>
            <TabsTrigger value="sold">Vendas</TabsTrigger>
            <TabsTrigger value="position">Posição</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : chartData.length === 0 ? (
          <EmptyState
            icon={LineChartIcon}
            title="Sem histórico ainda"
            description="Use 'Capturar agora' para registrar o primeiro ponto."
          />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={meta.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={meta.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  reversed={meta.invert}
                  domain={meta.invert ? [1, "dataMax"] : ["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--muted-foreground)" }}
                />
                <Area
                  type="monotone"
                  dataKey={meta.key}
                  name={meta.label}
                  stroke={meta.color}
                  strokeWidth={2}
                  fill="url(#metricFill)"
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-center text-xs text-muted-foreground">
          {metric === "position" && "Posição menor = melhor colocação nos resultados."}
          {metric === "sold" && "Vendas acumuladas conforme exibidas pelo Mercado Livre."}
          {metric === "price" && "Variação de preço registrada a cada captura."}
        </p>
      </DialogContent>
    </Dialog>
  );
}
