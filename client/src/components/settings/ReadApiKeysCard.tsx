import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  READ_API_BASE,
  READ_API_LIMIT_PER_MINUTE,
  READ_API_ROUTES,
  READ_API_SCOPES,
  READ_API_SCOPE_LABELS,
  type ReadApiKeyMetadata,
  type ReadApiScope,
} from "@shared/readApi";
import {
  AlertTriangle,
  Copy,
  Download,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

const EXPIRATION_DAYS = [7, 30, 90, 365] as const;

type Disclosure = {
  key: string;
  metadata: ReadApiKeyMetadata;
  ownerId: number;
};

function formatDate(value: Date) {
  return new Date(value).toLocaleString("pt-BR");
}

export default function ReadApiKeysCard() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = !authLoading && user?.role === "admin";
  const ownerId = isAdmin ? user.id : null;
  const utils = trpc.useUtils();
  const keys = trpc.readApiKeys.list.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
  });
  const [name, setName] = useState("");
  const [expiresDays, setExpiresDays] = useState(30);
  const [scopes, setScopes] = useState<ReadApiScope[]>(["mercado:read"]);
  const [disclosure, setDisclosure] = useState<Disclosure | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const formId = useId();
  // Guard late responses when logout or an account change happens during a request.
  const currentOwner = useRef<number | null>(ownerId);
  currentOwner.current = ownerId;
  const mounted = useRef(true);
  const create = trpc.readApiKeys.create.useMutation({ gcTime: 0 });
  const revoke = trpc.readApiKeys.revoke.useMutation();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setDisclosure(null);
    setFormError(null);
    setRevokeError(null);
    create.reset();
    revoke.reset();
  }, [ownerId, create.reset, revoke.reset]);

  useEffect(() => {
    if (
      disclosure &&
      keys.data?.some(
        item => item.id === disclosure.metadata.id && item.revokedAt !== null
      )
    ) {
      setDisclosure(null);
    }
  }, [keys.data, disclosure]);

  const baseUrl =
    (typeof window === "undefined" ? "" : window.location.origin) +
    READ_API_BASE;
  const openApiUrl = `${baseUrl}/openapi.json`;
  const curlExample = `curl "${baseUrl}/listings?limit=100&offset=0" \\\n  -H "Authorization: Bearer SUA_CHAVE"`;
  const visibleDisclosure = disclosure?.ownerId === ownerId ? disclosure : null;

  async function copy(value: string, successMessage: string) {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error(
        "Não foi possível copiar. Selecione e copie o texto manualmente."
      );
    }
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || create.isPending) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError("Informe um nome para identificar a chave.");
      return;
    }
    if (trimmedName.length > 100) {
      setFormError("O nome deve ter no máximo 100 caracteres.");
      return;
    }
    if (!scopes.length) {
      setFormError("Selecione pelo menos um escopo de leitura.");
      return;
    }
    setFormError(null);
    setDisclosure(null);
    const requestedBy = ownerId;
    try {
      const result = await create.mutateAsync({
        name: trimmedName,
        scopes,
        expiresDays,
      });
      // Do not retain the plaintext in the mutation observer/cache after disclosure.
      create.reset();
      if (!mounted.current || currentOwner.current !== requestedBy) return;
      setDisclosure({ ...result, ownerId: requestedBy! });
      setName("");
      void utils.readApiKeys.list.invalidate();
      toast.success(
        "Chave gerada. Copie agora: ela não será exibida novamente."
      );
    } catch (error) {
      create.reset();
      if (!mounted.current || currentOwner.current !== requestedBy) return;
      setFormError(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar a chave."
      );
    }
  }

  async function handleRevoke(metadata: ReadApiKeyMetadata) {
    if (!isAdmin || revoke.isPending || metadata.revokedAt) return;
    if (
      typeof window === "undefined" ||
      !window.confirm(
        "Tem certeza? Revogar esta chave interrompe o acesso da IA e não pode ser desfeito."
      )
    )
      return;
    setRevokeError(null);
    const requestedBy = ownerId;
    try {
      await revoke.mutateAsync({ id: metadata.id });
      if (!mounted.current || currentOwner.current !== requestedBy) return;
      setDisclosure(null);
      create.reset();
      void utils.readApiKeys.list.invalidate();
      toast.success("Chave revogada. O acesso foi interrompido.");
    } catch (error) {
      if (!mounted.current || currentOwner.current !== requestedBy) return;
      setRevokeError(
        error instanceof Error
          ? error.message
          : "Não foi possível revogar a chave."
      );
    }
  }

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h2 className="font-display text-lg font-600">
            API de leitura para outra IA
          </h2>
          <p className="text-xs text-muted-foreground">
            Acesso pela internet com chave, escopos e validade definidos por
            você.
          </p>
        </div>
        <Badge
          variant="outline"
          className="gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
        >
          <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Somente leitura
        </Badge>
      </div>

      {!isAdmin ? (
        <p
          role="status"
          className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground"
        >
          {authLoading
            ? "Verificando sua permissão…"
            : "Somente administradores podem criar, consultar e revogar chaves da API."}
        </p>
      ) : (
        <div className="space-y-5">
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              A IA pode apenas consultar os dados autorizados. Ela não pode
              alterar anúncios, campanhas ou SKUs. A chave é confidencial:
              compartilhe somente com uma IA de confiança, nunca em links, logs
              ou documentos públicos. Revogue o acesso quando não precisar mais
              dele.
            </p>
          </div>

          {visibleDisclosure && (
            <section
              aria-label="Chave gerada uma única vez"
              className="space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4"
            >
              <div role="status" className="space-y-1">
                <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  Copie agora — esta chave aparece uma única vez
                </h3>
                <p className="text-xs text-muted-foreground">
                  Ao ocultar, sair ou atualizar esta página, ela não poderá ser
                  recuperada. Guarde-a em um local seguro.
                </p>
              </div>
              <code className="block select-all break-all rounded-md border border-emerald-500/20 bg-background p-3 text-sm text-foreground">
                {visibleDisclosure.key}
              </code>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    void copy(
                      visibleDisclosure.key,
                      "Chave copiada. Guarde-a com segurança."
                    )
                  }
                >
                  <Copy className="h-4 w-4" aria-hidden="true" /> Copiar chave
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDisclosure(null);
                    create.reset();
                  }}
                >
                  <EyeOff className="h-4 w-4" aria-hidden="true" /> Ocultar e
                  descartar
                </Button>
              </div>
            </section>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <form
              onSubmit={handleGenerate}
              className="space-y-4 rounded-lg border border-border/70 p-4"
            >
              <h3 className="text-sm font-semibold">Gerar nova chave</h3>
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-name`}>Nome da chave</Label>
                <Input
                  id={`${formId}-name`}
                  value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder="Ex.: IA de análise comercial"
                  maxLength={100}
                  disabled={create.isPending}
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? `${formId}-error` : undefined}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-expires`}>Validade</Label>
                <Select
                  value={String(expiresDays)}
                  onValueChange={value => setExpiresDays(Number(value))}
                  disabled={create.isPending}
                >
                  <SelectTrigger id={`${formId}-expires`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRATION_DAYS.map(days => (
                      <SelectItem key={days} value={String(days)}>
                        {days} dias
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <fieldset disabled={create.isPending} className="space-y-2">
                <legend className="mb-2 text-sm font-medium">
                  Escopos permitidos
                </legend>
                {READ_API_SCOPES.map(scope => (
                  <div
                    key={scope}
                    className="flex items-start gap-2 rounded-md border border-border/60 px-3 py-2"
                  >
                    <Checkbox
                      id={`${formId}-${scope}`}
                      className="mt-0.5"
                      checked={scopes.includes(scope)}
                      disabled={create.isPending}
                      onCheckedChange={checked =>
                        setScopes(current =>
                          checked === true
                            ? [...new Set([...current, scope])]
                            : current.filter(item => item !== scope)
                        )
                      }
                    />
                    <Label
                      htmlFor={`${formId}-${scope}`}
                      className="block cursor-pointer text-xs leading-relaxed"
                    >
                      {READ_API_SCOPE_LABELS[scope]}
                      <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                        {scope}
                      </span>
                    </Label>
                  </div>
                ))}
              </fieldset>
              <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-muted-foreground">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                <p>
                  SKU, produtos, documentos e precificação podem conter custos,
                  margens, dados internos e links de arquivos. Esses escopos são
                  opcionais; libere apenas o necessário.
                </p>
              </div>
              {formError && (
                <p
                  id={`${formId}-error`}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {formError}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={create.isPending}
              >
                {create.isPending ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                )}
                {create.isPending ? "Gerando chave…" : "Gerar chave de leitura"}
              </Button>
            </form>

            <section
              aria-label="Chaves cadastradas"
              className="space-y-3 rounded-lg border border-border/70 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Chaves cadastradas</h3>
                {keys.isFetching && (
                  <Loader2
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    aria-label="Atualizando chaves"
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Somente o prefixo é listado. A chave completa nunca fica
                disponível aqui.
              </p>
              {keys.isLoading ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Carregando chaves…
                </p>
              ) : keys.error ? (
                <div role="alert" className="space-y-2">
                  <p className="text-sm text-destructive">
                    Não foi possível carregar as chaves. {keys.error.message}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void keys.refetch()}
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : !keys.data?.length ? (
                <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  Nenhuma chave criada. O acesso só será liberado quando você
                  gerar e compartilhar uma chave.
                </p>
              ) : (
                <ul className="max-h-[34rem] space-y-3 overflow-y-auto">
                  {keys.data.map(metadata => {
                    const expired =
                      new Date(metadata.expiresAt).getTime() <= Date.now();
                    const status = metadata.revokedAt
                      ? "Revogada"
                      : expired
                        ? "Expirada"
                        : "Ativa";
                    return (
                      <li
                        key={metadata.id}
                        className="space-y-2 rounded-lg border border-border/70 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="break-all text-sm font-medium">
                            {metadata.name}
                          </p>
                          <Badge
                            variant="outline"
                            className={
                              status === "Ativa"
                                ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground"
                            }
                          >
                            {status}
                          </Badge>
                        </div>
                        <code className="block break-all text-xs text-muted-foreground">
                          {metadata.prefix}…
                        </code>
                        <div className="flex flex-wrap gap-1">
                          {metadata.scopes.map(scope => (
                            <Badge
                              key={scope}
                              variant="secondary"
                              title={READ_API_SCOPE_LABELS[scope]}
                              className="text-[10px]"
                            >
                              {scope}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Expira em {formatDate(metadata.expiresAt)}
                        </p>
                        {metadata.revokedAt && (
                          <p className="text-xs text-muted-foreground">
                            Revogada em {formatDate(metadata.revokedAt)}
                          </p>
                        )}
                        {!metadata.revokedAt && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            disabled={revoke.isPending}
                            aria-label={`Revogar chave ${metadata.name}`}
                            onClick={() => void handleRevoke(metadata)}
                          >
                            {revoke.isPending &&
                            revoke.variables?.id === metadata.id ? (
                              <Loader2
                                className="h-4 w-4 animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            )}{" "}
                            Revogar
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {revokeError && (
                <p role="alert" className="text-sm text-destructive">
                  {revokeError}
                </p>
              )}
            </section>
          </div>

          <section
            aria-label="Documentação da API"
            className="space-y-3 rounded-lg border border-border/70 p-4"
          >
            <h3 className="text-sm font-semibold">Conectar a outra IA</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Informe a URL base e a chave separadamente à integração de
              confiança. Use o cabeçalho{" "}
              <code>Authorization: Bearer SUA_CHAVE</code>. Não coloque a chave
              na URL.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md bg-muted/50 p-2 text-xs">
                {baseUrl}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copy(baseUrl, "URL base copiada.")}
              >
                <Copy aria-hidden="true" /> Copiar URL base
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" asChild>
                <a href={openApiUrl} download="read-api-openapi.json">
                  <Download aria-hidden="true" /> Baixar OpenAPI
                </a>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copy(openApiUrl, "URL do OpenAPI copiada.")}
              >
                <Copy aria-hidden="true" /> Copiar URL OpenAPI
              </Button>
            </div>
            <p className="break-all text-xs text-muted-foreground">
              O documento público{" "}
              <a
                href={openApiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {openApiUrl}
              </a>{" "}
              contém somente o schema da API, sem dados da conta e sem chaves.
            </p>
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <p className="rounded-md bg-muted/50 p-3">
                <strong className="block text-foreground">
                  {READ_API_LIMIT_PER_MINUTE} requisições/minuto por chave
                </strong>
                Respeite o limite e aguarde antes de repetir chamadas limitadas.
              </p>
              <p className="rounded-md bg-muted/50 p-3">
                <strong className="block text-foreground">
                  Paginação: limit até 100
                </strong>
                Use limit e offset para consultar as páginas.
              </p>
              <p className="rounded-md bg-muted/50 p-3">
                <strong className="block text-foreground">
                  Mercado Livre: cache de 5 minutos
                </strong>
                partial indica dados incompletos; stale indica um resultado
                anterior. Não interprete esses estados como zero confirmado.
              </p>
            </div>
            <details className="rounded-md border border-border/70 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Exemplos e endpoints disponíveis
              </summary>
              <div className="mt-3 space-y-3">
                <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 text-xs">
                  <code>{curlExample}</code>
                </pre>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void copy(
                      curlExample,
                      "Exemplo copiado com SUA_CHAVE, sem a chave real."
                    )
                  }
                >
                  <Copy aria-hidden="true" /> Copiar exemplo seguro
                </Button>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {READ_API_ROUTES.map(route => (
                    <li
                      key={route.path}
                      className="rounded-md bg-muted/30 p-2 text-xs"
                    >
                      <code className="break-all font-medium">
                        GET {route.path}
                      </code>
                      <p className="mt-1 text-muted-foreground">
                        {route.title} · {route.scope}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Os exemplos usam apenas o placeholder SUA_CHAVE. Substitua-o
                  somente na configuração privada da sua integração.
                </p>
              </div>
            </details>
          </section>
        </div>
      )}
    </Card>
  );
}
