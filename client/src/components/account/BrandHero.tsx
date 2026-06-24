import { ReactNode } from "react";

/**
 * Cabeçalho de marca da página inicial. Painel escuro e sofisticado em
 * gradiente grafite, com a logo TOUJOURS à esquerda (a própria logo é branca
 * sobre preto, por isso o fundo escuro a integra de forma natural) e a saudação
 * + subtítulo à direita. Ações (ex.: badge de saúde da conta) aparecem no canto
 * superior direito. Responsivo: empilha em telas pequenas.
 */
const LOGO_URL = "/manus-storage/toujours-logo_6a1debf8.webp";

export function BrandHero({
  greeting,
  subtitle,
  actions,
}: {
  greeting: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#0b0b0d] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)]">
      {/* Brilhos sutis de fundo para dar profundidade ao painel escuro. */}
      <div
        className="pointer-events-none absolute -left-16 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-primary/10 to-transparent"
        aria-hidden
      />

      <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:gap-8 md:p-8">
        {/* Bloco da marca: logo + microcopy */}
        <div className="flex items-center gap-5">
          <img
            src={LOGO_URL}
            alt="TOUJOURS — Sempre presente"
            className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-white/10 md:h-24 md:w-24"
          />
          <div className="min-w-0 space-y-2">
            <h1 className="font-display text-2xl leading-tight tracking-tight text-white md:text-3xl">
              {greeting}
            </h1>
            {subtitle && (
              <p className="max-w-xl text-sm leading-relaxed text-white/55">{subtitle}</p>
            )}
          </div>
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
