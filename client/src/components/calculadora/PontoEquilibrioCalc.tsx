import { useMemo, useState } from "react";
import { SectionCard } from "@/components/account/AccountUI";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatBRL, formatNumber } from "@/lib/format";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
} from "recharts";
import {
  calculateBreakEven,
  type BreakEvenInput,
  type FixedCosts,
  type VariableCosts,
  type SalesInfo,
} from "@shared/breakeven";
import { ChevronDown, Scale } from "lucide-react";

const SHARE_COLORS: Record<string, string> = {
  fixed: "#6366f1",
  variable: "#f59e0b",
  margin: "#10b981",
};

/** Campo numérico com prefixo/sufixo. */
function NumField({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = "0.01",
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {prefix}
          </span>
        )}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={0}
          value={value || ""}
          placeholder="0,00"
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className={cn("tabular-nums", prefix ? "pl-9" : "", suffix ? "pr-8" : "")}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/** Cabeçalho de seção colapsável (estilo Mamba). */
function Collapsible({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm font-medium"
      >
        {title}
        <ChevronDown className={cn("h-4 w-4 transition-transform", open ? "rotate-0" : "-rotate-90")} />
      </button>
      {open && <div className="border-t border-border px-5 py-4">{children}</div>}
    </div>
  );
}

export default function PontoEquilibrioCalc() {
  const [sales, setSales] = useState<SalesInfo>({
    grossRevenue: 0,
    cancelledRevenue: 0,
    unitsSold: 0,
  });
  const [variable, setVariable] = useState<VariableCosts>({
    cmv: 0,
    advertising: 0,
    channelCommission: 0,
    shipping: 0,
    packaging: 0,
    returns: 0,
    taxRate: 0,
    otherTaxRate: 0,
  });
  const [fixed, setFixed] = useState<FixedCosts>({
    proLabore: 0,
    salaries: 0,
    rent: 0,
    waterAndEnergy: 0,
    internet: 0,
    insurance: 0,
    managementSystem: 0,
    otherSoftware: 0,
    bankFees: 0,
    financing: 0,
    accounting: 0,
    other: 0,
  });

  const setS = (k: keyof SalesInfo) => (n: number) => setSales((p) => ({ ...p, [k]: n }));
  const setV = (k: keyof VariableCosts) => (n: number) => setVariable((p) => ({ ...p, [k]: n }));
  const setF = (k: keyof FixedCosts) => (n: number) => setFixed((p) => ({ ...p, [k]: n }));

  const input: BreakEvenInput = useMemo(
    () => ({ sales, variable, fixed }),
    [sales, variable, fixed],
  );
  const result = useMemo(() => calculateBreakEven(input), [input]);

  const hasInput = sales.grossRevenue > 0 && sales.unitsSold > 0;
  const donut = result.costShare.filter((c) => c.amount > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ----------------------------- ENTRADAS ----------------------------- */}
      <div className="space-y-4">
        <Collapsible title="Informações de venda (mês)">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumField id="be-rev" label="Faturamento bruto" prefix="R$" value={sales.grossRevenue} onChange={setS("grossRevenue")} />
            <NumField id="be-canc" label="Faturamento cancelado" prefix="R$" value={sales.cancelledRevenue} onChange={setS("cancelledRevenue")} />
            <NumField id="be-units" label="Unidades vendidas" step="1" value={sales.unitsSold} onChange={setS("unitsSold")} />
          </div>
        </Collapsible>

        <Collapsible title="Custos variáveis">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumField id="be-cmv" label="CMV (custo da mercadoria)" prefix="R$" value={variable.cmv} onChange={setV("cmv")} />
            <NumField id="be-ads" label="Publicidade / ADS" prefix="R$" value={variable.advertising} onChange={setV("advertising")} />
            <NumField id="be-comm" label="Comissão do canal" prefix="R$" value={variable.channelCommission} onChange={setV("channelCommission")} />
            <NumField id="be-ship" label="Frete / envios" prefix="R$" value={variable.shipping} onChange={setV("shipping")} />
            <NumField id="be-pack" label="Embalagem" prefix="R$" value={variable.packaging} onChange={setV("packaging")} />
            <NumField id="be-ret" label="Devoluções" prefix="R$" value={variable.returns} onChange={setV("returns")} />
            <NumField id="be-tax" label="Alíquota de imposto" suffix="%" step="0.1" value={variable.taxRate} onChange={setV("taxRate")} />
            <NumField id="be-tax2" label="Outros impostos" suffix="%" step="0.1" value={variable.otherTaxRate} onChange={setV("otherTaxRate")} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Os custos em R$ são os totais do mês. As alíquotas (%) incidem sobre o faturamento líquido.
          </p>
        </Collapsible>

        <Collapsible title="Custos fixos (mês)">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumField id="be-pro" label="Pró-labore" prefix="R$" value={fixed.proLabore} onChange={setF("proLabore")} />
            <NumField id="be-sal" label="Salários" prefix="R$" value={fixed.salaries} onChange={setF("salaries")} />
            <NumField id="be-rent" label="Aluguel" prefix="R$" value={fixed.rent} onChange={setF("rent")} />
            <NumField id="be-we" label="Água e energia" prefix="R$" value={fixed.waterAndEnergy} onChange={setF("waterAndEnergy")} />
            <NumField id="be-net" label="Internet / telefone" prefix="R$" value={fixed.internet} onChange={setF("internet")} />
            <NumField id="be-ins" label="Seguros" prefix="R$" value={fixed.insurance} onChange={setF("insurance")} />
            <NumField id="be-sys" label="Sistema de gestão" prefix="R$" value={fixed.managementSystem} onChange={setF("managementSystem")} />
            <NumField id="be-soft" label="Outros softwares" prefix="R$" value={fixed.otherSoftware} onChange={setF("otherSoftware")} />
            <NumField id="be-bank" label="Tarifas bancárias" prefix="R$" value={fixed.bankFees} onChange={setF("bankFees")} />
            <NumField id="be-fin" label="Financiamentos" prefix="R$" value={fixed.financing} onChange={setF("financing")} />
            <NumField id="be-acc" label="Contabilidade" prefix="R$" value={fixed.accounting} onChange={setF("accounting")} />
            <NumField id="be-oth" label="Outros" prefix="R$" value={fixed.other} onChange={setF("other")} />
          </div>
        </Collapsible>
      </div>

      {/* ----------------------------- RESULTADOS ----------------------------- */}
      <div className="space-y-6">
        {!hasInput ? (
          <SectionCard title="Resultados">
            <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Scale className="h-7 w-7" />
              </div>
              <p className="max-w-xs text-sm text-muted-foreground">
                Informe o faturamento e as unidades vendidas do mês para calcular o ponto de equilíbrio.
              </p>
            </div>
          </SectionCard>
        ) : !result.valid ? (
          <SectionCard title="Resultados">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              {result.error}
            </div>
          </SectionCard>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wider opacity-80">
                  Ponto de equilíbrio (faturamento)
                </p>
                <p className="mt-1 font-display text-2xl tracking-tight tabular-nums">
                  {formatBRL(result.breakEvenRevenue)}
                </p>
                <p className="mt-1 text-sm opacity-90 tabular-nums">
                  ≈ {formatNumber(result.breakEvenUnits)} unidades/mês
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Lucro líquido atual
                </p>
                <p
                  className={cn(
                    "mt-1 font-display text-2xl tracking-tight tabular-nums",
                    result.netProfit < 0 ? "text-rose-600" : "text-emerald-600",
                  )}
                >
                  {formatBRL(result.netProfit)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  Margem líquida {result.netMarginPct.toFixed(1)}%
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Ticket médio</p>
                <p className="mt-1 font-display text-lg tabular-nums">{formatBRL(result.avgTicket)}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Margem de contribuição</p>
                <p className="mt-1 font-display text-lg tabular-nums">
                  {result.contributionMarginPct.toFixed(1)}%
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                  {formatBRL(result.contributionMarginPerUnit)}/un.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Custos fixos</p>
                <p className="mt-1 font-display text-lg tabular-nums">{formatBRL(result.fixedTotal)}</p>
              </div>
            </div>

            {/* Donut composição */}
            <SectionCard title="Composição da receita líquida">
              <div className="grid items-center gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donut}
                        dataKey="amount"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={78}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {donut.map((c) => (
                          <Cell key={c.key} fill={SHARE_COLORS[c.key] ?? "#94a3b8"} />
                        ))}
                      </Pie>
                      <RTooltip
                        formatter={(v: number, _n, p) => [
                          `${formatBRL(v)} (${(p.payload as { percent: number }).percent.toFixed(1)}%)`,
                          (p.payload as { label: string }).label,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-1.5">
                  {donut.map((c) => (
                    <li key={c.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: SHARE_COLORS[c.key] ?? "#94a3b8" }}
                        />
                        {c.label}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatBRL(c.amount)} · {c.percent.toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </SectionCard>

            {/* Cenários */}
            <SectionCard title="Cenários de venda">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Cenário</th>
                      <th className="py-2 px-3 text-right font-medium">Unidades</th>
                      <th className="py-2 px-3 text-right font-medium">Faturamento</th>
                      <th className="py-2 pl-3 text-right font-medium">Lucro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.scenarios.map((s) => (
                      <tr
                        key={s.key}
                        className={cn(
                          "border-b border-border/60",
                          s.key === "current" && "bg-muted/30 font-medium",
                          s.key === "breakeven" && "bg-primary/5",
                        )}
                      >
                        <td className="py-2.5 pr-3">{s.label}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{formatNumber(s.units)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{formatBRL(s.revenue)}</td>
                        <td
                          className={cn(
                            "py-2.5 pl-3 text-right tabular-nums",
                            s.profit < 0 ? "text-rose-600" : s.profit > 0 ? "text-emerald-600" : "",
                          )}
                        >
                          {formatBRL(s.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <p className="text-[11px] text-muted-foreground">
              Estimativa de gestão. Os cenários variam o volume de vendas mantendo o ticket médio e a
              estrutura de custos atual.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
