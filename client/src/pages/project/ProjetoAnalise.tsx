import { useMemo, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  TrendingUp,
  PieChart as PieChartIcon,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { STEP_LABELS, STEP_ORDER, STEP_ICONS } from "@/lib/projectConstants";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Cores de prioridade alinhadas à paleta Mercato.
const PRIORITY_COLOR: Record<string, string> = {
  alta: "#dc2626",
  media: "#d4a843",
  baixa: "#10b981",
};
const PRIORITY_LABEL: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const PRIMARY = "#10b981"; // mint/teal próximo do --primary
const Y_TICKS = STEP_ORDER.map((_, i) => (i + 1) * 10);

function calcExpectedProgress(expectedArrival: Date | null | undefined): number | null {
  if (!expectedArrival) return null;
  const now = Date.now();
  const arrival = new Date(expectedArrival).getTime();
  const PIPELINE_DAYS = 90;
  const start = arrival - PIPELINE_DAYS * 24 * 60 * 60 * 1000;
  if (now <= start) return 0;
  if (now >= arrival) return 100;
  return Math.round(((now - start) / (arrival - start)) * 100);
}
function daysUntil(d: Date | null | undefined): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
function formatDate(d: Date | null | undefined): string {
  if (!d) return "Sem data";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

const CHART_HEIGHT = 460;
const CHART_MARGIN = { top: 28, right: 20, left: 160, bottom: 100 };

type TooltipData = {
  name: string;
  priority: string;
  progressPct: number;
  completedCount: number;
  currentStep: string;
  inProgressStepKey?: string | null;
  expectedArrival?: Date | null;
  expectedPct: number | null;
  barColor: string;
};

function TRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ color: color ?? "#374151", fontWeight: color ? 600 : 400, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function HoverTooltip({ data, x, y }: { data: TooltipData; x: number; y: number }) {
  const isDelayed = data.expectedPct !== null && data.progressPct < data.expectedPct - 10;
  const days = daysUntil(data.expectedArrival);
  const stepLabel = data.inProgressStepKey
    ? STEP_LABELS[data.inProgressStepKey] ?? "—"
    : data.currentStep
      ? STEP_LABELS[data.currentStep] ?? "—"
      : "—";
  const W = 240;
  return (
    <div
      style={{
        position: "fixed",
        left: x + 14,
        top: y - 20,
        width: W,
        background: "#ffffff",
        border: `1px solid ${data.barColor}44`,
        borderRadius: 12,
        padding: "14px 16px",
        boxShadow: "0 8px 40px rgba(16,24,40,0.18)",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: data.barColor, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, color: "#111827", fontSize: 13, lineHeight: 1.3 }}>{data.name}</span>
      </div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: `${data.barColor}18`,
          border: `1px solid ${data.barColor}55`,
          borderRadius: 6,
          padding: "2px 8px",
          fontSize: 11,
          color: data.barColor,
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        Prioridade {PRIORITY_LABEL[data.priority]}
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
          <span>Progresso</span>
          <span style={{ color: "#374151", fontWeight: 600 }}>{data.progressPct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: `${data.barColor}22`, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${data.progressPct}%`, background: data.barColor, borderRadius: 3 }} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11 }}>
        <TRow label="Etapas concluídas" value={`${data.completedCount} / 10`} />
        <TRow label="Etapa atual" value={stepLabel} />
        {data.expectedPct !== null && (
          <TRow
            label="Prazo esperado"
            value={`${data.expectedPct}% — ${isDelayed ? "⚠ atrasado" : "✓ em dia"}`}
            color={isDelayed ? "#dc2626" : "#10b981"}
          />
        )}
        {data.expectedArrival && (
          <TRow
            label="Chegada prevista"
            value={`${formatDate(data.expectedArrival)}${days !== null ? ` · ${days < 0 ? `${Math.abs(days)}d atrás` : `em ${days}d`}` : ""}`}
            color={days !== null && days < 0 ? "#dc2626" : days !== null && days <= 7 ? "#d4a843" : undefined}
          />
        )}
      </div>
      <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 10, borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
        Clique para abrir o dossiê →
      </p>
    </div>
  );
}

export default function ProjetoAnalise() {
  const [, setLocation] = useLocation();
  const [hovered, setHovered] = useState<{ data: TooltipData; x: number; y: number } | null>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  const { data: products, isLoading } = trpc.project.products.dashboardOverview.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const stats = useMemo(() => {
    if (!products) return null;
    const total = products.length;
    const launched = products.filter((p) => p.currentStep === "lancamento").length;
    const atrasados = products.filter((p) => {
      const exp = calcExpectedProgress(p.expectedArrival);
      return exp !== null && p.progressPct < exp - 10;
    }).length;
    const emDia = products.filter((p) => {
      const exp = calcExpectedProgress(p.expectedArrival);
      return exp !== null && p.progressPct >= exp - 10;
    }).length;
    return { total, launched, atrasados, emDia };
  }, [products]);

  const chartData = useMemo(() => {
    if (!products) return [];
    const priorityOrder: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
    return [...products]
      .sort((a, b) => {
        const pa = (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1);
        if (pa !== 0) return pa;
        const da = a.expectedArrival ? new Date(a.expectedArrival).getTime() : Infinity;
        const db2 = b.expectedArrival ? new Date(b.expectedArrival).getTime() : Infinity;
        return da - db2;
      })
      .map((p) => ({
        ...p,
        shortName: p.name.length > 10 ? p.name.slice(0, 9) + "…" : p.name,
        expectedPct: calcExpectedProgress(p.expectedArrival),
        barColor: PRIORITY_COLOR[p.priority] ?? PRIORITY_COLOR.media,
      }));
  }, [products]);

  const handleMouseMove = useCallback((e: React.MouseEvent, product: (typeof chartData)[number]) => {
    setHovered({
      data: {
        name: product.name,
        priority: product.priority,
        progressPct: product.progressPct,
        completedCount: product.completedCount,
        currentStep: product.currentStep,
        inProgressStepKey: product.inProgressStepKey,
        expectedArrival: product.expectedArrival,
        expectedPct: product.expectedPct,
        barColor: product.barColor,
      },
      x: e.clientX,
      y: e.clientY,
    });
  }, []);
  const handleMouseLeave = useCallback(() => setHovered(null), []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const innerW = 900;
  const innerH = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
  const n = chartData.length;
  const barGroupW = n > 0 ? innerW / n : 0;
  const barW = Math.min(barGroupW * 0.55, 44);
  const yScale = (pct: number) => innerH - (pct / 100) * innerH;

  return (
    <div className="flex flex-col gap-6">
      {hovered && <HoverTooltip data={hovered.data} x={hovered.x} y={hovered.y} />}

      <div>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-display font-semibold text-foreground">Análise do Portfólio</h2>
        </div>
        <p className="text-muted-foreground text-xs">
          Cada barra = um produto · Altura = progresso real · Sombra = 100% do pipeline · Passe o mouse para detalhes
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, icon: Package, color: "var(--primary)" },
            { label: "Em Dia", value: stats.emDia, icon: CheckCircle2, color: "var(--success)" },
            { label: "Atrasados", value: stats.atrasados, icon: AlertTriangle, color: "var(--destructive)" },
            { label: "Lançados", value: stats.launched, icon: Clock, color: "var(--chart-5)" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-4 flex items-center gap-3 bg-card card-soft">
              <s.icon className="w-5 h-5 shrink-0" style={{ color: s.color }} />
              <div>
                <p className="text-2xl font-bold text-foreground leading-none font-display">{s.value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl p-5 bg-card card-soft">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-sm font-medium text-foreground">Progresso × Etapas por Produto</p>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
            {(["alta", "media", "baixa"] as const).map((p) => (
              <span key={p} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: PRIORITY_COLOR[p] }} />
                {PRIORITY_LABEL[p]}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block opacity-20 bg-muted-foreground" />
              100% (sombra)
            </span>
            <span className="flex items-center gap-1">
              <span style={{ color: "#64748b", fontSize: 14 }}>◆</span>
              Prazo esperado
            </span>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height: CHART_HEIGHT }}>
            Nenhum produto encontrado.
          </div>
        ) : (
          <div ref={svgContainerRef} style={{ overflowX: "auto" }}>
            <svg
              width="100%"
              viewBox={`0 0 ${innerW + CHART_MARGIN.left + CHART_MARGIN.right} ${CHART_HEIGHT}`}
              style={{ minWidth: 700, display: "block" }}
            >
              <g transform={`translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`}>
                {Y_TICKS.map((tick, i) => {
                  const cy = yScale(tick);
                  const stepKey = STEP_ORDER[i];
                  const icon = STEP_ICONS[stepKey] ?? "";
                  const label = STEP_LABELS[stepKey] ?? stepKey;
                  return (
                    <g key={tick}>
                      <line x1={0} y1={cy} x2={innerW} y2={cy} stroke="#e5e7eb" strokeWidth={1} strokeDasharray={tick === 100 ? "none" : "4 3"} />
                      <text x={-10} y={cy} dy="0.35em" textAnchor="end" fontSize={13}>{icon}</text>
                      <text x={-28} y={cy} dy="0.35em" textAnchor="end" fill="#94a3b8" fontSize={10} fontFamily="Inter, sans-serif">
                        {label}
                      </text>
                    </g>
                  );
                })}
                <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="#e5e7eb" strokeWidth={1} />
                {chartData.map((product, i) => {
                  const cx = barGroupW * i + barGroupW / 2;
                  const bx = cx - barW / 2;
                  const fillH = (product.progressPct / 100) * innerH;
                  const fillY = innerH - fillH;
                  const expPct = product.expectedPct;
                  const expY = expPct != null ? yScale(expPct) : null;
                  const isDelayed = expPct !== null && product.progressPct < expPct - 10;
                  const barColor = isDelayed ? "#dc2626" : product.barColor;
                  const r = 5;
                  const isHover = hovered?.data.name === product.name;
                  return (
                    <g
                      key={product.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => setLocation(`/projeto/produto/${product.id}`)}
                      onMouseMove={(e) => handleMouseMove(e, product)}
                      onMouseLeave={handleMouseLeave}
                    >
                      <rect x={bx - 6} y={0} width={barW + 12} height={innerH} rx={r} fill={product.barColor} fillOpacity={isHover ? 0.06 : 0} />
                      <rect x={bx} y={0} width={barW} height={innerH} rx={r} ry={r} fill={product.barColor} fillOpacity={isHover ? 0.18 : 0.1} />
                      {fillH > 0 && (
                        <rect x={bx} y={fillY} width={barW} height={fillH} rx={r} ry={r} fill={barColor} fillOpacity={isHover ? 1 : 0.88} />
                      )}
                      {expY !== null && (
                        <>
                          <line x1={bx - 2} y1={expY} x2={bx + barW + 2} y2={expY} stroke="#64748b" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.6} />
                          <text x={cx} y={expY - 5} textAnchor="middle" fill="#64748b" fontSize={10} opacity={0.85}>◆</text>
                        </>
                      )}
                      <text x={cx} y={fillH > 0 ? fillY - 5 : innerH - 5} textAnchor="middle" fill="#64748b" fontSize={10} fontFamily="Inter, sans-serif" fontWeight={600}>
                        {product.progressPct}%
                      </text>
                      <text
                        x={cx}
                        y={innerH + 10}
                        textAnchor="end"
                        fill={isHover ? product.barColor : `${product.barColor}bb`}
                        fontSize={10}
                        fontFamily="Inter, sans-serif"
                        fontWeight={600}
                        transform={`rotate(-65, ${cx}, ${innerH + 10})`}
                      >
                        {product.name}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        )}
      </div>

      {chartData.length > 0 &&
        (() => {
          const alta = chartData.filter((p) => p.priority === "alta").length;
          const media = chartData.filter((p) => p.priority === "media").length;
          const baixa = chartData.filter((p) => p.priority === "baixa").length;
          const pieData = [
            { name: "Alta", value: alta, color: PRIORITY_COLOR.alta },
            { name: "Média", value: media, color: PRIORITY_COLOR.media },
            { name: "Baixa", value: baixa, color: PRIORITY_COLOR.baixa },
          ].filter((d) => d.value > 0);
          const completedPct =
            chartData.length > 0
              ? Math.round(chartData.reduce((acc, p) => acc + p.progressPct, 0) / chartData.length)
              : 0;
          const progressData = [
            { name: "Concluído", value: completedPct, color: PRIMARY },
            { name: "Pendente", value: 100 - completedPct, color: "#e5e7eb" },
          ];
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl p-5 bg-card card-soft">
                <div className="flex items-center gap-2 mb-4">
                  <PieChartIcon className="w-4 h-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">Distribuição por Prioridade</p>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="46%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                      labelLine={{ stroke: "#cbd5e1" }}
                    >
                      {pieData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number, name: string) => [`${value} produto${value !== 1 ? "s" : ""}`, name]}
                    />
                    <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-2xl p-5 bg-card card-soft">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">Progresso Médio do Portfólio</p>
                </div>
                <div style={{ position: "relative" }}>
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie
                        data={progressData}
                        cx="50%"
                        cy="46%"
                        innerRadius={65}
                        outerRadius={95}
                        startAngle={90}
                        endAngle={-270}
                        paddingAngle={0}
                        dataKey="value"
                      >
                        {progressData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} stroke="transparent" />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
                        formatter={(value: number, name: string) => [`${value}%`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div
                    style={{
                      position: "absolute",
                      top: "46%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      textAlign: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <p className="text-3xl font-bold text-foreground font-display">{completedPct}%</p>
                    <p className="text-xs text-muted-foreground mt-0.5">progresso médio</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      <p className="text-center text-[11px] text-muted-foreground pb-4">
        Dados calculados com base nas etapas concluídas em cada dossiê de produto
      </p>
    </div>
  );
}
