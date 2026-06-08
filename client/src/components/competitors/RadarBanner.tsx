import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, ShieldAlert } from "lucide-react";

/**
 * Status banner for the competitor intelligence module. It tells the user
 * whether the third-party API is configured, and reinforces the security
 * guarantee that this module is isolated from their ML seller account.
 */
export function RadarBanner() {
  const { data } = trpc.competitors.status.useQuery();
  if (!data) return null;
  const configured = data.configured;
  const tone = configured
    ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-700"
    : "border-amber-500/25 bg-amber-500/8 text-amber-700";
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${tone}`}>
      {configured ? (
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span className="leading-snug">
        {configured
          ? "Inteligência ativa. A coleta usa um serviço de dados independente — sua conta do Mercado Livre não é exposta nem utilizada nesta busca."
          : "Inteligência ainda não configurada. Assim que a chave do serviço de dados for adicionada, a busca de concorrentes fica disponível. Sua conta do Mercado Livre nunca é usada aqui."}
      </span>
      <Badge variant="outline" className="ml-auto shrink-0">
        {configured ? "Ativo" : "Pendente"}
      </Badge>
    </div>
  );
}
