import { ArrowDownToLine, BookmarkPlus, Copy, Info } from "lucide-react";
import {
  calculate,
  getDifalCost,
  solveTarget,
  type PricingInput,
} from "@shared/alpha/pricing";
import { getAcquisition } from "@shared/alpha/kitComposition";
import { money, percent } from "@/alpha/lib/format";
import { NumberField } from "./PricingFields";

export type PricingResult = ReturnType<typeof calculate>;
export function resultLines(r: PricingResult) {
  return [
    { name: "Produto", value: r.productCost, color: "#ad9ac6" },
    {
      name: "Operação + embalagem",
      value: r.operation + r.packaging,
      color: "#c2b6d0",
    },
    { name: "Comissão Mercado Livre", value: r.commission, color: "#eac75e" },
    { name: "Custo de envio", value: r.shipping, color: "#d6a04b" },
    { name: "Tarifa fixa informada", value: r.fixedFee, color: "#bd9148" },
    { name: "Publicidade", value: r.ads, color: "#a6b8b6" },
    { name: "Impostos informados", value: r.taxes, color: "#a9b5c9" },
    { name: "Ofertas / promoção", value: r.promotion, color: "#c6a1ab" },
    { name: "Outros custos Full", value: r.fullExtra, color: "#b6b8c1" },
    { name: "Reserva / perdas", value: r.reserve, color: "#b4b4ae" },
  ].filter(
    l =>
      l.value !== 0 ||
      ["Produto", "Comissão Mercado Livre", "Custo de envio"].includes(l.name)
  );
}
export function ResultCard({
  r,
  input,
  mode,
  goal,
  onCopy,
  onSave,
  onPriceChange,
  editablePrice,
  onPdf,
}: {
  r: PricingResult;
  input: PricingInput;
  mode: "sale" | "target";
  goal: number;
  onCopy: () => void;
  onSave: () => void;
  onPriceChange?: (price: number) => void;
  editablePrice?: number;
  onPdf?: () => void;
}) {
  const lines = resultLines(r);
  const acquisition = getAcquisition(input);
  const sku = input.productType === "kit" ? input.kitSku : input.productSku;
  const hasEditablePrice =
    typeof onPriceChange === "function" && editablePrice !== undefined;
  return (
    <section className="result-card" aria-label="Resultado da precificação">
      <div className="result-top">
        <div className="result-topline">
          <span>
            {mode === "sale"
              ? "Conferência de preço existente"
              : `Preço calculado para ${percent(goal)} de margem`}
          </span>
          <span
            title={
              input.calculationType === "real"
                ? "Custo de chegada confirmado. Frete e lucro projetado ainda dependem das condições da venda."
                : "Custo de chegada previsto para mercadoria ainda não recebida."
            }
          >
            <span className="live-dot" />
            {input.calculationType === "real"
              ? "Cálculo Real"
              : "Cálculo Estimado"}
          </span>
        </div>
        <div className="result-price">
          {hasEditablePrice ? (
            <NumberField
              label={mode === "sale" ? "Preço real/manual" : "Preço de venda"}
              value={editablePrice!}
              onChange={price => onPriceChange?.(price)}
              prefix="R$"
            />
          ) : r.valid ? (
            money(r.price)
          ) : (
            "—"
          )}
        </div>
        <div className="result-description">
          {input.description || "Seu produto"} ·{" "}
          {input.productType === "kit" ? "KIT" : "Produto único"} ·{" "}
          {input.listing === "classic" ? "Clássico" : "Premium"}
          {acquisition.quantity > 1 &&
            ` · ${acquisition.quantity} itens no produto/kit`}
          {sku && ` · SKU ${sku}`}
        </div>
      </div>
      <div className="result-content">
        {r.valid ? (
          <>
            <div className={`profit-box ${r.profit < 0 ? "negative" : ""}`}>
              <div>
                <span>
                  {r.profit < 0
                    ? "Prejuízo estimado por venda"
                    : "Lucro estimado por venda"}
                </span>
                <strong>{money(r.profit)}</strong>
              </div>
              <div className="margin-pill">{percent(r.margin)}</div>
            </div>
            <div className="cost-heading">
              <h3>Para onde vai o seu dinheiro</h3>
              <span>% do preço</span>
            </div>
            {lines.map(l => (
              <div className="cost-line" key={l.name}>
                <span className="cost-dot" style={{ background: l.color }} />
                <span className="cost-name">{l.name}</span>
                <span className="cost-value">{money(l.value)}</span>
                <span className="cost-percent">
                  {r.price > 0 ? percent((l.value / r.price) * 100) : "—"}
                </span>
              </div>
            ))}
            <div className="total-line">
              <span>Custos totais</span>
              <span>{money(r.totalCosts)}</span>
            </div>
            <div
              className="price-composition"
              role="img"
              aria-label="Composição do preço de venda"
            >
              {lines.map(l => (
                <span
                  key={l.name}
                  style={{
                    background: l.color,
                    width: `${Math.max(0, (l.value / r.price) * 100)}%`,
                  }}
                />
              ))}
              {r.profit > 0 && (
                <span
                  style={{ background: "#74a88b", width: `${r.margin}%` }}
                />
              )}
            </div>
            <div className="composition-label">
              Repasse após comissão e envio:{" "}
              <strong>{money(r.netPayout)}</strong>.<br />
              Esse repasse ainda não é lucro: produto e outros custos são
              descontados acima.
            </div>
            <div className="result-actions">
              <button onClick={onCopy}>
                <Copy size={12} />
                Copiar
              </button>
              <button
                className="primary"
                onClick={onSave}
                aria-label="Salvar produto na nuvem"
              >
                <BookmarkPlus size={12} />
                Salvar produto
              </button>
              {onPdf && (
                <button onClick={onPdf} aria-label="Gerar ficha PDF">
                  <ArrowDownToLine size={12} />
                  PDF
                </button>
              )}
            </div>
            <details className="result-footnote">
              <summary className="cursor-pointer">
                Condições e parâmetros da simulação
              </summary>
              Margem sobre o preço de venda, após os custos preenchidos.
              {mode === "sale" &&
                " Conferência opcional: o preço digitado é mantido. Volte ao cálculo pela margem para determinar o preço de venda."}{" "}
              {mode === "target" &&
                " O preço foi determinado pela margem e pelos custos, sem usar um preço de venda informado."}{" "}
              Tributos federais informados nesta simulação:{" "}
              {percent(input.taxFederal)}; ICMS e DIFAL são manuais. DIFAL
              {input.useDestinationTaxes && input.saleDestination === "inside"
                ? " dentro do estado: 0%; configuração externa: "
                : " selecionado: "}
              {input.difalMode === "rs"
                ? `${money(input.taxDifalValue ?? 0)} fixos por venda/kit`
                : `${percent(input.taxDifal)} do preço`}
              ; aplicado {money(getDifalCost(input, r.price))}, já incluído nos
              impostos (não somar novamente). A configuração não valida o regime
              fiscal. Comissões-base de {percent(input.classicRate)} /{" "}
              {percent(input.premiumRate)} são informadas por você, não
              consultadas na conta. A taxa efetiva deste resultado é{" "}
              {percent(r.rate)}.
              {input.categoryDiscountEligible &&
                " Benefício habilitado para categoria elegível: redução de 2/4 pontos entre R$150 e R$700, calculada em cada preço."}{" "}
              Frete sujeito à elegibilidade e à pesagem real.
            </details>
          </>
        ) : (
          <div className="callout error">
            <Info size={14} />
            <span>{r.error || "Confira os dados para calcular."}</span>
          </div>
        )}
      </div>
    </section>
  );
}
export function MarginResults({
  input,
  goals,
  selected,
  mode,
  onSelect,
  onRemove,
}: {
  input: PricingInput;
  goals: number[];
  selected: number;
  mode: "sale" | "target";
  onSelect: (n: number) => void;
  onRemove: (n: number) => void;
}) {
  return (
    <section className="panel margins-panel">
      <h2>Quanto vender para lucrar?</h2>
      <p>
        Margem desejada sobre o preço de venda. O envio é recalculado para cada
        preço. A comissão também verifica a faixa especial quando o benefício da
        categoria está habilitado.
      </p>
      {goals.map(g => {
        const t = solveTarget(input, g);
        return (
          <div
            style={{ display: "flex", gap: 4, alignItems: "center" }}
            key={g}
          >
            <button
              style={{ flex: 1 }}
              className={`margin-option ${mode === "target" && selected === g ? "active" : ""}`}
              onClick={() => onSelect(g)}
            >
              <span className="goal-tag">{percent(g)}</span>
              <span className="target-price">
                {t.price !== null ? money(t.price) : "—"}
                <small>
                  {t.error ||
                    (t.result
                      ? `Comissão ${percent(t.result.rate)} · estimado`
                      : "Preço mínimo estimado")}
                </small>
              </span>
              <span className="target-profit">
                {t.result ? money(t.result.profit) : "—"}
                <small>de lucro</small>
              </span>
            </button>
            {![10, 15, 20].includes(g) && (
              <button
                aria-label={`Remover margem ${g}%`}
                className="link-button"
                onClick={() => onRemove(g)}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
export function CompareResults({
  input,
  goal,
}: {
  input: PricingInput;
  goal: number;
}) {
  return (
    <section className="panel margins-panel">
      <h2>Clássico ou Premium?</h2>
      <p>
        Preço para a mesma margem de {percent(goal)}. A comissão precisa ser
        confirmada na sua categoria.
      </p>
      <div className="compare-row">
        {(["classic", "premium"] as const).map(l => {
          const s = solveTarget(input, goal, l);
          return (
            <div className="compare-cell" key={l}>
              <span>
                {l === "classic" ? "Clássico" : "Premium"} ·{" "}
                {s.result ? percent(s.result.rate) : "—"}
              </span>
              <strong>{s.price !== null ? money(s.price) : "—"}</strong>
              <small>
                {s.result
                  ? `${money(s.result.profit)} de lucro`
                  : "Confira as entradas"}
              </small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
