import { ShieldCheck, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * "Robustez da coleta" card. Lets the owner enable a recurring background sweep
 * (Heartbeat cron) that recovers competitor searches orphaned by a server
 * restart. The cron can only reach the PUBLISHED site, so we state honestly
 * that it takes effect after publishing. Even with the cron off, the runtime
 * fallback already prevents the UI from getting stuck forever — this just makes
 * recovery automatic and prompt.
 */
export function SweepScheduleCard() {
  const utils = trpc.useUtils();
  const schedule = trpc.competitors.getSweepSchedule.useQuery();
  const setSchedule = trpc.competitors.setSweepSchedule.useMutation({
    onSuccess: () => {
      utils.competitors.getSweepSchedule.invalidate();
    },
    onError: (err) => {
      toast.error(
        err.message ||
          "Não foi possível atualizar a rotina. Publique o app e tente novamente.",
      );
    },
  });

  const enabled = schedule.data?.enabled ?? false;
  const pending = setSchedule.isPending || schedule.isLoading;

  return (
    <Card className="border-muted/60 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Robustez da coleta</p>
              {enabled ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700"
                >
                  Ativa
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Inativa
                </Badge>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Verifica a cada 2 minutos se alguma busca ficou presa por um
              reinício do servidor e a libera automaticamente. Tem efeito após{" "}
              <span className="font-medium text-foreground">publicar o app</span>{" "}
              (a rotina roda no domínio publicado). Mesmo desativada, o app já
              evita que a tela fique presa em “Coletando…”.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Switch
            checked={enabled}
            disabled={pending}
            onCheckedChange={(checked) =>
              setSchedule.mutate({ enabled: checked, cron: "0 */2 * * * *" })
            }
            aria-label="Ativar rotina de robustez da coleta"
          />
        </div>
      </div>
    </Card>
  );
}
