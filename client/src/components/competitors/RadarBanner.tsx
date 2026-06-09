import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, ShieldAlert } from "lucide-react";

/**
 * Status banner for the competitor intelligence module. It reports how many of
 * the (up to four) independent data sources are active and reinforces the
 * security guarantee that this module is isolated from the user's ML seller
 * account. The system works with whatever sources are configured and gets more
 * accurate as more are activated (gradual activation).
 */
export function RadarBanner() {
  const { data } = trpc.competitors.sourcesStatus.useQuery();
  if (!data) return null;

  const total = data.sources.length;
  const active = data.configuredCount;
  const anyAvailable = data.anyAvailable;

  const tone = anyAvailable
    ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-700"
    : "border-amber-500/25 bg-amber-500/8 text-amber-700";

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${tone}`}>
      {anyAvailable ? (
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span className="leading-snug">
        {anyAvailable
          ? `Inteligência ativa com ${active} de ${total} fontes independentes. Quando mais de uma fonte responde, os dados são triangulados para maior precisão. Sua conta do Mercado Livre não é exposta nem utilizada nesta busca.`
          : "Inteligência ainda não configurada. Assim que ao menos uma chave de fonte de dados for adicionada, a busca de concorrentes fica disponível. Sua conta do Mercado Livre nunca é usada aqui."}
      </span>
      <Badge variant="outline" className="ml-auto shrink-0">
        {anyAvailable ? `${active}/${total} ativas` : "Pendente"}
      </Badge>
    </div>
  );
}
