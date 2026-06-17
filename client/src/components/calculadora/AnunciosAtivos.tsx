import { ListChecks } from "lucide-react";

/**
 * Anúncios ativos — placeholder.
 * Estrutura inicial aguardando as regras de negócio que o Fernando vai explicar.
 */
export default function AnunciosAtivos() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-600">
        <ListChecks className="h-7 w-7" />
      </div>
      <h3 className="mt-4 font-display text-lg tracking-tight">Anúncios ativos</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Em preparação. Esta ferramenta vai trabalhar com os seus anúncios ativos do
        Mercado Livre. Assim que as regras forem definidas, ela será construída aqui.
      </p>
    </div>
  );
}
