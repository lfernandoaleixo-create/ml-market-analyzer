import { useLocation } from "wouter";
import { Boxes, Package, Table2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Abas internas da Planilha do Pedro: Produtos | Kits | Embalagens.
 * Exibidas no topo de cada uma das três planilhas, permitindo alternar
 * entre elas sem voltar para a tela da Linha do Tempo.
 */
type TabDef = { label: string; path: string; icon: LucideIcon };

const TABS: TabDef[] = [
  { label: "Produtos", path: "/pedro-timeline/planilha-sku", icon: Table2 },
  { label: "Kits", path: "/pedro-timeline/kits", icon: Boxes },
  { label: "Embalagens", path: "/pedro-timeline/embalagens", icon: Package },
];

export default function SheetTabs() {
  const [location, setLocation] = useLocation();
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 w-fit shadow-sm">
      {TABS.map((tab) => {
        const active = location === tab.path;
        const Icon = tab.icon;
        return (
          <button
            key={tab.path}
            onClick={() => setLocation(tab.path)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              active
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
