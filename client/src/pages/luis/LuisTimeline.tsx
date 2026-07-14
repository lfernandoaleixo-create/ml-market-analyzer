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
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
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

type Stage = { id: number; label: string; position: number };
type Step = { stageId: number; label: string; done: boolean; note: string | null };
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

  const refresh = () => {
    utils.luisTimeline.stages.list.invalidate();
    utils.luisTimeline.overview.invalidate();
  };

  const createMut = trpc.luisTimeline.stages.create.useMutation({
    onSuccess: () => {
      setNewLabel("");
      refresh();
      toast.success("Etapa adicionada");
    },
    onError: () => toast.error("Não foi possível adicionar a etapa"),
  });
  const renameMut = trpc.luisTimeline.stages.rename.useMutation({
    onSuccess: () => {
      setEditingId(null);
      refresh();
      toast.success("Etapa renomeada");
    },
    onError: () => toast.error("Não foi possível renomear"),
  });
  const deleteMut = trpc.luisTimeline.stages.delete.useMutation({
    onSuccess: () => {
      setDeleteId(null);
      refresh();
      toast.success("Etapa removida");
    },
    onError: () => toast.error("Não foi possível remover"),
  });
  const reorderMut = trpc.luisTimeline.stages.reorder.useMutation({
    onSuccess: refresh,
    onError: () => toast.error("Não foi possível reordenar"),
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
          <span className="font-display font-semibold text-foreground text-sm">Etapas de Negociação</span>
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
            {stages.map((stage, idx) => (
              <div key={stage.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
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
                    <span className="flex-1 text-sm text-foreground truncate">{stage.label}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
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
            ))}
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

// ─── Uma bolinha (etapa) na linha do tempo horizontal de um produto ───────────
function TimelineDot({
  productId,
  step,
  steps,
  index,
  priorityColor,
}: {
  productId: number;
  step: Step;
  /** Todas as etapas do produto, na ordem — para validar a sequência. */
  steps: Step[];
  index: number;
  priorityColor: string;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(step.note ?? "");
  // Balãozinho transitório quando a etapa está bloqueada pela ordem sequencial.
  const [blockedHint, setBlockedHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timer para distinguir clique simples (abre popover) de duplo-clique (alterna etapa)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = () => utils.luisTimeline.overview.invalidate();

  // Regra sequencial (espelha o backend, para feedback imediato):
  //  - só pode concluir a etapa se todas as anteriores estiverem concluídas.
  const previousAllDone = steps.slice(0, index).every((s) => s.done);
  const isLocked = !step.done && !previousAllDone;

  const showBlockedHint = () => {
    setBlockedHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setBlockedHint(false), 2200);
  };

  const doneMut = trpc.luisTimeline.progress.setDoneSequential.useMutation({
    onSuccess: (res) => {
      refresh();
      if (res && res.ok === false && res.blocked === "previous") {
        showBlockedHint();
      }
    },
    onError: () => toast.error("Não foi possível atualizar a etapa"),
  });

  const toggleDone = () => {
    // Marcar fora de ordem: não chama o backend, apenas mostra o balão.
    if (isLocked) {
      showBlockedHint();
      return;
    }
    doneMut.mutate({ productId, stageId: step.stageId, done: !step.done });
  };

  // 1 clique (com atraso): abre o popover de detalhes. 2 cliques: alterna concluída/pendente.
  // Usamos um timer próprio (250ms) para diferenciar single de double click de forma confiável,
  // já que o Popover é controlado por PopoverAnchor (não pelo clique do trigger).
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (clickTimer.current) {
      // Segundo clique dentro da janela => duplo-clique: alterna a etapa
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      setOpen(false);
      toggleDone();
      return;
    }
    // Primeiro clique: aguarda para ver se vem um segundo
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      setNoteDraft(step.note ?? "");
      setOpen(true);
    }, 250);
  };
  const noteMut = trpc.luisTimeline.progress.setNote.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Observação salva");
    },
    onError: () => toast.error("Não foi possível salvar a observação"),
  });

  const color = step.done ? priorityColor : "var(--muted-foreground)";

  return (
    <div
      className="flex flex-col items-center gap-2 shrink-0"
      style={{ width: 120 }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Balãozinho de bloqueio (etapa anterior não concluída) */}
      <div className="relative">
        {blockedHint && (
          <div className="absolute -top-11 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-[11px] font-medium text-background shadow-lg">
            Conclua a etapa anterior primeiro
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 bg-foreground" />
          </div>
        )}
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setNoteDraft(step.note ?? "");
        }}
      >
        <PopoverAnchor asChild>
          <button
            type="button"
            onClick={handleClick}
            className={`relative flex items-center justify-center rounded-full transition-all hover:scale-105 active:scale-95 ${isLocked ? "opacity-60" : ""}`}
            style={{
              width: 36,
              height: 36,
              background: step.done ? priorityColor : "var(--muted)",
              border: step.done ? `2px solid ${priorityColor}` : "2px solid var(--border)",
            }}
            title={
              isLocked
                ? `${step.label} — conclua a etapa anterior primeiro`
                : `${step.label} — 1 clique: detalhes · 2 cliques: ${step.done ? "desmarcar" : "marcar"}`
            }
          >
            {step.done ? (
              <svg width="16" height="16" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : isLocked ? (
              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <span className="text-muted-foreground text-xs font-semibold">{index + 1}</span>
            )}
            {step.note && step.note.trim().length > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card"
                style={{ background: "var(--primary)" }}
              />
            )}
          </button>
        </PopoverAnchor>
        <PopoverContent className="w-72" align="center">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-foreground leading-tight">{step.label}</p>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                style={{
                  background: step.done
                    ? "color-mix(in oklch, var(--success) 15%, transparent)"
                    : "var(--muted)",
                  color: step.done ? "var(--success)" : "var(--muted-foreground)",
                }}
              >
                {step.done ? "Concluída" : "Pendente"}
              </span>
            </div>

            {isLocked && (
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Lock className="w-3 h-3" />
                Conclua a etapa anterior para liberar esta.
              </p>
            )}

            <Button
              size="sm"
              variant={step.done ? "outline" : "default"}
              className="w-full h-8"
              disabled={doneMut.isPending || isLocked}
              onClick={toggleDone}
            >
              {step.done ? (
                <>
                  <X className="w-3.5 h-3.5 mr-1" />
                  Marcar como pendente
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Marcar como concluída
                </>
              )}
            </Button>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Observação</label>
              <Textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Ex.: Amostra a caminho / Aguardando cotação"
                className="min-h-[64px] text-sm"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-8 flex-1"
                  disabled={noteMut.isPending}
                  onClick={() =>
                    noteMut.mutate({
                      productId,
                      stageId: step.stageId,
                      note: noteDraft.trim() ? noteDraft.trim() : null,
                    })
                  }
                >
                  Salvar observação
                </Button>
                {step.note && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-destructive hover:text-destructive"
                    disabled={noteMut.isPending}
                    onClick={() => {
                      setNoteDraft("");
                      noteMut.mutate({ productId, stageId: step.stageId, note: null });
                    }}
                  >
                    Limpar
                  </Button>
                )}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      </div>

      <span
        className="text-[11px] leading-snug text-center font-medium"
        style={{ color }}
      >
        {step.label}
      </span>
    </div>
  );
}

