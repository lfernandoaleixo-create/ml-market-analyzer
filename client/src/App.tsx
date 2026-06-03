import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Painel from "./pages/Painel";
import Buscar from "./pages/Buscar";
import MaisVendidos from "./pages/MaisVendidos";
import Oportunidades from "./pages/Oportunidades";
import Comparar from "./pages/Comparar";
import Categorias from "./pages/Categorias";
import Monitoramento from "./pages/Monitoramento";
import Alertas from "./pages/Alertas";
import Configuracoes from "./pages/Configuracoes";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Painel} />
        <Route path="/buscar" component={Buscar} />
        <Route path="/mais-vendidos" component={MaisVendidos} />
        <Route path="/oportunidades" component={Oportunidades} />
        <Route path="/comparar" component={Comparar} />
        <Route path="/categorias" component={Categorias} />
        <Route path="/monitoramento" component={Monitoramento} />
        <Route path="/alertas" component={Alertas} />
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
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
