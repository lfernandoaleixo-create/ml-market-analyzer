import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  CloudUpload,
  Download,
  HardDriveUpload,
  Link2,
  Loader2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// Horários comuns (Brasília = UTC-3). Guardamos a hora em UTC no backend.
const HOUR_PRESETS = [
  { label: "03:00 (Brasília)", utc: 6 },
  { label: "06:00 (Brasília)", utc: 9 },
  { label: "09:00 (Brasília)", utc: 12 },
  { label: "12:00 (Brasília)", utc: 15 },
  { label: "21:00 (Brasília)", utc: 0 },
];

export default function DriveBackupCard() {
  const utils = trpc.useUtils();
  const status = trpc.driveBackup.status.useQuery();
  const [hourUtc, setHourUtc] = useState(9);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (status.data?.scheduleHourUtc != null) {
      setHourUtc(status.data.scheduleHourUtc);
    }
  }, [status.data?.scheduleHourUtc]);

  // Trata o retorno do OAuth do Google (?gdrive=conectado|erro).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("gdrive");
    if (!g) return;
    if (g === "conectado") toast.success("Google Drive conectado com sucesso!");
    else if (g === "erro") toast.error("Não foi possível concluir a conexão com o Google Drive.");
    else if (g === "sem-credenciais") toast.error("Configure o Google Client ID/Secret antes de conectar.");
    utils.driveBackup.status.invalidate();
    window.history.replaceState({}, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backupNow = trpc.driveBackup.backupNow.useMutation({
    onSuccess: (r) => {
      if (r.ok) toast.success(`Backup enviado ao Drive: ${r.fileName}`);
      else toast.error(`Falha no backup: ${r.error}`);
      utils.driveBackup.status.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const setSchedule = trpc.driveBackup.setSchedule.useMutation({
    onSuccess: (r) => {
      if ((r as { error?: string }).error) toast.error((r as { error?: string }).error!);
      else toast.success(r.enabled ? "Backup diário ativado." : "Backup diário desativado.");
      utils.driveBackup.status.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const disconnect = trpc.driveBackup.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Google Drive desconectado.");
      utils.driveBackup.status.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const connected = status.data?.connected ?? false;
  const enabled = status.data?.enabled ?? false;
  const lastBackupAt = status.data?.lastBackupAt ?? null;
  const lastStatus = status.data?.lastStatus ?? null;
  const lastError = status.data?.lastError ?? null;
  const accountEmail = status.data?.accountEmail ?? "";

  const handleConnect = () => {
    if (redirecting) return;
    setRedirecting(true);
    const origin = window.location.origin;
    setTimeout(() => {
      window.location.href = `/api/oauth/gdrive/connect?origin=${encodeURIComponent(origin)}`;
    }, 60);
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CloudUpload className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-display text-lg font-600">Backup no Google Drive</h2>
          <p className="text-xs text-muted-foreground">Cópia diária das planilhas (Produtos, Kits, Embalagens)</p>
        </div>
        <div className="ml-auto">
          {connected ? (
            <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-500">
              <CheckCircle2 className="h-3 w-3" /> Conectado
            </Badge>
          ) : (
            <Badge variant="outline">Não conectado</Badge>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Conexão da conta Google */}
        <div className="rounded-lg border border-border/70 p-3">
          <p className="mb-2 text-sm font-medium">Conta do Google</p>
          {connected ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Conectado como <span className="font-medium text-foreground">{accountEmail || "conta autorizada"}</span>.
                Os arquivos vão para a pasta <span className="font-medium">{status.data?.folderName ?? "Backups Planilha SKU"}</span>.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Desconectar
              </Button>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
                Clique para autorizar com sua conta Google. Nenhuma senha é compartilhada — a
                permissão fica restrita a criar arquivos numa pasta do seu Drive.
              </p>
              <Button className="w-full" onClick={handleConnect} disabled={redirecting}>
                {redirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {redirecting ? "Redirecionando para o Google…" : "Conectar Google Drive"}
              </Button>
            </>
          )}
        </div>

        {/* Backup imediato */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => backupNow.mutate()}
          disabled={!connected || backupNow.isPending}
        >
          {backupNow.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDriveUpload className="h-4 w-4" />}
          Fazer backup agora
        </Button>

        {/* Agendamento diário */}
        <div className="flex items-center justify-between rounded-lg border border-border/70 p-3">
          <div>
            <p className="text-sm font-medium">Backup diário automático</p>
            <p className="text-xs text-muted-foreground">Envia uma cópia todos os dias no horário escolhido.</p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => setSchedule.mutate({ enabled: v, hourUtc })}
            disabled={!connected || setSchedule.isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Horário do backup</Label>
          <Select
            value={String(hourUtc)}
            onValueChange={(v) => setHourUtc(Number(v))}
            disabled={enabled || !connected}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOUR_PRESETS.map((p) => (
                <SelectItem key={p.utc} value={String(p.utc)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {enabled && (
            <p className="text-xs text-muted-foreground">Desative para alterar o horário e ative novamente.</p>
          )}
        </div>

        {/* Status do último backup */}
        {lastBackupAt && (
          <div
            className={`flex items-start gap-2 rounded-lg border p-3 ${
              lastStatus === "error"
                ? "border-red-500/20 bg-red-500/5"
                : "border-emerald-500/20 bg-emerald-500/5"
            }`}
          >
            {lastStatus === "error" ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            ) : (
              <Download className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            )}
            <div className="space-y-0.5">
              <p className="text-xs font-medium">
                Último backup: {new Date(lastBackupAt).toLocaleString("pt-BR")}
              </p>
              {lastStatus === "error" && lastError ? (
                <p className="text-xs text-red-500">{lastError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{status.data?.lastFileName ?? "concluído"}</p>
              )}
            </div>
          </div>
        )}

        <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground leading-relaxed">
          O backup diário usa o serviço de tarefas da plataforma e só executa no site publicado.
          Para testar agora, use o botão "Fazer backup agora".
        </p>
      </div>
    </Card>
  );
}
