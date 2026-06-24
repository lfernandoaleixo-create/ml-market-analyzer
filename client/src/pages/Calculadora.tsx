import { PageShell, PageHeader } from "@/components/account/AccountUI";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { Calculator, Globe, ArrowLeft, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import PrecificacaoCalc from "@/components/calculadora/PrecificacaoCalc";
import CustoAlvoCalc from "@/components/calculadora/CustoAlvoCalc";

type ModelKey =
  | "precificacao"
  | "custo-alvo";

type Model = {
  key: ModelKey;
  path: string;
  title: string;
  tagline: string;
  description: string;
  bullets: string[];
  icon: LucideIcon;
  accent: string; // tailwind classes for the icon tile
};

const MODELS: Model[] = [
  {
    key: "precificacao",
    path: "/calculadora/precificacao",
    title: "Calculadora de Precificação",
    tagline: "Quanto cobrar por um produto",
    description:
      "Descubra o preço de venda ideal a partir do custo, impostos, comissão do marketplace, frete e a margem de lucro que você quer. Funciona também no sentido inverso: informe o preço e veja a margem real.",
    bullets: [
      "Custo → preço ou preço → margem",
      "Mercado Livre (Clássico/Premium), Shopee e outros",
      "Distribuição da receita e break-even",
    ],
    icon: Calculator,
    accent: "bg-primary/12 text-primary",
  },
  {
    key: "custo-alvo",
    path: "/calculadora/custo-alvo",
    title: "Preço a ser pago para a Matriz",
    tagline: "Planilha de preço por margem",
    description:
      "Planilha estilo Excel: cada produto é uma linha, cada margem é uma coluna. Você informa o preço de venda no ML que dá a margem âncora (20%); o sistema deriva o custo fixo a pagar à Matriz e calcula o preço de venda necessário para cada outra margem. Os controles globais (COM/SEM TTS e Clássico/Premium) recalculam toda a planilha de uma vez.",
    bullets: [
      "Linhas = produtos · colunas = margens",
      "Controles globais COM/SEM TTS e Clássico/Premium",
      "Nome de produto único, sem duplicatas",
    ],
    icon: Globe,
    accent: "bg-rose-500/12 text-rose-600",
  },
];

/** Renderiza o componente do modelo ativo. */
function ModelView({ modelKey }: { modelKey: ModelKey }) {
  switch (modelKey) {
    case "precificacao":
      return <PrecificacaoCalc />;
    case "custo-alvo":
      return <CustoAlvoCalc />;
    default:
      return null;
  }
}

/** Card clicável de seleção de modelo. */
function ModelCard({ model, onSelect }: { model: Model; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex h-full flex-col rounded-2xl border border-border bg-card p-6 text-left",
        "transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "active:scale-[0.99]",
      )}
    >
      <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", model.accent)}>
        <model.icon className="h-6 w-6" />
      </div>
      <div className="mt-4 space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {model.tagline}
        </p>
        <h3 className="font-display text-lg tracking-tight">{model.title}</h3>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{model.description}</p>
      <ul className="mt-4 space-y-1.5">
        {model.bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
            {b}
          </li>
        ))}
      </ul>
      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        Abrir calculadora
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

export default function Calculadora() {
  const [location, setLocation] = useLocation();

  const active = MODELS.find((m) => location === m.path);

  // ----- Tela de um modelo específico -----
  if (active) {
    return (
      <PageShell>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setLocation("/calculadora")}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Calculadoras
          </button>
        </div>
        <PageHeader
          title={active.title}
          subtitle={active.description}
        />
        {/* Alternador rápido entre os modelos */}
        <div className="flex flex-wrap gap-2">
          {MODELS.map((m) => (
            <Button
              key={m.key}
              variant={m.key === active.key ? "default" : "outline"}
              size="sm"
              onClick={() => setLocation(m.path)}
              className={m.key === active.key ? "" : "bg-card"}
            >
              <m.icon className="h-4 w-4" />
              {m.title}
            </Button>
          ))}
        </div>

        <ModelView modelKey={active.key} />
      </PageShell>
    );
  }

  // ----- Hub de seleção -----
  return (
    <PageShell>
      <PageHeader
        title="Calculadoras"
        subtitle="Escolha a calculadora que você precisa. As ferramentas usam apenas os dados que você informar — nada é enviado para fora."
      />
      <div className="grid gap-5 md:grid-cols-2">
        {MODELS.map((m) => (
          <ModelCard key={m.key} model={m} onSelect={() => setLocation(m.path)} />
        ))}
      </div>
    </PageShell>
  );
}
