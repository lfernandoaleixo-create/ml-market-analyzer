import { Tag } from "lucide-react";

/**
 * Referência de preço — placeholder.
 * Estrutura inicial aguardando as regras de negócio que o Fernando vai explicar.
 */
export default function ReferenciaPreco() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-600">
        <Tag className="h-7 w-7" />
      </div>
      <h3 className="mt-4 font-display text-lg tracking-tight">Referência de preço</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Em preparação. Esta ferramenta vai ajudar a definir um preço de referência
        com base no mercado. Assim que as regras forem definidas, ela será construída aqui.
      </p>
    </div>
  );
}
