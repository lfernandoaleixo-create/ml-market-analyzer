import { PageShell, PageHeader } from "@/components/account/AccountUI";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { Calculator, Scale, Tag, ListChecks, Globe, History, ArrowLeft, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import PrecificacaoCalc from "@/components/calculadora/PrecificacaoCalc";
import PontoEquilibrioCalc from "@/components/calculadora/PontoEquilibrioCalc";
import ReferenciaPreco from "@/components/calculadora/ReferenciaPreco";
import AnunciosAtivos from "@/components/calculadora/AnunciosAtivos";
import CustoAlvoCalc from "@/components/calculadora/CustoAlvoCalc";
import HistoricoPrecos from "@/components/calculadora/HistoricoPrecos";

type ModelKey =
  | "precificacao"
  | "custo-alvo"
  | "ponto-equilibrio"
  | "referencia-preco"
  | "anuncios-ativos"
  | "historico";

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
    tagline: "Quanto posso pagar pelo produto",
    description:
      "Informe o preço de venda no Mercado Livre e as margens desejadas. Descontando impostos, comissão, frete e toda a logística, mostramos o custo máximo que você pode pagar pelo produto — em Real, Dólar e Yuan, com câmbio em tempo real.",
    bullets: [
      "Preço de venda → custo máximo do produto",
      "Várias margens ao mesmo tempo (livres)",
      "Conversor R$ / US$ / ¥ em tempo real",
    ],
    icon: Globe,
    accent: "bg-rose-500/12 text-rose-600",
  },
  {
    key: "ponto-equilibrio",
    path: "/calculadora/ponto-equilibrio",
    title: "Ponto de Equilíbrio",
    tagline: "Quanto vender para não ter prejuízo",
    description:
      "Calcule a receita e o número de unidades que você precisa vender no mês para cobrir todos os custos fixos e variáveis. Veja a margem de contribuição, o lucro atual e cenários de venda.",
    bullets: [
      "Margem de contribuição (R$ e %)",
      "Ponto de equilíbrio em R$ e em unidades",
      "Cenários: atual, −10% e +10%",
    ],
    icon: Scale,
    accent: "bg-emerald-500/12 text-emerald-600",
  },
  {
    key: "referencia-preco",
    path: "/calculadora/referencia-preco",
    title: "Referência de preço",
    tagline: "Preço de referência de mercado",
    description:
      "Defina um preço de referência com base no mercado. Em preparação — as regras serão definidas em seguida.",
    bullets: [
      "Referência de preço de mercado",
      "Apoio à decisão de precificação",
      "Em preparação",
    ],
    icon: Tag,
    accent: "bg-amber-500/12 text-amber-600",
  },
  {
    key: "anuncios-ativos",
    path: "/calculadora/anuncios-ativos",
    title: "Anúncios ativos",
    tagline: "Seus anúncios ativos do ML",
    description:
      "Somente anúncios com status ativo, enriquecidos com o custo vindo do Baselinker. Veja o lucro e a margem real de cada anúncio e simule o preço para atingir margens-alvo.",
    bullets: [
      "Custo automático via Baselinker (por SKU)",
      "Lucro e margem real por anúncio",
      "3 colunas de simulação de margem + seletor de colunas",
    ],
    icon: ListChecks,
    accent: "bg-sky-500/12 text-sky-600",
  },
  {
    key: "historico",
    path: "/calculadora/historico",
    title: "Histórico",
    tagline: "Suas simulações salvas",
    description:
      "Registro das simulações de custo-alvo que você salvar, para não se perder nas reuniões. Consulte por produto, preço de venda, margens testadas e o custo máximo em R$, US$ e ¥.",
    bullets: [
      "Histórico por produto e SKU",
      "Margens e custo-alvo em 3 moedas",
      "Busca e exclusão de registros",
    ],
    icon: History,
    accent: "bg-violet-500/12 text-violet-600",
  },
];

/** Renderiza o componente do modelo ativo. */
function ModelView({ modelKey }: { modelKey: ModelKey }) {
  switch (modelKey) {
    case "precificacao":
      return <PrecificacaoCalc />;
    case "ponto-equilibrio":
      return <PontoEquilibrioCalc />;
    case "referencia-preco":
      return <ReferenciaPreco />;
    case "anuncios-ativos":
      return <AnunciosAtivos />;
    case "custo-alvo":
      return <CustoAlvoCalc />;
    case "historico":
      return <HistoricoPrecos />;
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
