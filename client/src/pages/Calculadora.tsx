import {
  PageShell,
  PageHeader,
  SectionCard,
} from "@/components/account/AccountUI";
import { Calculator } from "lucide-react";

/**
 * Calculadora de Precificação.
 *
 * Estrutura inicial (placeholder). A lógica completa será construída assim que
 * o Fernando definir como o sistema deve funcionar (campos de entrada, regras
 * de cálculo, impostos/comissão/frete, margem-alvo, etc.).
 */
export default function Calculadora() {
  return (
    <PageShell>
      <PageHeader
        title="Calculadora de Precificação"
        subtitle="Defina o preço de venda ideal para cada produto a partir de custo, impostos, comissão do Mercado Livre, frete e margem desejada."
      />

      <SectionCard
        title="Em preparação"
        description="A estrutura desta aba já está pronta. O cálculo será montado conforme as regras que você definir."
      >
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Calculator className="h-8 w-8" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="font-display text-lg tracking-tight">
              Calculadora de Precificação
            </h3>
            <p className="text-sm text-muted-foreground">
              Aba criada e disponível no menu. Me mostre como o sistema deve
              funcionar (quais valores entram, como o preço é calculado e o que
              deve aparecer na tela) que eu construo a lógica completa aqui.
            </p>
          </div>
        </div>
      </SectionCard>
    </PageShell>
  );
}
