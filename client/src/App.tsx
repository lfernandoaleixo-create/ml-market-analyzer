import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Painel from "./pages/Painel";
import Vendas from "./pages/Vendas";
import Anuncios from "./pages/Anuncios";
import Ads from "./pages/Ads";
import Lucratividade from "./pages/Lucratividade";
import Calculadora from "./pages/Calculadora";
import PosVenda from "./pages/PosVenda";
import Reputacao from "./pages/Reputacao";
import RadarConcorrentes from "./pages/RadarConcorrentes";
import Diagnostico from "./pages/Diagnostico";
import Buscar from "./pages/Buscar";
import MaisVendidos from "./pages/MaisVendidos";
import Oportunidades from "./pages/Oportunidades";
import Comparar from "./pages/Comparar";
import Categorias from "./pages/Categorias";
import Monitoramento from "./pages/Monitoramento";
import Alertas from "./pages/Alertas";
import Configuracoes from "./pages/Configuracoes";
import Projeto from "./pages/project/Projeto";
import LuisTimelineContainer from "./pages/luis/LuisTimelineContainer";
import PedroTimelineContainer from "./pages/pedro/PedroTimelineContainer";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Painel} />
        <Route path="/vendas" component={Vendas} />
        <Route path="/anuncios" component={Anuncios} />
        <Route path="/ads" component={Ads} />
        <Route path="/lucratividade" component={Lucratividade} />
        <Route path="/calculadora" component={Calculadora} />
        <Route path="/calculadora/precificacao" component={Calculadora} />
        <Route path="/calculadora/ponto-equilibrio" component={Calculadora} />
        <Route path="/calculadora/referencia-preco" component={Calculadora} />
        <Route path="/calculadora/anuncios-ativos" component={Calculadora} />
        <Route path="/calculadora/custo-alvo" component={Calculadora} />
        <Route path="/pos-venda" component={PosVenda} />
        <Route path="/reputacao" component={Reputacao} />
        <Route path="/radar" component={RadarConcorrentes} />
        <Route path="/diagnostico" component={Diagnostico} />
        <Route path="/buscar" component={Buscar} />
        <Route path="/mais-vendidos" component={MaisVendidos} />
        <Route path="/oportunidades" component={Oportunidades} />
        <Route path="/comparar" component={Comparar} />
        <Route path="/categorias" component={Categorias} />
        <Route path="/monitoramento" component={Monitoramento} />
        <Route path="/alertas" component={Alertas} />
        <Route path="/projeto" component={Projeto} />
        <Route path="/projeto/timeline" component={Projeto} />
        <Route path="/projeto/analise" component={Projeto} />
        <Route path="/projeto/produto/:id" component={Projeto} />
        <Route path="/luis-timeline" component={LuisTimelineContainer} />
        <Route path="/luis-timeline/timeline" component={LuisTimelineContainer} />
        <Route path="/luis-timeline/analise" component={LuisTimelineContainer} />
        <Route path="/luis-timeline/produto/:id" component={LuisTimelineContainer} />
        <Route path="/pedro-timeline" component={PedroTimelineContainer} />
        <Route path="/pedro-timeline/timeline" component={PedroTimelineContainer} />
        <Route path="/pedro-timeline/analise" component={PedroTimelineContainer} />
        <Route path="/pedro-timeline/produto/:id" component={PedroTimelineContainer} />
        <Route path="/pedro-timeline/planilha-sku" component={PedroTimelineContainer} />
        <Route path="/pedro-timeline/kits" component={PedroTimelineContainer} />
        <Route path="/pedro-timeline/embalagens" component={PedroTimelineContainer} />
        <Route path="/configuracoes" component={Configuracoes} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