// ─── Linha do tempo HORIZONTAL de um produto ─────────────────────────────────
function HorizontalTimeline({ product, priorityColor }: { product: Product; priorityColor: string }) {
  if (product.steps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Nenhuma etapa definida ainda. Use “Etapas de Negociação” no topo para criar.
      </p>
    );
  }

  // Índice da última etapa concluída para colorir a linha de conexão.
  const lastDoneIndex = product.steps.reduce((acc, s, i) => (s.done ? i : acc), -1);

  return (
    <div className="overflow-x-auto pb-1 -mx-1 px-1">
      <div className="flex items-start" style={{ minWidth: "min-content" }}>
        {product.steps.map((step, idx) => {
          const isFirst = idx === 0;
          // Segmento de linha que liga a bolinha anterior à atual.
          const connectorActive = idx <= lastDoneIndex;
          return (
            <div key={step.stageId} className="flex items-start">
              {!isFirst && (
                <div className="flex items-center" style={{ height: 36 }}>
                  <div
                    className="h-[3px] rounded-full transition-colors duration-500"
                    style={{
                      width: 28,
                      background: connectorActive ? priorityColor : "var(--border)",
                    }}
                  />
                </div>
              )}
              <TimelineDot
                productId={product.id}
                step={step}
                steps={product.steps}
                index={idx}
                priorityColor={priorityColor}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProductRow({ product, index }: { product: Product; index: number }) {
  // Inicia recolhido: ao abrir o Cronograma, todos os produtos comecam fechados.
  const [expanded, setExpanded] = useState(false);
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
                  display: daysLeft === null ? "none" : undefined,
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
            <HorizontalTimeline product={product} priorityColor={pStyle.dot} />
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

export default function LuisTimeline() {
  const { data, isLoading } = trpc.luisTimeline.overview.useQuery(undefined, {
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
        <h2 className="text-2xl font-display font-semibold text-foreground">Cronograma de Negociação</h2>
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
