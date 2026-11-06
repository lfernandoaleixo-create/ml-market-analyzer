import { useState } from "react";
import { Info, LockKeyhole } from "lucide-react";
import type { PricingInput } from "@shared/alpha/pricing";
import { isAlphaProfile } from "@shared/alpha/alphaProfile";
import { SHIPPING_METHODS } from "@shared/alpha/shippingMethods";

const reputationNames: Record<string, string> = {
  green: "Verde",
  new: "Sem reputação",
  yellow: "Amarela",
  red: "Laranja / vermelha",
};

export function AlphaProfileFields({
  input,
  onUseAlpha,
}: {
  input: PricingInput;
  onUseAlpha: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const legacy = !isAlphaProfile(input);
  return (
    <>
      <div className="field-row">
        <div className="field">
          <span className="field-label">
            Forma de envio <span className="optional">Fixa</span>
          </span>
          <button
            type="button"
            aria-label="Explicação da Agência"
            aria-expanded={helpOpen}
            onClick={() => setHelpOpen(value => !value)}
            title={SHIPPING_METHODS.agency.explanation}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-[#d8cde4] bg-[#faf7fd] px-3 py-2.5 text-left text-sm font-semibold text-[#57416e]"
          >
            <span>Agência</span>
            <Info size={15} className="shrink-0" />
          </button>
        </div>
        <div className="field">
          <span className="field-label">
            Reputação <span className="optional">Fixa</span>
          </span>
          <div
            aria-label="Reputação verde fixa"
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[#bedbcf] bg-[#f2faf6] px-3 py-2.5 text-sm font-semibold text-[#237457]"
          >
            <span>Verde</span>
            <LockKeyhole size={14} className="shrink-0" />
          </div>
        </div>
      </div>
      {helpOpen && (
        <div className="mb-4 rounded-xl border border-[#e7d895] bg-[#fffbed] p-3 text-xs leading-relaxed text-[#71602c]">
          <strong className="mb-1 block">Agência</strong>
          {SHIPPING_METHODS.agency.explanation}
          <span className="mt-2 block font-semibold">
            {SHIPPING_METHODS.agency.correiosNote}
          </span>
        </div>
      )}
      {legacy && (
        <div className="callout warning mb-4" role="status">
          <div>
            <strong>Cadastro com perfil anterior</strong>
            <p className="!mt-1 !text-xs">
              Logística{" "}
              {SHIPPING_METHODS[input.logistic]?.shortLabel || input.logistic} ·
              reputação {reputationNames[input.reputation] || input.reputation}.
              Os cálculos atuais preservam esse perfil; o fluxograma compara
              Agência e Verde. Nenhum cadastro é alterado ao abrir.
            </p>
            <button
              type="button"
              className="link-button !mt-2"
              onClick={onUseAlpha}
            >
              Aplicar Agência e Verde à calculadora
            </button>
          </div>
        </div>
      )}
    </>
  );
}
