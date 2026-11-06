import { useId } from "react";
import type { FreeShippingControlState } from "@shared/alpha/freeShippingControl";

const formatBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function FreeShippingSwitch({
  state,
  onChange,
  mode = "target",
}: {
  state: FreeShippingControlState;
  onChange: (enabled: boolean) => void;
  mode?: "target" | "sale";
}) {
  const titleId = useId();
  const detailsId = useId();
  const isMandatory = state.kind === "mandatory";
  const isUnavailable = state.kind === "unavailable";
  const title = isMandatory
    ? "Frete grátis obrigatório"
    : isUnavailable
      ? "Frete grátis — verificar condições"
      : "Frete grátis rápido (opcional)";
  const status = isMandatory
    ? "Obrigatório · a partir de R$79"
    : isUnavailable
      ? "Indisponível"
      : state.checked
        ? "Com frete grátis"
        : "Sem oferta rápida";

  const handleClick = () => {
    if (state.canToggle) onChange(!state.checked);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={state.checked}
      aria-labelledby={titleId}
      aria-describedby={detailsId}
      disabled={!state.canToggle}
      onClick={handleClick}
      className={`my-4 flex min-h-[44px] w-full min-w-0 touch-manipulation items-center gap-4 rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60418a] disabled:cursor-not-allowed disabled:opacity-100 ${
        state.checked
          ? "border-[#b7dfc7] bg-[#f2fbf5]"
          : "border-[#e2e3e7] bg-[#f8f8fa]"
      }`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          id={titleId}
          className="min-w-0 text-sm font-semibold leading-5 text-[#2f2940]"
        >
          {title}
        </span>
        <span
          id={detailsId}
          className="min-w-0 text-xs leading-4 text-[#686572]"
        >
          <span
            className={
              isMandatory || (state.kind === "optional" && state.checked)
                ? "font-semibold text-[#197346]"
                : "font-semibold text-[#686572]"
            }
          >
            {status}
          </span>
          {state.reason && (
            <span className="mt-1 block break-words">{state.reason}</span>
          )}
          {state.kind === "optional" && !state.sameCost && (
            <span className="mt-1 flex flex-col gap-0.5 break-words">
              {mode === "sale" ? (
                <>
                  <span>
                    Preço manual {formatBRL.format(state.without.price)}
                  </span>
                  <span>
                    Sem oferta: frete {formatBRL.format(state.without.shipping)}
                    {" · "}lucro {formatBRL.format(state.without.profit)}
                  </span>
                  <span>
                    Com oferta: frete{" "}
                    {formatBRL.format(state.withFree.shipping)}
                    {" · "}lucro {formatBRL.format(state.withFree.profit)}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    Sem oferta: preço-alvo{" "}
                    {formatBRL.format(state.without.price)}
                    {" · "}frete {formatBRL.format(state.without.shipping)}
                  </span>
                  <span>
                    Com oferta: preço-alvo{" "}
                    {formatBRL.format(state.withFree.price)}
                    {" · "}frete {formatBRL.format(state.withFree.shipping)}
                  </span>
                </>
              )}
            </span>
          )}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`relative flex h-7 w-12 shrink-0 items-center rounded-full border p-[3px] transition-colors ${
          state.checked
            ? "border-[#208854] bg-[#208854]"
            : "border-[#c4c6cb] bg-[#c4c6cb]"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            state.checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
