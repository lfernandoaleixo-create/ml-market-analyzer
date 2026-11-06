import type { Logistic } from "./pricing";

export interface ShippingMethodHelp {
  label: string;
  shortLabel: string;
  quickHelp: string;
  explanation: string;
  correiosNote?: string;
}

export const SHIPPING_METHOD_ORDER: readonly Logistic[] = [
  "agency",
  "collection",
  "full",
  "flex",
  "other",
];

/** Informational labels only. These do not change quote eligibility or costs. */
export const SHIPPING_METHODS: Record<Logistic, ShippingMethodHelp> = {
  agency: {
    label: "Agência",
    shortLabel: "Agência",
    quickHelp: "Poste com a etiqueta do Mercado Livre.",
    explanation:
      "Você leva o pacote aos Correios ou ao ponto indicado, usando a etiqueta ou o código de postagem gerado pelo Mercado Livre.",
    correiosNote: "Correios com etiqueta do Mercado Livre = Agência.",
  },
  collection: {
    label: "Coleta — retirada no seu endereço",
    shortLabel: "Coleta",
    quickHelp: "O Mercado Livre retira os pacotes com você.",
    explanation:
      "O Mercado Livre retira os pacotes no endereço do vendedor. Escolha se sua conta já tem essa coleta disponível.",
  },
  full: {
    label: "Full — estoque no Mercado Livre",
    shortLabel: "Full",
    quickHelp: "O estoque já fica no Mercado Livre.",
    explanation:
      "Os produtos ficam no centro de distribuição do Mercado Livre, que prepara e envia os pedidos. Não é levar cada venda a uma agência.",
  },
  flex: {
    label: "Flex — entrega local",
    shortLabel: "Flex",
    quickHelp: "Você ou um entregador faz a entrega local.",
    explanation:
      "Entrega local feita por você ou por um entregador contratado. A calculadora não tem cotação automática para essa operação.",
  },
  other: {
    label: "Outro — envio contratado por você",
    shortLabel: "Outro / envio próprio",
    quickHelp: "Frete contratado fora do Mercado Envios.",
    explanation:
      "Você contrata o transporte por fora do Mercado Envios. Inclui PAC ou SEDEX pago diretamente nos Correios, sem etiqueta do Mercado Livre. Sem cotação automática na calculadora.",
    correiosNote: "PAC/SEDEX contratado direto nos Correios = Outro.",
  },
};

export function isShippingMethod(value: string): value is Logistic {
  return SHIPPING_METHOD_ORDER.includes(value as Logistic);
}
