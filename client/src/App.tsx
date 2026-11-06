import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Painel from "./pages/Painel";
import Vendas from "./pages/Vendas";
import Anuncios from "./pages/Anuncios";
import Ads from "./pages/Ads";
import Calculadora from "./pages/Calculadora";
import Diagnostico from "./pages/Diagnostico";
import Configuracoes from "./pages/Configuracoes";
import Projeto from "./pages/project/Projeto";
import SkuSheet from "./pages/pedro/SkuSheet";
import EmbalagemSheet from "./pages/pedro/EmbalagemSheet";
import {
  LEGACY_MERCATO_ROUTES,
  PACKAGING_SHEET_PATH,
  resolveLegacyMercatoPath,
  SKU_SHEET_PATH,
} from "@shared/mercatoNavigation";

function LegacyMercatoRedirect() {
  const [location] = useLocation();
  return <Redirect to={resolveLegacyMercatoPath(location) ?? "/"} replace />;
}

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Painel} />
        <Route path="/vendas" component={Vendas} />
        <Route path="/anuncios" component={Anuncios} />
        <Route path="/ads" component={Ads} />
        <Route path="/calculadora" component={Calculadora} />
        <Route path="/calculadora/precificacao" component={Calculadora} />
        <Route path="/calculadora/ponto-equilibrio" component={Calculadora} />
        <Route path="/calculadora/referencia-preco" component={Calculadora} />
        <Route path="/calculadora/anuncios-ativos" component={Calculadora} />
        <Route path="/calculadora/custo-alvo" component={Calculadora} />
        <Route path="/diagnostico" component={Diagnostico} />
        <Route path="/projeto" component={Projeto} />
        <Route path="/projeto/timeline" component={Projeto} />
        <Route path="/projeto/analise" component={Projeto} />
        <Route path="/projeto/produto/:id" component={Projeto} />
        <Route path={SKU_SHEET_PATH} component={SkuSheet} />
        <Route path={PACKAGING_SHEET_PATH} component={EmbalagemSheet} />
        {LEGACY_MERCATO_ROUTES.map((path) => (
          <Route key={path} path={path} component={LegacyMercatoRedirect} />
        ))}
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
