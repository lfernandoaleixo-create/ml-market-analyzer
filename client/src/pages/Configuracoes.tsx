import { DataSourceBanner, PageContainer, PageHeader } from "@/components/market/Common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Clock,
  KeyRound,
  Loader2,
  Plug,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const CRON_PRESETS = [
  { label: "A cada 6 horas", value: "0 0 */6 * * *" },
  { label: "A cada 12 horas", value: "0 0 */12 * * *" },
  { label: "Diariamente (00h UTC)", value: "0 0 0 * * *" },
  { label: "A cada 3 horas", value: "0 0 */3 * * *" },
];

export default function Configuracoes() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Ajustes"
        title="Configurações"
        description="Gerencie a integração com o Mercado Livre, o monitoramento automático e os limiares que disparam os alertas."
      />
      <DataSourceBanner />
      <div className="grid gap-6 lg:grid-cols-2">
        <CredentialsCard />
        <ScheduleCard />
        <ThresholdsCard />
        <MethodologyCard />
      </div>
    </PageContainer>
  );
}

function CredentialsCard() {
  const utils = trpc.useUtils();
  const creds = trpc.monitor.getCredentials.useQuery();
  const [appId, setAppId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [siteId, setSiteId] = useState("MLB");

  useEffect(() => {
    if (creds.data) {
      setAppId(creds.data.appId ?? "");
      setSiteId(creds.data.siteId ?? "MLB");
    }
  }, [creds.data]);

  const save = trpc.monitor.saveCredentials.useMutation({
    onSuccess: () => {
      utils.monitor.getCredentials.invalidate();
      utils.market.status.invalidate();
      toast.success("Credenciais salvas.");
    },
    onError: (e) => toast.error(e.message),
  });

  const test = trpc.monitor.testCredentials.useMutation({
    onSuccess: (r) => {
      utils.monitor.getCredentials.invalidate();
      utils.market.status.invalidate();
      r.ok ? toast.success(r.message) : toast.error(r.message);
    },
    onError: (e) => toast.error(e.message),
  });

  const status = creds.data?.status ?? "unconfigured";

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <KeyRound className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-display text-lg font-600">Credenciais do Mercado Livre</h2>
          <p className="text-xs text-muted-foreground">Integração oficial (OAuth / App ID)</p>
        </div>
        <div className="ml-auto">
          {status === "connected" ? (
            <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-500">
              <CheckCircle2 className="h-3 w-3" /> Conectado
            </Badge>
          ) : status === "error" ? (
            <Badge variant="outline" className="gap-1 border-red-500/30 text-red-500">
              <XCircle className="h-3 w-3" /> Erro
            </Badge>
          ) : (
            <Badge variant="outline">Não configurado</Badge>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="appId">App ID (Client ID)</Label>
          <Input
            id="appId"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="Ex.: 1234567890123456"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="secret">Client Secret</Label>
          <Input
            id="secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={creds.data?.hasSecret ? "•••••••••• (salvo)" : "Cole seu secret aqui"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="site">Site</Label>
          <Select value={siteId} onValueChange={setSiteId}>
            <SelectTrigger id="site">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MLB">Brasil (MLB)</SelectItem>
              <SelectItem value="MLA">Argentina (MLA)</SelectItem>
              <SelectItem value="MLM">México (MLM)</SelectItem>
              <SelectItem value="MLC">Chile (MLC)</SelectItem>
              <SelectItem value="MCO">Colômbia (MCO)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {creds.data?.statusMessage && (
          <p className="text-xs text-muted-foreground">{creds.data.statusMessage}</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1"
            onClick={() => save.mutate({ appId, clientSecret, siteId })}
            disabled={save.isPending}
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => test.mutate()}
            disabled={test.isPending}
          >
            {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            Testar conexão
          </Button>
        </div>
        <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground leading-relaxed">
          Enquanto não houver credenciais válidas, a plataforma opera com dados de demonstração
          realistas. Ao salvar e testar credenciais válidas, todos os dados passam a vir da API
          oficial automaticamente — sem mudar nenhuma tela.
        </p>
      </div>
    </Card>
  );
}

function ScheduleCard() {
  const utils = trpc.useUtils();
  const schedule = trpc.monitor.getSchedule.useQuery();
  const [cron, setCron] = useState(CRON_PRESETS[0].value);

  useEffect(() => {
    if (schedule.data?.taskUid) {
      // keep current preset; nothing to sync from server beyond enabled state
    }
  }, [schedule.data]);

  const setSchedule = trpc.monitor.setSchedule.useMutation({
    onSuccess: (r) => {
      utils.monitor.getSchedule.invalidate();
      toast.success(r.enabled ? "Monitoramento automático ativado." : "Monitoramento automático desativado.");
    },
    onError: (e) => toast.error(e.message),
  });

  const enabled = schedule.data?.enabled ?? false;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Clock className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-display text-lg font-600">Monitoramento automático</h2>
          <p className="text-xs text-muted-foreground">Captura periódica via agendamento</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border/70 p-3">
          <div>
            <p className="text-sm font-medium">Ativar captura recorrente</p>
            <p className="text-xs text-muted-foreground">Registra preço, vendas e posição automaticamente.</p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => setSchedule.mutate({ enabled: v, cron })}
            disabled={setSchedule.isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Frequência</Label>
          <Select value={cron} onValueChange={setCron} disabled={enabled}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRON_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {enabled && (
            <p className="text-xs text-muted-foreground">
              Desative para alterar a frequência e ative novamente.
            </p>
          )}
        </div>

        <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground leading-relaxed">
          O agendamento usa o serviço de tarefas da plataforma e só executa no site publicado.
          Enquanto estiver em pré-visualização, use o botão "Capturar agora" na página de
          Monitoramento para registrar pontos manualmente.
        </p>
      </div>
    </Card>
  );
}

function ThresholdsCard() {
  const utils = trpc.useUtils();
  const schedule = trpc.monitor.getSchedule.useQuery();
  const [price, setPrice] = useState(8);
  const [sales, setSales] = useState(25);
  const [position, setPosition] = useState(3);

  useEffect(() => {
    const t = schedule.data?.thresholds;
    if (t) {
      setPrice(t.priceChangePercent ?? 8);
      setSales(t.salesSurgePercent ?? 25);
      setPosition(t.positionChange ?? 3);
    }
  }, [schedule.data]);

  const save = trpc.monitor.setThresholds.useMutation({
    onSuccess: () => {
      utils.monitor.getSchedule.invalidate();
      toast.success("Limiares de alerta atualizados.");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <SlidersHorizontal className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-display text-lg font-600">Limiares de alerta</h2>
          <p className="text-xs text-muted-foreground">Quando notificar uma variação</p>
        </div>
      </div>

      <div className="space-y-3">
        <Field
          label="Variação de preço (%)"
          hint="Alerta quando o preço muda além deste percentual."
          value={price}
          onChange={setPrice}
          min={1}
          max={100}
        />
        <Field
          label="Disparada de vendas (%)"
          hint="Alerta quando as vendas crescem além deste percentual."
          value={sales}
          onChange={setSales}
          min={1}
          max={500}
        />
        <Field
          label="Mudança de posição (lugares)"
          hint="Alerta quando o produto sobe ou cai esta quantidade de posições."
          value={position}
          onChange={setPosition}
          min={1}
          max={50}
        />
        <Button
          className="w-full"
          onClick={() =>
            save.mutate({ priceChangePercent: price, salesSurgePercent: sales, positionChange: position })
          }
          disabled={save.isPending}
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar limiares
        </Button>
      </div>
    </Card>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function MethodologyCard() {
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-display text-lg font-600">Critérios de potencial</h2>
      <p className="mb-3 text-sm text-muted-foreground leading-relaxed">
        O índice de potencial de cada produto combina os fatores abaixo. Eles também são exibidos,
        com explicação individual, ao abrir qualquer oportunidade.
      </p>
      <ul className="space-y-2 text-sm">
        {[
          ["Crescimento de vendas", "Ritmo recente de aumento das vendas."],
          ["Relação preço/avaliação", "Equilíbrio entre preço competitivo e boas notas."],
          ["Demanda da categoria", "Quão aquecida está a categoria do produto."],
          ["Reputação do vendedor", "Histórico e nível de reputação de quem vende."],
          ["Frete grátis", "Presença de frete grátis, que impulsiona conversão."],
          ["Qualidade do anúncio", "Quantidade de fotos, loja oficial e completude."],
        ].map(([t, d]) => (
          <li key={t} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>
              <strong>{t}.</strong> <span className="text-muted-foreground">{d}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
