import { trpc } from "@/lib/trpc";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  CheckCircle2,
  Loader2,
  Calendar,
  Flame,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Settings2,
  ChevronDown,
  X,
  Check,
  Lightbulb,
  Rocket,
  Search,
  DollarSign,
  ShieldCheck,
  Camera,
  CheckSquare,
  Database,
  ShoppingCart,
  BarChart3,
  Circle,
  Square,
  Type as TypeIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Stage = { id: number; label: string; category: string | null; details: string | null; position: number };
type ChecklistItem = {
  id: number;
  source: "default" | "product";
  type: "checkbox" | "text";
  label: string;
  position: number;
  checked: boolean;
  textValue: string | null;
  groupName: string | null;
  groupColor: string | null;
  groupPosition: number;
};
type Step = {
  stageId: number;
  label: string;
  category: string | null;
  details: string | null;
  done: boolean;
  note: string | null;
  items: ChecklistItem[];
  hasOverride: boolean;
  itemCount: number;
  answeredCount: number;
};

// Ícone por categoria (trilha vertical, como no mockup).
const CATEGORY_ICON: Record<string, LucideIcon> = {
  "Origem": Lightbulb,
  "Briefing": Rocket,
  "Análise": Search,
  "Financeiro": DollarSign,
  "Fiscal": ShieldCheck,
  "Conteúdo": Camera,
  "Gate": CheckSquare,
  "Cadastro": Database,
  "Go-live": ShoppingCart,
  "Contínuo": BarChart3,
};
function categoryIcon(cat: string | null | undefined): LucideIcon {
  if (!cat) return Circle;
  return CATEGORY_ICON[cat] ?? Circle;
}

// Paleta de cores por categoria das etapas do Pedro (etiqueta à direita).
const CATEGORY_COLOR: Record<string, string> = {
  "Origem": "var(--muted-foreground)",
  "Briefing": "#6366f1", // indigo
  "Análise": "#0ea5e9", // sky
  "Financeiro": "#16a34a", // green
  "Fiscal": "#ca8a04", // amber
  "Conteúdo": "#db2777", // pink
  "Gate": "#9333ea", // purple
  "Cadastro": "#64748b", // slate
  "Go-live": "#ea580c", // orange
  "Contínuo": "#0d9488", // teal
};

function categoryColor(cat: string | null | undefined): string {
  if (!cat) return "var(--muted-foreground)";
  return CATEGORY_COLOR[cat] ?? "var(--muted-foreground)";
}

function CategoryTag({ category }: { category: string | null | undefined }) {
  if (!category) return null;
  const c = categoryColor(category);
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
      style={{
        color: c,
        background: `color-mix(in oklch, ${c} 14%, transparent)`,
        border: `1px solid color-mix(in oklch, ${c} 35%, transparent)`,
      }}
    >
      {category}
    </span>
  );
}
type Product = {
  id: number;
  name: string;
  priority: "alta" | "media" | "baixa";
  expectedArrival?: Date | string | null;
  supplier?: string | null;
  steps: Step[];
  completedCount: number;
  totalSteps: number;
};

const PRIORITY_STYLE: Record<string, { label: string; dot: string; bg: string; border: string; text: string }> = {
  alta: {
    label: "Alta",
    dot: "var(--destructive)",
    bg: "color-mix(in oklch, var(--destructive) 12%, transparent)",
    border: "color-mix(in oklch, var(--destructive) 35%, transparent)",
    text: "var(--destructive)",
  },
  media: {
    label: "Média",
    dot: "var(--warning)",
    bg: "color-mix(in oklch, var(--warning) 12%, transparent)",
    border: "color-mix(in oklch, var(--warning) 35%, transparent)",
    text: "var(--warning)",
  },
  baixa: {
    label: "Baixa",
    dot: "var(--primary)",
    bg: "color-mix(in oklch, var(--primary) 12%, transparent)",
    border: "color-mix(in oklch, var(--primary) 35%, transparent)",
    text: "var(--primary)",
  },
};

