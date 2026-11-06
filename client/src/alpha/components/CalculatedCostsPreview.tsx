import type { PricingResult } from "@shared/alpha/pricing";
import { money, percent } from "@/alpha/lib/format";
import { resultLines } from "./PricingResults";

type CalculatedCostsPreviewProps = {
  result: PricingResult;
  goal: number;
  mode: "sale" | "target";
};

export function CalculatedCostsPreview({
  result,
  goal,
  mode,
}: CalculatedCostsPreviewProps) {
  const note =
    mode === "target"
      ? `Valores calculados com a margem atual de ${percent(goal)}. Ao mudar a margem na última etapa, frete, comissão e impostos serão recalculados.`
      : "Valores do preço existente em conferência. A margem pode ser escolhida na última etapa.";
  const lines = result.valid ? resultLines(result) : [];
  if (result.valid && !lines.some(line => line.name === "Impostos informados")) {
    lines.push({
      name: "Impostos informados",
      value: result.taxes,
      color: "#a9b5c9",
    });
  }

  return (
    <div
      className="calculated-costs-preview"
      aria-label="Custos calculados antes da margem"
    >
      <h3>Custos calculados</h3>
      <small className="small-note">{note}</small>
      {result.valid ? (
        <dl className="calculated-cost-lines">
          {lines.map(line => (
            <div className="calculated-cost-line" key={line.name}>
              <dt>{line.name}</dt>
              <dd>{money(line.value)}</dd>
            </div>
          ))}
          <div className="calculated-cost-total">
            <dt>Total de custos</dt>
            <dd>{money(result.totalCosts)}</dd>
          </div>
        </dl>
      ) : (
        <div className="callout error" role="alert">
          <span>{result.error || "Confira os dados para calcular."}</span>
        </div>
      )}
    </div>
  );
}
