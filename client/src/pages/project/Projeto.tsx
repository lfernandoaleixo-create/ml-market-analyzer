import { useLocation, useRoute, Route, Switch } from "wouter";
import { LayoutGrid, GitBranch, BarChart3 } from "lucide-react";
import ProjetoPainel from "./ProjetoPainel";
import ProjetoTimeline from "./ProjetoTimeline";
import ProjetoAnalise from "./ProjetoAnalise";
import ProjetoProduto from "./ProjetoProduto";

const TABS = [
  { label: "Painel", path: "/projeto", icon: LayoutGrid },
  { label: "Cronograma", path: "/projeto/timeline", icon: GitBranch },
  { label: "Análise", path: "/projeto/analise", icon: BarChart3 },
];

export default function Projeto() {
  const [location, setLocation] = useLocation();
  // A ficha do produto ocupa a tela inteira (sem as abas de navegação).
  const [isDetail] = useRoute("/projeto/produto/:id");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold text-foreground">Projeto</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Portfólio de importação — pipeline completo do fornecedor ao lançamento
        </p>
      </div>

      {!isDetail && (
        <div className="flex items-center gap-1 mb-6 border-b border-border">
          {TABS.map((tab) => {
            const active = location === tab.path;
            const Icon = tab.icon;
            return (
              <button
                key={tab.path}
                onClick={() => setLocation(tab.path)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      <Switch>
        <Route path="/projeto" component={ProjetoPainel} />
        <Route path="/projeto/timeline" component={ProjetoTimeline} />
        <Route path="/projeto/analise" component={ProjetoAnalise} />
        <Route path="/projeto/produto/:id" component={ProjetoProduto} />
      </Switch>
    </div>
  );
}