function getDaysLeft(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const arrival = new Date(date);
  arrival.setHours(0, 0, 0, 0);
  return Math.round((arrival.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const URGENCY = (daysLeft: number | null) => {
  if (daysLeft === null) return { label: "Sem data", color: "var(--muted-foreground)", icon: Calendar };
  if (daysLeft < 0) return { label: "Atrasado", color: "var(--destructive)", icon: AlertTriangle };
  if (daysLeft === 0) return { label: "Hoje!", color: "var(--destructive)", icon: Flame };
  if (daysLeft <= 7) return { label: `${daysLeft}d`, color: "var(--warning)", icon: Flame };
  if (daysLeft <= 30) return { label: `${daysLeft}d`, color: "var(--warning)", icon: Clock };
  return { label: `${daysLeft}d`, color: "var(--success)", icon: CheckCircle2 };
};

// ─── Gerenciador de etapas (modelo único editável) ───────────────────────────
function StagesManager({ stages }: { stages: Stage[] }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedDetailsId, setExpandedDetailsId] = useState<number | null>(null);
  const [detailsDraft, setDetailsDraft] = useState("");

  const refresh = () => {
    utils.pedroTimeline.stages.list.invalidate();
    utils.pedroTimeline.overview.invalidate();
  };

  const createMut = trpc.pedroTimeline.stages.create.useMutation({
    onSuccess: () => {
      setNewLabel("");
      refresh();
      toast.success("Etapa adicionada");
    },
    onError: () => toast.error("Não foi possível adicionar a etapa"),
  });
  const renameMut = trpc.pedroTimeline.stages.rename.useMutation({
    onSuccess: () => {
      setEditingId(null);
      refresh();
      toast.success("Etapa renomeada");
    },
    onError: () => toast.error("Não foi possível renomear"),
  });
  const deleteMut = trpc.pedroTimeline.stages.delete.useMutation({
    onSuccess: () => {
      setDeleteId(null);
      refresh();
      toast.success("Etapa removida");
    },
    onError: () => toast.error("Não foi possível remover"),
  });
  const reorderMut = trpc.pedroTimeline.stages.reorder.useMutation({
    onSuccess: refresh,
    onError: () => toast.error("Não foi possível reordenar"),
  });
  const metaMut = trpc.pedroTimeline.stages.updateMeta.useMutation({
    onSuccess: () => {
      setExpandedDetailsId(null);
      refresh();
      toast.success("Detalhes salvos");
    },
    onError: () => toast.error("Não foi possível salvar os detalhes"),
  });

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= stages.length) return;
    const ids = stages.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderMut.mutate({ orderedIds: ids });
  };

  const busy = createMut.isPending || renameMut.isPending || deleteMut.isPending || reorderMut.isPending;
  const deletingStage = stages.find((s) => s.id === deleteId);

  return (
    <div className="rounded-xl bg-card card-soft overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          <span className="font-display font-semibold text-foreground text-sm">Etapas do Pedro</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-primary/12 text-primary">
            {stages.length}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            Esta lista de etapas vale para <strong>todos os produtos</strong>. Adicione, renomeie, reordene ou remova.
          </p>

          <div className="space-y-2">
            {stages.map((stage, idx) => {
              const detailsOpen = expandedDetailsId === stage.id;
              const hasDetails = !!(stage.details && stage.details.trim().length > 0);
              return (
              <div key={stage.id} className="rounded-lg border border-border bg-background">
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-primary/12 text-primary">
                    {idx + 1}
                  </span>
                  {editingId === stage.id ? (
                    <div className="flex-1 flex items-center gap-1.5">
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="h-8"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editLabel.trim()) renameMut.mutate({ id: stage.id, label: editLabel.trim() });
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        disabled={!editLabel.trim() || busy}
                        onClick={() => renameMut.mutate({ id: stage.id, label: editLabel.trim() })}
                      >
                        <Check className="w-4 h-4 text-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditingId(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm text-foreground truncate">{stage.label}</span>
                      <CategoryTag category={stage.category} />
                      <div className="flex-1" />
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className={`h-7 px-2 text-xs ${hasDetails ? "text-primary" : "text-muted-foreground"}`}
                          onClick={() => {
                            if (detailsOpen) {
                              setExpandedDetailsId(null);
                            } else {
                              setExpandedDetailsId(stage.id);
                              setDetailsDraft(stage.details ?? "");
                            }
                          }}
                        >
                          <ChevronDown className={`w-3.5 h-3.5 mr-1 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
                          Ver detalhes
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === 0 || busy} onClick={() => move(idx, -1)}>
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === stages.length - 1 || busy} onClick={() => move(idx, 1)}>
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditingId(stage.id);
                            setEditLabel(stage.label);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(stage.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
                {detailsOpen && editingId !== stage.id && (
                  <div className="px-2.5 pb-2.5 pt-1 space-y-2 border-t border-border/60">
                    <label className="text-xs font-medium text-muted-foreground">Detalhes desta etapa</label>
                    <Textarea
                      value={detailsDraft}
                      onChange={(e) => setDetailsDraft(e.target.value)}
                      placeholder="Descreva o que deve acontecer nesta etapa (cheguei para preencher depois)."
                      className="min-h-[80px] text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-8"
                        disabled={metaMut.isPending}
                        onClick={() =>
                          metaMut.mutate({ id: stage.id, details: detailsDraft.trim() ? detailsDraft.trim() : null })
                        }
                      >
                        Salvar detalhes
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setExpandedDetailsId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
            {stages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-3">Nenhuma etapa ainda. Adicione a primeira abaixo.</p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Nova etapa (ex.: Negociação)"
              className="h-9"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newLabel.trim()) createMut.mutate({ label: newLabel.trim() });
              }}
            />
            <Button className="h-9 shrink-0" disabled={!newLabel.trim() || busy} onClick={() => createMut.mutate({ label: newLabel.trim() })}>
              <Plus className="w-4 h-4 mr-1" />
              Adicionar
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover etapa</AlertDialogTitle>
            <AlertDialogDescription>
              Remover a etapa <strong>{deletingStage?.label}</strong>? O progresso e as observações dessa etapa em
              todos os produtos também serão apagados. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteId !== null && deleteMut.mutate({ id: deleteId })}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Checklist editável de uma etapa (dentro do produto) ─────────────────────
// Cada item é checkbox ou pergunta (text). Marcar/responder salva e o backend
// auto-conclui a bolinha quando todos os itens estão respondidos.
function ChecklistEditor({
  productId,
  step,
}: {
  productId: number;
  step: Step;
}) {
  const utils = trpc.useUtils();
  const refresh = () => utils.pedroTimeline.overview.invalidate();

  // Rascunhos locais para os campos de texto (salva no blur).
  const [textDrafts, setTextDrafts] = useState<Record<number, string>>({});
  const [editMode, setEditMode] = useState(false);
  const [newType, setNewType] = useState<"checkbox" | "text">("checkbox");
  const [newLabel, setNewLabel] = useState("");

  const answerMut = trpc.pedroTimeline.answers.set.useMutation({
    onSuccess: refresh,
    onError: (e) => toast.error(e.message || "Erro ao salvar resposta"),
  });
  const startOverrideMut = trpc.pedroTimeline.productItems.startOverride.useMutation({
    onSuccess: () => {
      refresh();
      setEditMode(true);
      toast.success("Agora você edita os itens só deste produto");
    },
    onError: (e) => toast.error(e.message || "Erro ao iniciar edição"),
  });
  const createItemMut = trpc.pedroTimeline.productItems.create.useMutation({
    onSuccess: () => {
      refresh();
      setNewLabel("");
    },
    onError: (e) => toast.error(e.message || "Erro ao adicionar item"),
  });
  const deleteItemMut = trpc.pedroTimeline.productItems.delete.useMutation({
    onSuccess: refresh,
    onError: (e) => toast.error(e.message || "Erro ao remover item"),
  });
  const resetMut = trpc.pedroTimeline.productItems.reset.useMutation({
    onSuccess: () => {
      refresh();
      setEditMode(false);
      toast.success("Itens restaurados para o padrão");
    },
    onError: (e) => toast.error(e.message || "Erro ao restaurar"),
  });

  const toggleCheck = (item: ChecklistItem) => {
    answerMut.mutate({
      productId,
      stageId: step.stageId,
      itemSource: item.source,
      itemId: item.id,
      checked: !item.checked,
    });
  };
  const saveText = (item: ChecklistItem, value: string) => {
    if ((item.textValue ?? "") === value) return;
    answerMut.mutate({
      productId,
      stageId: step.stageId,
      itemSource: item.source,
      itemId: item.id,
      textValue: value,
    });
  };

  const handleEditClick = () => {
    if (editMode) {
      setEditMode(false);
      return;
    }
    // Se a etapa tem itens-padrão e ainda não foi personalizada, copia o padrão
    // para um override deste produto. Caso contrário, apenas abre o modo edição
    // (etapas sem padrão começam o override ao adicionar o primeiro item).
    if (!step.hasOverride && step.itemCount > 0) {
      startOverrideMut.mutate({ productId, stageId: step.stageId });
    } else {
      setEditMode(true);
    }
  };

  const addItem = (type: "checkbox" | "text", label: string, group?: { name: string | null; color: string | null; position: number }) => {
    const l = label.trim();
    if (!l) return;
    createItemMut.mutate({
      productId,
      stageId: step.stageId,
      type,
      label: l,
      groupName: group?.name ?? null,
      groupColor: group?.color ?? null,
      groupPosition: group?.position ?? 0,
    });
  };
  const handleAddItem = () => {
    addItem(newType, newLabel);
  };

  // Agrupa os itens por grupo (mantendo a ordem por groupPosition e position).
  const groups: { key: string; name: string | null; color: string | null; items: ChecklistItem[] }[] = [];
  const groupIndex = new Map<string, number>();
  for (const it of [...step.items].sort(
    (a, b) => a.groupPosition - b.groupPosition || a.position - b.position,
  )) {
    const key = it.groupName ?? "__none__";
    if (!groupIndex.has(key)) {
      groupIndex.set(key, groups.length);
      groups.push({ key, name: it.groupName, color: it.groupColor, items: [] });
    }
    groups[groupIndex.get(key)!].items.push(it);
  }
  const hasGroups = groups.some((g) => g.name);

  const renderItem = (item: ChecklistItem) => {
    const answered =
      item.type === "text" ? (item.textValue ?? "").trim().length > 0 : item.checked;
    return (
      <div
        key={`${item.source}:${item.id}`}
        className={`rounded-lg border p-2.5 transition-colors ${answered ? "border-green-500/50 bg-green-50/60" : "border-border/70 bg-background"}`}
      >
        <div className="flex items-start gap-2">
          {item.type === "checkbox" ? (
            <button
              type="button"
              onClick={() => toggleCheck(item)}
              className={`mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${item.checked ? "bg-green-600 border-green-600" : "bg-transparent border-border"}`}
              aria-pressed={item.checked}
            >
              {item.checked && <Check className="w-3 h-3 text-white" />}
            </button>
          ) : answered ? (
            <Check className="mt-0.5 shrink-0 w-4 h-4 text-green-600" />
          ) : (
            <TypeIcon className="mt-0.5 shrink-0 w-3.5 h-3.5 text-muted-foreground" />
          )}
          <div className="flex-1 min-w-0">
            <span
              className={`text-sm ${item.type === "checkbox" && item.checked ? "line-through text-muted-foreground" : "text-foreground font-medium"}`}
            >
              {item.label}
            </span>
            {item.type === "text" && (
              <Textarea
                value={textDrafts[item.id] ?? item.textValue ?? ""}
                onChange={(e) => setTextDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                onBlur={(e) => saveText(item, e.target.value.trim())}
                placeholder="Escreva a resposta e clique fora para salvar…"
                className="mt-1.5 min-h-[52px] text-sm resize-y bg-background"
              />
            )}
          </div>
          {editMode && (
            <button
              type="button"
              onClick={() => deleteItemMut.mutate({ id: item.id })}
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive transition-colors"
              title="Remover item"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-2 rounded-xl border border-border/70 bg-muted/30 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {step.itemCount > 0
            ? `Checklist · ${step.answeredCount}/${step.itemCount}`
            : "Checklist desta etapa"}
          {step.hasOverride && (
            <span className="ml-2 text-[10px] font-medium text-primary normal-case">
              (personalizado)
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={handleEditClick}
          disabled={startOverrideMut.isPending}
          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          title="Editar os itens só deste produto"
        >
          <Pencil className="w-3 h-3" />
          {editMode ? "Concluir edição" : step.hasOverride ? "Editar itens" : "Personalizar"}
        </button>
      </div>

      {step.items.length === 0 && (
        <p className="text-xs text-muted-foreground py-1">
          Nenhum item ainda. {step.hasOverride ? "Adicione abaixo." : "Use os botões abaixo para adicionar perguntas ou checkboxes."}
        </p>
      )}

      {/* Itens agrupados (cartões por grupo, como no print do Kickoff). */}
      {hasGroups ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {groups.map((g) => (
            <div
              key={g.key}
              className="rounded-xl border border-border/70 bg-card p-3 space-y-2"
            >
              {g.name && (
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-1.5 h-4 rounded-full"
                    style={{ background: g.color ?? "var(--primary)" }}
                  />
                  <h5
                    className="text-sm font-bold"
                    style={{ color: g.color ?? "var(--foreground)" }}
                  >
                    {g.name}
                  </h5>
                </div>
              )}
              <div className="space-y-2">{g.items.map(renderItem)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">{step.items.map(renderItem)}</div>
      )}

      {/* Barra de ações: adicionar pergunta / checkbox e restaurar. */}
      <div className="pt-2 border-t border-border/60 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 bg-background"
            onClick={() => {
              setNewType("text");
              setEditMode(true);
            }}
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar pergunta
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 bg-background"
            onClick={() => {
              setNewType("checkbox");
              setEditMode(true);
            }}
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar checkbox
          </Button>
          <button
            type="button"
            onClick={handleEditClick}
            disabled={startOverrideMut.isPending}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors ml-auto"
            title="Mostrar/ocultar lixeiras para excluir itens"
          >
            <Pencil className="w-3 h-3" />
            {editMode ? "Concluir edição" : "Editar itens"}
          </button>
        </div>

        {editMode && (
          <div className="rounded-lg border border-dashed border-border bg-background p-2.5 space-y-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setNewType("checkbox")}
                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border transition-colors ${newType === "checkbox" ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground"}`}
              >
                <Square className="w-3 h-3" /> Checkbox
              </button>
              <button
                type="button"
                onClick={() => setNewType("text")}
                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border transition-colors ${newType === "text" ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground"}`}
              >
                <TypeIcon className="w-3 h-3" /> Pergunta
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddItem();
                  }
                }}
                placeholder={newType === "checkbox" ? "Novo checkbox (ex.: Foto pronta?)" : "Nova pergunta (ex.: Qual a fonte da ideia?)"}
                className="h-8 text-sm"
              />
              <Button size="sm" className="h-8" onClick={handleAddItem} disabled={createItemMut.isPending}>
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </Button>
            </div>
            {step.hasOverride && (
              <button
                type="button"
                onClick={() => resetMut.mutate({ productId, stageId: step.stageId })}
                className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
              >
                Restaurar itens-padrão (remove personalização deste produto)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Linha do tempo VERTICAL de um produto (layout do mockup) ────────────────
function VerticalTimeline({ product }: { product: Product }) {
  const [expandedStageId, setExpandedStageId] = useState<number | null>(null);

  if (product.steps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Nenhuma etapa definida ainda. Use “Etapas do Pedro” no topo para criar.
      </p>
    );
  }

  return (
    <div className="relative">
      {product.steps.map((step, idx) => {
        const color = categoryColor(step.category);
        const Icon = step.done ? Check : categoryIcon(step.category);
        const isLast = idx === product.steps.length - 1;
        const expanded = expandedStageId === step.stageId;
        const hasItems = step.itemCount > 0;
        return (
          <div key={step.stageId} className="flex gap-3 sm:gap-4">
            {/* Trilha: ícone + linha conectora */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                style={{
                  border: `2px solid ${step.done ? "var(--success)" : color}`,
                  background: step.done
                    ? "var(--success)"
                    : `color-mix(in oklch, ${color} 10%, transparent)`,
                  color: step.done ? "#fff" : color,
                }}
                title={step.label}
              >
                <Icon className="w-[18px] h-[18px]" />
              </div>
              {!isLast && (
                <div
                  className="w-[2px] flex-1 min-h-[18px] my-1 rounded-full"
                  style={{ background: step.done ? "var(--success)" : "var(--border)" }}
                />
              )}
            </div>

            {/* Cartão da etapa */}
            <div className={`flex-1 min-w-0 ${isLast ? "" : "mb-2"}`}>
              <div className="rounded-2xl border border-border/70 bg-card card-soft px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-semibold text-muted-foreground/70 shrink-0">
                    {`#${String(idx).padStart(2, "0")}`}
                  </span>
                  <h4 className="font-display font-semibold text-foreground text-[15px] leading-tight truncate">
                    {step.label}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setExpandedStageId(expanded ? null : step.stageId)}
                    className="flex items-center gap-1 text-xs font-medium shrink-0 transition-colors"
                    style={{ color }}
                  >
                    Ver detalhes
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  <div className="flex-1" />
                  {hasItems && (
                    <span
                      className="text-[10px] font-semibold tabular-nums shrink-0"
                      style={{ color: step.done ? "var(--success)" : "var(--muted-foreground)" }}
                    >
                      {step.answeredCount}/{step.itemCount}
                    </span>
                  )}
                  <CategoryTag category={step.category} />
                </div>

                {expanded && (
                  <div className="mt-2 pt-2 border-t border-border/60">
                    {step.details && step.details.trim().length > 0 && (
                      <div className="mb-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                          Sobre esta etapa
                        </p>
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap">{step.details}</p>
                      </div>
                    )}
                    <ChecklistEditor productId={product.id} step={step} />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── (Linha do tempo HORIZONTAL antiga — desativada) ────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars

function ProductRow({ product, index }: { product: Product; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const pStyle = PRIORITY_STYLE[product.priority] ?? PRIORITY_STYLE.media;
  const daysLeft = getDaysLeft(product.expectedArrival);
  const urgency = URGENCY(daysLeft);
  const UrgencyIcon = urgency.icon;
  const isOverdue = daysLeft !== null && daysLeft < 0;

  const total = product.totalSteps || product.steps.length;
  const progressPct = total > 0 ? Math.round((product.completedCount / total) * 100) : 0;

  return (
    <div className="relative flex items-stretch gap-0 rounded-2xl overflow-hidden bg-card card-soft transition-all duration-200">
      <div className="w-1 shrink-0 rounded-l-2xl" style={{ background: pStyle.dot }} />
      <div className="flex-1 min-w-0 p-4 sm:p-5 space-y-3">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExpanded((v) => !v);
            }
          }}
          className="w-full text-left cursor-pointer"
        >
          <div className="flex items-start gap-3">
            <span
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
              style={{ background: pStyle.bg, color: pStyle.text, border: `1px solid ${pStyle.border}` }}
            >
              {index + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display font-semibold text-foreground text-base leading-tight">{product.name}</h3>
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full border shrink-0"
                  style={{ background: pStyle.bg, color: pStyle.text, borderColor: pStyle.border }}
                >
                  {pStyle.label}
                </span>
                {isOverdue && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 bg-destructive/15 text-destructive border border-destructive/40">
                    <AlertTriangle className="w-3 h-3" />
                    Atrasado
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {product.completedCount}/{total} etapas concluídas · {progressPct}%
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1.5 ml-2">
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                style={{
                  background: `color-mix(in oklch, ${urgency.color} 15%, transparent)`,
                  border: `1px solid color-mix(in oklch, ${urgency.color} 40%, transparent)`,
                }}
              >
                <UrgencyIcon className="w-3.5 h-3.5 shrink-0" style={{ color: urgency.color }} />
                <span className="text-xs font-bold" style={{ color: urgency.color }}>
                  {urgency.label}
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, background: pStyle.dot }}
            />
          </div>
          <span
            className="text-xs font-semibold shrink-0"
            style={{ color: progressPct === 100 ? "var(--success)" : pStyle.dot }}
          >
            {progressPct}%
          </span>
        </div>

        {expanded && (
          <div className="pt-2 border-t border-border/60">
            <VerticalTimeline product={product} />
          </div>
        )}
      </div>
    </div>
  );
}

function MonthHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-primary" />
        <span className="font-display font-semibold text-sm text-primary">{label}</span>
        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-primary/12 text-primary">{count}</span>
      </div>
      <div className="flex-1 h-px bg-primary/20" />
    </div>
  );
}

export default function PedroTimeline() {
  const { data, isLoading } = trpc.pedroTimeline.overview.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const stages = (data?.stages ?? []) as Stage[];
  const products = (data?.products ?? []) as unknown as Product[];

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; sortKey: number; items: Product[] }>();
    for (const p of products) {
      let key: string;
      let label: string;
      let sortKey: number;
      if (p.expectedArrival) {
        const d = new Date(p.expectedArrival);
        const yr = d.getFullYear();
        const mo = d.getMonth();
        key = `${yr}-${String(mo).padStart(2, "0")}`;
        label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        label = label.charAt(0).toUpperCase() + label.slice(1);
        sortKey = yr * 100 + mo;
      } else {
        key = "sem-data";
        label = "Sem data definida";
        sortKey = 99999;
      }
      if (!map.has(key)) map.set(key, { label, sortKey, items: [] });
      map.get(key)!.items.push(p);
    }
    return Array.from(map.values()).sort((a, b) => a.sortKey - b.sortKey);
  }, [products]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold text-foreground">Cronograma do Pedro</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Cada produto tem sua própria linha do tempo. Clique numa bolinha para marcar a etapa como concluída e
          adicionar uma observação.
        </p>
      </div>

      <StagesManager stages={stages} />

      {groups.length === 0 ? (
        <div className="text-center py-16">
          <CalendarClock className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">Nenhum produto encontrado</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group, gi) => {
            const offset = groups.slice(0, gi).reduce((acc, g) => acc + g.items.length, 0);
            return (
              <div key={group.label} className="space-y-2">
                <MonthHeader label={group.label} count={group.items.length} />
                <div className="space-y-3 pl-2">
                  {group.items.map((product, i) => (
                    <ProductRow key={product.id} product={product} index={offset + i} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
