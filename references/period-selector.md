# Regra do seletor de período (padrão do sistema inteiro)

Todo card/seletor de **período de análise** no ML Market Analyzer DEVE usar o mesmo
componente e as mesmas 5 opções, na mesma ordem:

1. **Mês atual**
2. **Mês anterior**
3. **60 dias**
4. **Base histórica** — sempre desde o dia da **primeira venda** da loja (quando a
   operação começou). É calculada a partir de `account.storeLifetime.firstSaleMs`.
5. **Personalizado** — abre dois campos de data (`de` … `até`).

Qualquer seção nova que filtre por data NASCE com essas 5 opções. Não criar
seletores próprios (7/15/30/90 dias, "este mês", etc.).

## Peças compartilhadas

| Arquivo | Papel |
| --- | --- |
| `shared/period.ts` | Modelo unificado: `StandardPeriodKey`, `STANDARD_PERIOD_OPTIONS`, `resolveStandardRange`, `resolveStandardDays`, `rangeToDays`, `standardPeriodTitle`. Lógica de datas/timezone (BRT) e fonte única da verdade. |
| `client/src/hooks/usePeriod.ts` | Hook de estado. Recebe `firstSaleMs` e devolve `{ key, setKey, fromIso, toIso, setFromIso, setToIso, range, days, title }`. |
| `client/src/components/PeriodSelector.tsx` | Componente visual único (pílulas + range de datas no modo Personalizado + chip de título). |

## Como aplicar em uma tela nova

```tsx
import { usePeriod } from "@/hooks/usePeriod";
import { PeriodSelector } from "@/components/PeriodSelector";

const connected = conn.data?.connected === true;
const lifetime = trpc.account.storeLifetime.useQuery(undefined, { enabled: connected });

const period = usePeriod({
  initialKey: "current",
  firstSaleMs: lifetime.data?.firstSaleMs ?? null,
});

<PeriodSelector
  value={period.key}
  onChange={period.setKey}
  fromIso={period.fromIso}
  toIso={period.toIso}
  onFromIso={period.setFromIso}
  onToIso={period.setToIso}
  title={period.title}
/>
```

- **Backends por intervalo** (ex.: `account.salesRange`): use `period.range` →
  `{ fromMs, toMs }`.
- **Backends por janela de dias** (ex.: `finance.profitability`, `ads.*`): use
  `period.days` (já resolve "mês atual" → dias decorridos, "base histórica" → dias
  desde a 1ª venda, etc.). Esses backends aceitam `days` como inteiro livre (1–1095).

## Telas já padronizadas

- **Painel** (`pages/Painel.tsx`) — por intervalo.
- **Vendas** (`pages/Vendas.tsx`) — por intervalo.
- **Lucratividade** (`pages/Lucratividade.tsx`) — por dias.
- **ADS** (`pages/Ads.tsx`) — por dias; o período é passado a todas as abas
  (Dashboard, Campanhas, Anúncios, Categorias, Auditoria, Inteligência).

## Exceção consciente (NÃO é "período de análise")

- **Anúncios** (`pages/Anuncios.tsx`) tem um seletor de **janela de visitas**
  (7/30/90 dias). Isso NÃO é o período de análise: depende do endpoint
  `items/{id}/visits/time_window` do Mercado Livre, que só aceita janelas curtas e
  fixas. É um controle técnico de visitas e fica fora da regra das 5 opções. Se um
  dia o ML permitir janelas arbitrárias de visitas, reavaliar.
