import { ArrowRight, Info } from "lucide-react";
import { NumberField } from "./PricingFields";
import { money, percent } from "@/alpha/lib/format";

export function MarginPriceControl({
  mode,
  goal,
  goals,
  calculatedPrice,
  error,
  manualPrice,
  obtainedMargin,
  obtainedProfit,
  onGoal,
  onMode,
  onManualPrice,
}: {
  mode: "target" | "sale";
  goal: number;
  goals: number[];
  calculatedPrice: number | null;
  error?: string;
  manualPrice: number;
  obtainedMargin?: number;
  obtainedProfit?: number;
  onGoal: (margin: number) => void;
  onMode: (mode: "target" | "sale") => void;
  onManualPrice: (price: number) => void;
}) {
  const priceValue = mode === "target" ? (calculatedPrice ?? NaN) : manualPrice;
  const priceLabel =
    mode === "target" ? "Preço de venda calculado" : "Preço real/manual";
  const hasObtainedMargin = Number.isFinite(obtainedMargin);
  const hasObtainedProfit = Number.isFinite(obtainedProfit);
  const hasObtainedResult = hasObtainedMargin || hasObtainedProfit;

  function handlePriceChange(price: number) {
    onMode("sale");
    onManualPrice(price);
  }

  return (
    <div className="margin-price-control">
      <NumberField
        label="Margem de lucro que você quer ter"
        value={goal}
        onChange={onGoal}
        suffix="%"
        hint="Parte do preço de venda que sobra depois de todos os custos preenchidos. Não é acrescentar essa porcentagem ao custo."
      />
      <div className="goal-buttons" aria-label="Margens de lucro rápidas">
        {goals.map(g => (
          <button
            type="button"
            key={g}
            className={goal === g && mode === "target" ? "active" : ""}
            aria-pressed={goal === g && mode === "target"}
            onClick={() => onGoal(g)}
          >
            {percent(g)}
          </button>
        ))}
      </div>
      {mode === "target" ? (
        <>
          <div className="automatic-price-output">
            <NumberField
              label={priceLabel}
              value={priceValue}
              onChange={handlePriceChange}
              prefix="R$"
              hint="Você informa os custos e a margem. A Alpha determina o preço de venda; edite este campo para conferir um preço real/manual."
            />
          </div>
          {error && (
            <div className="callout error" role="alert">
              <Info size={13} />
              <span>{error}</span>
            </div>
          )}
          <p className="small-note">
            Frete, comissão e impostos são recalculados sobre o preço
            encontrado. Se faltar um dado ou a margem não for viável, não usamos
            um preço antigo como resultado.
          </p>
          <button
            type="button"
            className="link-button"
            onClick={() => onMode("sale")}
          >
            Já tenho um preço: apenas conferir <ArrowRight size={13} />
          </button>
        </>
      ) : (
        <div className="manual-price-check">
          <div className="callout">
            <Info size={13} />
            <span>
              Conferência opcional: este preço é real/manual e não é determinado
              pela margem. Para precificar a partir dos custos, volte ao cálculo
              automático.
            </span>
          </div>
          <NumberField
            label={priceLabel}
            value={priceValue}
            onChange={handlePriceChange}
            prefix="R$"
          />
          {hasObtainedResult && (
            <div
              className="obtained-result"
              aria-label="Resultado obtido com o preço real/manual"
            >
              {hasObtainedMargin && (
                <div>
                  <span>Margem obtida</span>
                  <strong>{percent(obtainedMargin!)}</strong>
                </div>
              )}
              {hasObtainedProfit && (
                <div>
                  <span>Lucro</span>
                  <strong>{money(obtainedProfit!)}</strong>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className="link-button"
            onClick={() => onMode("target")}
          >
            Voltar ao preço calculado pela margem <ArrowRight size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
