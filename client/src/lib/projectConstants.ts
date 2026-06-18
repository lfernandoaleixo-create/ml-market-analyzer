export const STEP_LABELS: Record<string, string> = {
  fornecedor: "Fornecedor",
  amostra: "Amostra",
  aprovacao: "Aprovação",
  embalagem: "Embalagem / Marca Própria",
  pedido: "Pedido",
  producao: "Produção",
  inspecao: "Inspeção",
  embarque: "Embarque",
  chegada: "Chegada",
  lancamento: "Lançamento",
};

export const STEP_ORDER = [
  "fornecedor",
  "amostra",
  "aprovacao",
  "embalagem",
  "pedido",
  "producao",
  "inspecao",
  "embarque",
  "chegada",
  "lancamento",
] as const;

export type StepKey = (typeof STEP_ORDER)[number];

export const PRIORITY_LABELS: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em Andamento",
  concluido: "Concluído",
};

export const STEP_ICONS: Record<string, string> = {
  fornecedor: "🏭",
  amostra: "🔬",
  aprovacao: "✅",
  embalagem: "📦",
  pedido: "🛒",
  producao: "⚙️",
  inspecao: "🔍",
  embarque: "🚢",
  chegada: "🏠",
  lancamento: "🚀",
};

// Tokens de cor por prioridade — usando a paleta do Mercato.
export const PRIORITY_BADGE: Record<string, string> = {
  alta: "bg-destructive/10 text-destructive border-destructive/20",
  media: "bg-warning/10 text-warning border-warning/20",
  baixa: "bg-primary/10 text-primary border-primary/20",
};
