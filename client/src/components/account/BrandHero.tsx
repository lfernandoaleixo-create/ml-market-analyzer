import { ReactNode } from "react";

/**
 * Cabeçalho de marca da página inicial. Painel TODO PRETO e sofisticado,
 * com a LOGOMARCA horizontal da TOUJOURS ("TOUJOURS — SEMPRE PRESENTE")
 * ocupando o lugar do nome da loja (sem "Olá"). À direita ficam as ações
 * (ex.: badge de saúde da conta). Responsivo: empilha em telas pequenas.
 *
 * A wordmark já é branca sobre fundo preto, por isso usamos `object-contain`
 * sobre o fundo preto do painel — a logo se integra sem moldura.
 */
const WORDMARK_URL = "/manus-storage/toujours-wordmark_4bdc58b1.png";

export function BrandHero({
  subtitle,
  actions,
}: {
  /** Mantido por compatibilidade; não é mais exibido (sem "Olá"). */
  greeting?: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-black shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)]">
      {/* Brilho verde sutil para dar profundidade sem clarear o fundo preto. */}
      <div
        className="pointer-events-none absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-primary/10 to-transparent"
        aria-hidden
      />

      <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:gap-8 md:px-10 md:py-8">
        {/* Logomarca da loja (substitui o nome/"Olá") + microcopy */}
        <div className="min-w-0 space-y-3">
          <img
            src={WORDMARK_URL}
            alt="TOUJOURS — Sempre presente"
            className="h-12 w-auto select-none md:h-16"
            draggable={false}
          />
          {subtitle && (
            <p className="max-w-xl text-sm leading-relaxed text-white/55">{subtitle}</p>
          )}
        </div>

        {/* Ações (badge de saúde, lembretes de conexão, etc.) */}
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      {/* Linha de marca na base, ecoando o sublinhado do logotipo. */}
      <div className="h-1 w-full bg-gradient-to-r from-primary via-primary/40 to-transparent" aria-hidden />
    </div>
  );
}
