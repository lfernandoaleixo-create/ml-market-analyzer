import { useLocation, useRoute, Route, Switch } from "wouter";
import { LayoutGrid, GitBranch, BarChart3 } from "lucide-react";
import ProjetoPainel from "../project/ProjetoPainel";
import ProjetoAnalise from "../project/ProjetoAnalise";
import ProjetoProduto from "../project/ProjetoProduto";
import PedroTimeline from "./PedroTimeline";

const TABS = [
  { label: "Painel", path: "/pedro-timeline", icon: LayoutGrid },
  { label: "Cronograma", path: "/pedro-timeline/timeline", icon: GitBranch },
  { label: "Análise", path: "/pedro-timeline/analise", icon: BarChart3 },
];

export default function PedroTimelineContainer() {
  const [location, setLocation] = useLocation();
  // A ficha do produto ocupa a tela inteira (sem as abas de navegação).
  const [isDetail] = useRoute("/pedro-timeline/produto/:id");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold text-foreground">Linha do Tempo Pedro</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Pipeline do Pedro — etapas personalizáveis com status e observações por produto
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
        <Route path="/pedro-timeline">{() => <ProjetoPainel basePath="/pedro-timeline" ns="pedro" />}</Route>
        <Route path="/pedro-timeline/timeline" component={PedroTimeline} />
        <Route path="/pedro-timeline/analise">{() => <ProjetoAnalise basePath="/pedro-timeline" ns="pedro" />}</Route>
        <Route path="/pedro-timeline/produto/:id">{() => <ProjetoProduto basePath="/pedro-timeline" ns="pedro" />}</Route>
      </Switch>
    </div>
  );
}
