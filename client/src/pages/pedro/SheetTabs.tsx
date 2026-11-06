import { useLocation } from "wouter";
import { Package, Table2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PACKAGING_SHEET_PATH, SKU_SHEET_PATH } from "@shared/mercatoNavigation";

/**
 * Abas internas do tópico principal Planilha SKU: Produtos | Embalagens.
 * Mantêm as planilhas existentes sem passar pelo cronograma E-commerce.
 */
type TabDef = { label: string; path: string; icon: LucideIcon };

const TABS: TabDef[] = [
  { label: "Produtos", path: SKU_SHEET_PATH, icon: Table2 },
  { label: "Embalagens", path: PACKAGING_SHEET_PATH, icon: Package },
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
