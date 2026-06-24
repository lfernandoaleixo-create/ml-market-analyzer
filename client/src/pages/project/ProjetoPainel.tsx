import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { STEP_LABELS, STEP_ORDER } from "@/lib/projectConstants";
import { useState, useEffect } from "react";
import { useGuestName } from "@/hooks/useGuestName";
import { GuestNameDialog } from "@/components/project/GuestNameDialog";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Search, Plus, LayoutGrid, List, Loader2, X, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import ProjectProductCard from "@/components/project/ProjectProductCard";

export default function ProjetoPainel({ basePath = "/projeto" }: { basePath?: string } = {}) {
  const { isAuthenticated } = useAuth();
  const { guestName, setGuestName } = useGuestName();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("todos");
  const [currentStep, setCurrentStep] = useState("todos");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showGuestNameDialog, setShowGuestNameDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [newName, setNewName] = useState("");
  const [newPriority, setNewPriority] = useState<"alta" | "media" | "baixa">("media");
  const [creating, setCreating] = useState(false);

  const { data: products, isLoading, refetch } = trpc.project.products.list.useQuery(
    {
      search: search || undefined,
      priority: priority || undefined,
      currentStep: currentStep || undefined,
    },
    { refetchOnWindowFocus: true },
  );

  const createMutation = trpc.project.products.create.useMutation({
    onSuccess: () => {
      toast.success("Produto criado com sucesso!");
      setShowNewProduct(false);
      setNewName("");
      setNewPriority("media");
      refetch();
    },
    onError: () => toast.error("Erro ao criar produto"),
  });

  const requireGuestName = (action: () => void) => {
    if (isAuthenticated || guestName) action();
    else {
      setPendingAction(() => action);
      setShowGuestNameDialog(true);
    }
  };

  const handleGuestNameConfirm = (name: string) => {
    setGuestName(name);
    setShowGuestNameDialog(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createMutation.mutateAsync({ name: newName.trim(), priority: newPriority });
    } finally {
      setCreating(false);
    }
  };

  const totalProducts = products?.length ?? 0;
  const altaCount = products?.filter((p) => p.priority === "alta").length ?? 0;
  // Coerente com a régua de etapas concluídas: em andamento = 1..9 concluídas; lançado = 10/10.
  const totalSteps = STEP_ORDER.length;
  const launchedCount =
    products?.filter((p) => (p.completedCount ?? 0) >= totalSteps).length ?? 0;
  const inProgressCount =
    products?.filter((p) => {
      const c = p.completedCount ?? 0;
      return c > 0 && c < totalSteps;
    }).length ?? 0;

  const stats = [
    { label: "Total de Produtos", value: totalProducts, accent: "text-primary" },
    { label: "Prioridade Alta", value: altaCount, accent: "text-destructive" },
    { label: "Em Andamento", value: inProgressCount, accent: "text-warning" },
    { label: "Lançados", value: launchedCount, accent: "text-success" },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-display font-semibold text-foreground">Painel de Produtos</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Acompanhe o pipeline de importação da sua equipe
          </p>
        </div>
        <Button
          onClick={() => requireGuestName(() => setShowNewProduct(true))}
          className="gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novo Produto
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl p-4 bg-card card-soft">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {stat.label}
            </span>
            <p className={`text-2xl font-semibold font-display mt-2 ${stat.accent}`}>
              {isLoading ? "—" : stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as prioridades</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>

        <Select value={currentStep} onValueChange={setCurrentStep}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Etapa atual" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as etapas</SelectItem>
            {STEP_ORDER.map((step) => (
              <SelectItem key={step} value={step}>
                {STEP_LABELS[step]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(search || priority !== "todos" || currentStep !== "todos") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setPriority("todos");
              setCurrentStep("todos");
            }}
            className="text-muted-foreground gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Limpar filtros
          </Button>
        )}

        <div className="ml-auto flex items-center gap-1 p-1 rounded-lg bg-muted">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid / list */}
      {isLoading ? (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              : "flex flex-col gap-3"
          }
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl h-48 bg-muted animate-pulse" />
          ))}
        </div>
      ) : products && products.length > 0 ? (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              : "flex flex-col gap-3"
          }
        >
          {products.map((product) => (
            <ProjectProductCard
              key={product.id}
              product={product}
              viewMode={viewMode}
              onClick={() => setLocation(`${basePath}/produto/${product.id}`)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum produto encontrado</h3>
          <p className="text-muted-foreground text-sm mb-6">
            {search || priority !== "todos" || currentStep !== "todos"
              ? "Tente ajustar os filtros de busca."
              : "Adicione o primeiro produto ao portfólio."}
          </p>
          {!search && priority === "todos" && currentStep === "todos" && (
            <Button onClick={() => requireGuestName(() => setShowNewProduct(true))} className="gap-2">
              <Plus className="w-4 h-4" />
              Adicionar Produto
            </Button>
          )}
        </div>
      )}

      <GuestNameDialog
        open={showGuestNameDialog}
        onConfirm={handleGuestNameConfirm}
        onCancel={() => {
          setShowGuestNameDialog(false);
          setPendingAction(null);
        }}
      />

      <Dialog open={showNewProduct} onOpenChange={setShowNewProduct}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Novo Produto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Nome do Produto
              </label>
              <Input
                placeholder="Ex: Garrafa Térmica Premium"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Prioridade</label>
              <Select value={newPriority} onValueChange={(v) => setNewPriority(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-card" onClick={() => setShowNewProduct(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar Produto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
