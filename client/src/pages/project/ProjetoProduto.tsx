import { useAuth } from "@/_core/hooks/useAuth";
import { useGuestName } from "@/hooks/useGuestName";
import { GuestNameDialog } from "@/components/project/GuestNameDialog";
import { useProjectApi, useTimelineApi, type PortfolioNamespace } from "@/lib/projectApi";
import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  Edit2,
  Save,
  X,
  Plus,
  Trash2,
  Loader2,
  Upload,
  FileText,
  Image as ImageIcon,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  MessageSquare,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const PRIORITY_CONFIG = {
  alta: { label: "Alta", className: "bg-destructive/10 text-destructive border-destructive/30" },
  media: { label: "Média", className: "bg-warning/10 text-warning border-warning/30" },
  baixa: { label: "Baixa", className: "bg-primary/10 text-primary border-primary/30" },
};

export default function ProjetoProduto({
  basePath = "/projeto",
  ns = "project",
  timelineNs,
}: { basePath?: string; ns?: PortfolioNamespace; timelineNs?: PortfolioNamespace } = {}) {
  const api = useProjectApi(ns);
  // A linha do tempo pode usar um namespace diferente dos produtos.
  // Ex.: produtos compartilhados (project) mas etapas proprias do Pedro.
  const timelineApi = useTimelineApi(timelineNs ?? ns);
  const { id } = useParams<{ id: string }>();
  const productId = parseInt(id ?? "0");
  const [, setLocation] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { guestName, setGuestName } = useGuestName();
  const [showGuestNameDialog, setShowGuestNameDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

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

  const { data: product, isLoading: loadingProduct, refetch: refetchProduct } = api.products.byId.useQuery(
    { id: productId },
    { enabled: !!productId },
  );
  const { data: todosData, isLoading: loadingTodos, refetch: refetchTodos } = api.todos.byProduct.useQuery(
    { productId },
    { enabled: !!productId },
  );
  const { data: documents, isLoading: loadingDocs, refetch: refetchDocs } = api.documents.byProduct.useQuery(
    { productId },
    { enabled: !!productId },
  );

  // Etapas DINÂMICAS (mesmas do Cronograma do Pedro/Luís), em vez do template fixo.
  const {
    data: overview,
    isLoading: loadingDynamic,
    refetch: refetchDynamic,
  } = timelineApi.overview.useQuery(undefined, { enabled: !!productId });
  const dynamicProduct = overview?.products.find((p) => p.id === productId);
  const dynamicSteps = dynamicProduct?.steps ?? [];

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    supplier: "",
    supplierContact: "",
    notes: "",
    priority: "media" as "alta" | "media" | "baixa",
    expectedArrival: "",
  });

  useEffect(() => {
    if (product) {
      setEditForm({
        name: product.name ?? "",
        description: product.description ?? "",
        supplier: product.supplier ?? "",
        supplierContact: product.supplierContact ?? "",
        notes: product.notes ?? "",
        priority: (product.priority ?? "media") as "alta" | "media" | "baixa",
        expectedArrival: (product as any).expectedArrival
          ? new Date((product as any).expectedArrival).toISOString().split("T")[0]
          : "",
      });
    }
  }, [product]);

  const updateProductMutation = api.products.update.useMutation({
    onSuccess: () => {
      toast.success("Produto atualizado!");
      setEditing(false);
      refetchProduct();
    },
    onError: () => toast.error("Erro ao atualizar produto"),
  });
  const deleteProductMutation = api.products.delete.useMutation({
    onSuccess: () => {
      toast.success("Produto removido");
      setLocation(basePath);
    },
    onError: () => toast.error("Erro ao remover produto"),
  });

  const setDoneMutation = timelineApi.progress.setDone.useMutation({
    onError: () => toast.error("Erro ao atualizar etapa"),
  });
  const setNoteMutation = timelineApi.progress.setNote.useMutation({
    onError: () => toast.error("Erro ao salvar observação"),
  });
  // Etapa em edição (modelo dinâmico): guarda o stageId selecionado.
  const [editingStageId, setEditingStageId] = useState<number | null>(null);
  const editingStage = dynamicSteps.find((s) => s.stageId === editingStageId) ?? null;
  const [stepForm, setStepForm] = useState({ done: false, notes: "" });
  const openStepEdit = (step: { stageId: number; done: boolean; note: string | null }) => {
    setEditingStageId(step.stageId);
    setStepForm({ done: step.done, notes: step.note ?? "" });
  };
  const saveStep = async () => {
    if (editingStageId == null) return;
    try {
      await setDoneMutation.mutateAsync({ productId, stageId: editingStageId, done: stepForm.done });
      await setNoteMutation.mutateAsync({ productId, stageId: editingStageId, note: stepForm.notes.trim() || null });
      toast.success("Etapa atualizada!");
      refetchDynamic();
      refetchProduct();
    } finally {
      setEditingStageId(null);
    }
  };

  const [showNewTodo, setShowNewTodo] = useState(false);
  const [newTodo, setNewTodo] = useState({ title: "", description: "" });
  const createTodoMutation = api.todos.create.useMutation({
    onSuccess: () => {
      toast.success("Tarefa criada!");
      setShowNewTodo(false);
      setNewTodo({ title: "", description: "" });
      refetchTodos();
    },
    onError: () => toast.error("Erro ao criar tarefa"),
  });
  const updateTodoMutation = api.todos.update.useMutation({
    onSuccess: () => refetchTodos(),
    onError: () => toast.error("Erro ao atualizar tarefa"),
  });
  const deleteTodoMutation = api.todos.delete.useMutation({
    onSuccess: () => {
      toast.success("Tarefa removida");
      refetchTodos();
    },
    onError: () => toast.error("Erro ao remover tarefa"),
  });
  const toggleTodo = (todo: any) => updateTodoMutation.mutate({ id: todo.id, completed: !todo.completed });

  const [commentText, setCommentText] = useState("");
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const { data: commentsData, isLoading: loadingComments, refetch: refetchComments } = api.comments.list.useQuery(
    { productId },
    { enabled: !!productId, refetchInterval: 15_000, refetchOnWindowFocus: true },
  );
  const createCommentMutation = api.comments.create.useMutation({
    onSuccess: () => {
      setCommentText("");
      refetchComments();
    },
    onError: () => toast.error("Erro ao enviar comentário"),
  });
  const deleteCommentMutation = api.comments.delete.useMutation({
    onSuccess: () => refetchComments(),
    onError: () => toast.error("Erro ao remover comentário"),
  });
  const handleSendComment = () => {
    const text = commentText.trim();
    if (!text) return;
    requireGuestName(() => {
      createCommentMutation.mutate({
        productId,
        content: text,
        guestName: isAuthenticated ? undefined : guestName || "Visitante",
      });
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const uploadMutation = api.documents.upload.useMutation({
    onSuccess: () => {
      toast.success("Arquivo enviado!");
      refetchDocs();
    },
    onError: () => toast.error("Erro ao enviar arquivo"),
  });
  const deleteDocMutation = api.documents.delete.useMutation({
    onSuccess: () => {
      toast.success("Arquivo removido");
      refetchDocs();
    },
  });
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const isImage = file.type.startsWith("image/");
      await uploadMutation.mutateAsync({
        productId,
        name: file.name,
        base64,
        mimeType: file.type,
        type: isImage ? "foto" : "documento",
      });
      setUploadingDoc(false);
    };
    reader.readAsDataURL(file);
  };

  const completedTodos = todosData?.filter((t) => t.completed).length ?? 0;
  const totalTodos = todosData?.length ?? 0;
  const completedSteps = dynamicSteps.filter((s) => s.done).length;
  const totalSteps = dynamicSteps.length;
  // Primeira etapa não concluída = "Atual".
  const currentStageId = dynamicSteps.find((s) => !s.done)?.stageId ?? null;
  const pConfig = PRIORITY_CONFIG[(product?.priority ?? "media") as keyof typeof PRIORITY_CONFIG];

  if (loadingProduct) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!product) {
    return (
      <div className="flex items-center justify-center py-24 flex-col gap-4">
        <p className="text-muted-foreground">Produto não encontrado</p>
        <Button variant="outline" className="bg-card" onClick={() => setLocation(basePath)}>
          Voltar ao painel
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => setLocation(basePath)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar ao painel</span>
        </button>
        <div className="w-px h-5 bg-border" />
        <h1 className="font-display font-semibold text-foreground truncate flex-1 min-w-0">{product.name}</h1>
        <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${pConfig.className}`}>
          {pConfig.label}
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Coluna esquerda */}
        <div className="xl:col-span-2 space-y-6">
          {/* Dossiê */}
          <div className="rounded-2xl bg-card card-soft p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display font-semibold text-lg text-foreground">Dossiê do Produto</h2>
              <div className="flex gap-2">
                {editing ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="text-muted-foreground gap-1.5">
                      <X className="w-3.5 h-3.5" /> Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        updateProductMutation.mutate({
                          id: productId,
                          name: editForm.name,
                          description: editForm.description || null,
                          supplier: editForm.supplier || null,
                          supplierContact: editForm.supplierContact || null,
                          notes: editForm.notes || null,
                          priority: editForm.priority,
                          expectedArrival: editForm.expectedArrival ? new Date(editForm.expectedArrival) : null,
                        })
                      }
                      disabled={updateProductMutation.isPending}
                      className="gap-1.5"
                    >
                      {updateProductMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Salvar
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" className="bg-card gap-1.5" onClick={() => requireGuestName(() => setEditing(true))}>
                    <Edit2 className="w-3.5 h-3.5" /> Editar
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome do Produto</label>
                {editing ? (
                  <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                ) : (
                  <p className="text-foreground font-medium">{product.name}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Prioridade</label>
                {editing ? (
                  <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v as any })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alta">🔴 Alta</SelectItem>
                      <SelectItem value="media">🟡 Média</SelectItem>
                      <SelectItem value="baixa">🟢 Baixa</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full border ${pConfig.className}`}>{pConfig.label}</span>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Fornecedor</label>
                {editing ? (
                  <Input value={editForm.supplier} onChange={(e) => setEditForm({ ...editForm, supplier: e.target.value })} placeholder="Nome do fornecedor" />
                ) : (
                  <p className="text-foreground">{product.supplier || <span className="text-muted-foreground italic">Não informado</span>}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Contato do Fornecedor</label>
                {editing ? (
                  <Input value={editForm.supplierContact} onChange={(e) => setEditForm({ ...editForm, supplierContact: e.target.value })} placeholder="E-mail, WhatsApp, WeChat..." />
                ) : (
                  <p className="text-foreground">{product.supplierContact || <span className="text-muted-foreground italic">Não informado</span>}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Descrição</label>
                {editing ? (
                  <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Descrição do produto, especificações, observações..." rows={3} className="resize-none" />
                ) : (
                  <p className="text-foreground leading-relaxed">{product.description || <span className="text-muted-foreground italic">Sem descrição</span>}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Previsão de Chegada</label>
                {editing ? (
                  <Input type="date" value={editForm.expectedArrival} onChange={(e) => setEditForm({ ...editForm, expectedArrival: e.target.value })} />
                ) : (
                  <p className="text-foreground">
                    {(product as any).expectedArrival ? (
                      new Date((product as any).expectedArrival).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
                    ) : (
                      <span className="text-muted-foreground italic">Não definida</span>
                    )}
                  </p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Notas Internas</label>
                {editing ? (
                  <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Notas, lembretes, informações adicionais..." rows={3} className="resize-none" />
                ) : (
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">{product.notes || <span className="text-muted-foreground italic">Sem notas</span>}</p>
                )}
              </div>
            </div>
          </div>

          {/* Linha do Tempo */}
          <div className="rounded-2xl bg-card card-soft p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display font-semibold text-lg text-foreground">Linha do Tempo</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {completedSteps} de {totalSteps} etapas concluídas
                </p>
              </div>
              <span className="text-2xl font-display font-semibold text-primary">
                {totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0}%
              </span>
            </div>

            {loadingDynamic ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : totalSteps === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Nenhuma etapa configurada ainda. Defina as etapas na aba "Etapas".
              </div>
            ) : (
              <div className="space-y-2">
                {dynamicSteps.map((step, index) => {
                  const isCurrentStep = step.stageId === currentStageId;
                  return (
                    <button
                      key={step.stageId}
                      onClick={() => requireGuestName(() => openStepEdit(step))}
                      className={`w-full text-left rounded-xl p-4 transition-all duration-200 hover:bg-accent group ${isCurrentStep ? "ring-1 ring-primary/30 bg-primary/5" : ""}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center shrink-0">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
                            style={{
                              background: step.done
                                ? "color-mix(in oklch, var(--success) 20%, transparent)"
                                : isCurrentStep
                                  ? "color-mix(in oklch, var(--primary) 20%, transparent)"
                                  : "var(--muted)",
                              color: step.done ? "var(--success)" : isCurrentStep ? "var(--primary)" : "var(--muted-foreground)",
                              border: `1px solid ${
                                step.done
                                  ? "color-mix(in oklch, var(--success) 40%, transparent)"
                                  : isCurrentStep
                                    ? "color-mix(in oklch, var(--primary) 40%, transparent)"
                                    : "var(--border)"
                              }`,
                            }}
                          >
                            {step.done ? "✓" : index + 1}
                          </div>
                          {index < dynamicSteps.length - 1 && (
                            <div
                              className="w-px h-3 mt-1"
                              style={{ background: step.done ? "color-mix(in oklch, var(--success) 40%, transparent)" : "var(--border)" }}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground text-sm">{step.label}</span>
                            {isCurrentStep && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary">Atual</span>}
                            {(() => {
                              const counts = step as unknown as { itemCount?: number; answeredCount?: number };
                              return counts.itemCount != null && counts.itemCount > 0 ? (
                                <span className="text-xs text-muted-foreground">
                                  {counts.answeredCount ?? 0}/{counts.itemCount}
                                </span>
                              ) : null;
                            })()}
                          </div>
                          {step.note && <p className="text-xs text-muted-foreground mt-0.5 truncate">{step.note}</p>}
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          {step.done ? (
                            <CheckCircle2 className="w-4 h-4" style={{ color: "var(--success)" }} />
                          ) : (
                            <Circle className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span
                            className="text-xs hidden sm:block"
                            style={{ color: step.done ? "var(--success)" : "var(--muted-foreground)" }}
                          >
                            {step.done ? "Concluída" : "Pendente"}
                          </span>
                          <Edit2 className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Coluna direita */}
        <div className="space-y-6">
          {/* Resumo */}
          <div className="rounded-2xl bg-card card-soft p-5">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4">Resumo</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Etapa atual</span>
                <span className="text-sm font-medium text-foreground">
                  {dynamicSteps.find((s) => s.stageId === currentStageId)?.label ?? "Concluído"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Progresso</span>
                <span className="text-sm font-medium text-primary">
                  {completedSteps}/{totalSteps} etapas
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tarefas</span>
                <span className="text-sm font-medium text-foreground">
                  {completedTodos}/{totalTodos} concluídas
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Documentos</span>
                <span className="text-sm font-medium text-foreground">{documents?.length ?? 0} arquivo(s)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Atualizado em</span>
                <span className="text-sm text-muted-foreground">{new Date(product.updatedAt).toLocaleDateString("pt-BR")}</span>
              </div>
            </div>
          </div>

          {/* Tarefas */}
          <div className="rounded-2xl bg-card card-soft p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-foreground">Tarefas</h3>
              <Button size="sm" variant="ghost" onClick={() => requireGuestName(() => setShowNewTodo(true))} className="gap-1.5 text-muted-foreground hover:text-foreground">
                <Plus className="w-3.5 h-3.5" /> Nova
              </Button>
            </div>
            {loadingTodos ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : todosData && todosData.length > 0 ? (
              <div className="space-y-2">
                {todosData.map((todo) => (
                  <div key={todo.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors group">
                    <button onClick={() => requireGuestName(() => toggleTodo(todo))} className="mt-0.5 shrink-0">
                      {todo.completed ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Circle className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${todo.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>{todo.title}</p>
                    </div>
                    <button onClick={() => requireGuestName(() => deleteTodoMutation.mutate({ id: todo.id }))} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-3">Nenhuma tarefa ainda</p>
                <Button size="sm" variant="outline" className="bg-card gap-1.5" onClick={() => requireGuestName(() => setShowNewTodo(true))}>
                  <Plus className="w-3.5 h-3.5" /> Adicionar tarefa
                </Button>
              </div>
            )}
            {totalTodos > 0 && (
              <div className="mt-4 pt-3 border-t border-border/50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">Progresso das tarefas</span>
                  <span className="text-xs font-medium text-foreground">{Math.round((completedTodos / totalTodos) * 100)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-success transition-all duration-500" style={{ width: `${(completedTodos / totalTodos) * 100}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Documentos */}
          <div className="rounded-2xl bg-card card-soft p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-foreground">Documentos & Fotos</h3>
              <Button size="sm" variant="ghost" onClick={() => requireGuestName(() => fileInputRef.current?.click())} disabled={uploadingDoc} className="gap-1.5 text-muted-foreground hover:text-foreground">
                {uploadingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Enviar
              </Button>
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={handleFileUpload} />
            </div>
            {loadingDocs ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : documents && documents.length > 0 ? (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors group">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-primary/15">
                      {doc.type === "foto" ? <ImageIcon className="w-4 h-4 text-primary" /> : <FileText className="w-4 h-4 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-sm text-foreground hover:text-primary transition-colors truncate block">
                        {doc.name}
                      </a>
                      <p className="text-xs text-muted-foreground capitalize">{doc.type}</p>
                    </div>
                    <button onClick={() => requireGuestName(() => deleteDocMutation.mutate({ id: doc.id }))} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-3">Nenhum arquivo ainda</p>
                <Button size="sm" variant="outline" className="bg-card gap-1.5" onClick={() => requireGuestName(() => fileInputRef.current?.click())}>
                  <Upload className="w-3.5 h-3.5" /> Enviar arquivo
                </Button>
              </div>
            )}
          </div>

          {/* Comentários */}
          <div className="rounded-2xl bg-card card-soft p-5">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-4 h-4 text-primary" />
              <h3 className="font-display font-semibold text-foreground">Comentários</h3>
              <span className="ml-auto text-xs text-muted-foreground">{commentsData?.length ?? 0}</span>
            </div>
            <div className="space-y-3 mb-4 max-h-72 overflow-y-auto pr-1">
              {loadingComments ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : commentsData && commentsData.length > 0 ? (
                commentsData.map((c) => {
                  const isOwn = c.userId === user?.id;
                  const initials = (c.authorName ?? "?")
                    .split(" ")
                    .map((w: string) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <div key={c.id} className="flex gap-2.5 group">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold bg-primary/20 text-primary">{initials}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold text-foreground">{c.authorName ?? "Usuário"}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(c.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {isOwn && (
                            <button onClick={() => deleteCommentMutation.mutate({ id: c.id })} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-foreground/90 leading-snug mt-0.5 whitespace-pre-wrap break-words">{c.content}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-4">
                  <MessageSquare className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum comentário ainda</p>
                </div>
              )}
            </div>
            <div className="flex gap-2 items-end">
              <Textarea
                ref={commentInputRef}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendComment();
                  }
                }}
                placeholder={guestName || isAuthenticated ? "Escreva um comentário... (Enter para enviar)" : "Escreva um comentário... (será pedido seu nome)"}
                rows={2}
                className="resize-none text-sm flex-1"
              />
              <Button size="icon" onClick={handleSendComment} disabled={!commentText.trim() || createCommentMutation.isPending} className="shrink-0 h-[68px] w-10">
                {createCommentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Zona de Perigo */}
          <div className="rounded-2xl p-5 border border-destructive/20">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Zona de Perigo</h3>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 gap-2 bg-card"
              onClick={() => {
                requireGuestName(() => {
                  if (confirm(`Remover "${product.name}" permanentemente?`)) deleteProductMutation.mutate({ id: productId });
                });
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remover Produto
            </Button>
          </div>
        </div>
      </div>

      {/* Dialog: editar etapa */}
      <Dialog open={editingStageId != null} onOpenChange={(open) => !open && setEditingStageId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{editingStage?.label ?? "Etapa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <button
              type="button"
              onClick={() => setStepForm({ ...stepForm, done: !stepForm.done })}
              className="w-full flex items-center justify-between rounded-xl border border-border p-3 transition-colors hover:bg-accent"
            >
              <span className="text-sm font-medium text-foreground">Etapa concluída</span>
              <span
                className="inline-flex items-center justify-center w-6 h-6 rounded-full"
                style={{
                  background: stepForm.done ? "color-mix(in oklch, var(--success) 20%, transparent)" : "var(--muted)",
                  color: stepForm.done ? "var(--success)" : "var(--muted-foreground)",
                  border: `1px solid ${stepForm.done ? "color-mix(in oklch, var(--success) 40%, transparent)" : "var(--border)"}`,
                }}
              >
                {stepForm.done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
              </span>
            </button>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Observações</label>
              <Textarea value={stepForm.notes} onChange={(e) => setStepForm({ ...stepForm, notes: e.target.value })} placeholder="Notas sobre esta etapa..." rows={3} className="resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-card" onClick={() => setEditingStageId(null)}>
              Cancelar
            </Button>
            <Button onClick={saveStep} disabled={setDoneMutation.isPending || setNoteMutation.isPending}>
              {setDoneMutation.isPending || setNoteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: nova tarefa */}
      <Dialog open={showNewTodo} onOpenChange={setShowNewTodo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Nova Tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Título</label>
              <Input value={newTodo.title} onChange={(e) => setNewTodo({ ...newTodo, title: e.target.value })} placeholder="Descreva a tarefa..." autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Descrição (opcional)</label>
              <Textarea value={newTodo.description} onChange={(e) => setNewTodo({ ...newTodo, description: e.target.value })} placeholder="Detalhes adicionais..." rows={2} className="resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-card" onClick={() => setShowNewTodo(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createTodoMutation.mutate({ productId, title: newTodo.title, description: newTodo.description || undefined })} disabled={!newTodo.title.trim() || createTodoMutation.isPending}>
              {createTodoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar Tarefa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GuestNameDialog open={showGuestNameDialog} onConfirm={handleGuestNameConfirm} onCancel={() => { setShowGuestNameDialog(false); setPendingAction(null); }} />
    </div>
  );
}
