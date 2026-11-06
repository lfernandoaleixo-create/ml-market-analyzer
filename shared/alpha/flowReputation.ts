import type { Reputation } from "./pricing";

export const FLOW_REPUTATION_OPTIONS: readonly {
  value: Reputation;
  label: string;
  shortLabel: string;
  detail: string;
}[] = [
  {
    value: "green",
    label: "Verde / MercadoLíder",
    shortLabel: "Verde",
    detail: "Estimativa nas condições suportadas.",
  },
  {
    value: "new",
    label: "Sem reputação",
    shortLabel: "Sem reputação",
    detail: "Conta sem reputação; condições suportadas.",
  },
  {
    value: "yellow",
    label: "Amarela",
    shortLabel: "Amarela",
    detail: "Sem cotação automática disponível.",
  },
  {
    value: "red",
    label: "Laranja / vermelha",
    shortLabel: "Laranja / vermelha",
    detail: "Sem cotação automática disponível.",
  },
];

export function isFlowReputation(value: unknown): value is Reputation {
  return FLOW_REPUTATION_OPTIONS.some(option => option.value === value);
}

export function flowReputationLabel(value: unknown): string {
  return (
    FLOW_REPUTATION_OPTIONS.find(option => option.value === value)?.label ??
    "Não informada"
  );
}

export function flowReputationReason(
  value: Reputation | null
): string | undefined {
  if (value === null) return "Escolha uma reputação para abrir este caminho.";
  if (value === "green" || value === "new") return undefined;
  return `A reputação ${flowReputationLabel(value)} não possui tabela automática disponível. O cenário fica sem preço e frete para não inventar uma cotação.`;
}

/** Different reputations must never reuse each other's computed terminal. */
export function flowReputationCacheKey(
  inputKey: string,
  selectionKey: string,
  reputation: Reputation | null
): string {
  return `${inputKey}|reputation:${reputation ?? "missing"}|${selectionKey}`;
}

/** Hide the previous path synchronously, before effects start its replacement. */
export function flowReputationVisibleValues<T>(
  stored: { scope: string; values: Record<string, T> },
  currentScope: string
): Record<string, T> {
  return stored.scope === currentScope ? stored.values : {};
}
