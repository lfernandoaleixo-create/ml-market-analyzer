# Análise de Viabilidade — Seção "Pesquisa de Mercado"

**Projeto:** ML Market Analyzer
**Data:** 09/06/2026
**Objetivo:** avaliar, ferramenta por ferramenta, o que faz sentido manter com **dados confiáveis**, considerando as duas fontes disponíveis: a **API oficial do Mercado Livre** (sua conta conectada, app não-certificada) e a **Unwrangle** (provedor de scraping que vamos contratar). O foco é manter apenas o que entrega informação real e utilizável, e ser honesto sobre o que nenhuma das fontes consegue sustentar.

---

## 1. As duas fontes de dados, sem ilusão

### 1.1 API oficial do Mercado Livre (sua conta, app não-certificada)

A partir da inspeção do provedor oficial do projeto, este é o comportamento **real** dos endpoints com o token OAuth da sua conta (situação de junho/2026):

| Endpoint | Situação | O que entrega |
|---|---|---|
| `/sites/MLB/search` | **403 — descontinuado para apps** | Nada (a busca pública aberta foi cortada para apps não-certificadas) |
| `/products/search` (catálogo) | OK | Nome, marca, fotos do **catálogo** (sem preço/vendas) |
| `/products/{id}` + `/products/{id}/items` | OK (parcial) | Preço, frete, vendedor das **ofertas ativas** (quando existem) |
| `/highlights/MLB/category/{id}` | OK | IDs dos **mais vendidos** por categoria |
| `/sites/MLB/categories` | OK | Árvore **real** de categorias |
| `/trends/MLB` | OK | Palavras-chave em **alta reais** |
| `/items?ids=...` | OK | Preço, `sold_quantity`, thumbnail (quando há oferta) |

**Limitações estruturais (confirmadas no código):**

- `rating` e `reviewsCount` saem **sempre como 0** (`ratingAvailable: false`). A API oficial **não expõe avaliação/nota por anúncio** para apps não-certificadas.
- `sold_quantity` só aparece quando há **oferta ativa** vinculada ao catálogo; muitos itens de catálogo vêm **sem oferta** (cobertura de preço ~10% em busca livre), e nesses casos o item aparece como **"sob consulta"**.
- O **volume de vendas de terceiros** (de concorrentes) **não é exposto** pela API oficial.

> Em resumo: a API oficial é **forte para catálogo, categorias, tendências de palavra-chave e mais vendidos**, e **fraca/indisponível para preço universal, avaliações e volume de vendas de concorrentes**.

### 1.2 Unwrangle (scraping — a contratar)

Confirmado na documentação oficial da Unwrangle, conector **Mercado Livre Brasil**. Há três endpoints relevantes:

**a) Search (`mercado_search`) — custo: ~1 crédito/requisição**

| Campo | Tipo | Observação |
|---|---|---|
| name, url, thumbnail, brand | — | Sempre presentes |
| price, listing_price | float | Preço atual e "de" (riscado) |
| rating | float | **"if available"** — frequentemente nulo |
| total_ratings | int | **"if available"** — frequentemente nulo |

> A busca da Unwrangle **não retorna volume de vendas** por anúncio. Avaliação e nº de avaliações vêm "quando disponíveis" (na prática, muitas vezes nulos na listagem).

**b) Product Details (`mercado_detail`) — custo: 10 créditos/requisição**

Retorna: name, url, image(s), price, listing_price, currency, brand, **description**, rating, total_ratings, specifications, features, reviews, is_available, **state** (novo/usado), **sold_by** (nome do vendedor), **seller_sales** (ex.: `"+10mil vendas"`), **seller_labels** (ex.: `"MercadoLíder"`).

> Aqui está o ouro do diagnóstico: **`seller_sales`** (volume de vendas do vendedor, em faixa textual) e **`seller_labels`** (reputação/MercadoLíder) — dados que a API oficial **não** entrega sobre concorrentes.

**c) Sellers (`mercado_sellers`) — custo: 10 créditos/requisição**

Retorna por vendedor que disputa um produto: price, condition, shipping, seller_name, **past_sales** (ex.: `"+1000 vendas"`). `sold_quantity` e `seller_rating` aparecem frequentemente **nulos**.

**Pontos de atenção sobre a Unwrangle (vividos por nós):**

- Estabilidade intermitente: o conector do ML retornou **HTTP 504 / "Parsing error"** de forma recorrente. Já temos **retry automático** no código, mas é um risco de confiabilidade real do provedor.
- `seller_sales`/`past_sales` são **faixas textuais** ("+10mil vendas"), não números exatos. Servem para **comparar ordem de grandeza**, não para cálculo fino.
- O custo do **detalhe** e do **sellers** é **10x** o da busca. Isso impacta diretamente quanto dá pra analisar por mês.

---

## 2. Veredito por ferramenta da seção "Pesquisa de Mercado"

As 7 ferramentas atuais: **Radar de concorrentes, Mais vendidos, Buscar produtos, Oportunidades, Comparar, Categorias e Monitoramento.**

### Legenda de classificação
- 🟢 **Confiável** — sustentada por dados reais de pelo menos uma fonte.
- 🟡 **Parcial** — útil, mas com lacuna conhecida (algum dado nulo ou estimado).
- 🔴 **Não sustentável** — depende de dado que **nenhuma** fonte entrega de forma confiável; recomenda-se remover, ocultar ou redesenhar.

| # | Ferramenta | Fonte principal | Classificação | Veredito curto |
|---|---|---|---|---|
| 1 | **Radar de concorrentes** | Unwrangle (search + detail) | 🟢 Confiável | É o caso de uso mais forte da Unwrangle: achar concorrentes e abrir o detalhe deles com `seller_sales`/`seller_labels`. Manter. |
| 2 | **Mais vendidos** | API oficial (`/highlights`) | 🟢 Confiável | Ranking real de mais vendidos por categoria. Manter. |
| 3 | **Buscar produtos** | API oficial (catálogo) + Unwrangle | 🟡 Parcial | Catálogo é real, mas preço tem baixa cobertura na busca oficial; Unwrangle preenche preço. **Avaliação/nota fica fraca.** Manter, ajustando expectativa. |
| 4 | **Categorias** | API oficial (`/categories`) | 🟢 Confiável | Árvore de categorias 100% real. Manter. |
| 5 | **Oportunidades** | Cálculo interno sobre dados parciais | 🔴 Não sustentável (hoje) | O score usa **"crescimento recente" derivado de hash do ID** (pseudo-aleatório) e **demanda da categoria fixa**. Não é dado real. Precisa redesenhar para usar só fatores reais, ou rotular como estimativa. |
| 6 | **Comparar** | API oficial + Unwrangle | 🟡 Parcial | Comparar **preço, frete, reputação** é viável. Comparar por **nota/avaliações** é fraco (campo quase sempre nulo). Manter os fatores reais, remover os que dependem de avaliação. |
| 7 | **Monitoramento** | Snapshots ao longo do tempo | 🟡 Parcial | Faz sentido para **preço** (dado real e estável). Para **vendas/posições**, depende de coleta recorrente e dos limites acima. Manter focado em preço. |

---

## 3. O que NENHUMA fonte entrega de forma confiável

Esta é a parte mais importante para não vender ilusão ao usuário:

1. **Volume exato de vendas de um anúncio concorrente.**
   - API oficial: não expõe vendas de terceiros.
   - Unwrangle: só dá **faixa do vendedor** (`seller_sales`, ex.: "+10mil vendas"), não vendas exatas do anúncio.
   - **Conclusão:** trabalhar com **faixas/ordem de grandeza**, nunca número exato.

2. **Avaliação (nota) e nº de avaliações de forma consistente.**
   - API oficial: 0 / indisponível para apps não-certificadas.
   - Unwrangle: "if available" — na prática, muitas vezes nulo na busca; melhora no detalhe, mas não é garantido.
   - **Conclusão:** não basear ranking/oportunidade em nota; usar só quando presente, como dado complementar.

3. **"Crescimento de vendas recente" de um produto.**
   - Não existe endpoint real para isso em nenhuma das fontes sem **série histórica própria**.
   - Hoje, a ferramenta de Oportunidades usa um valor **pseudo-aleatório derivado do ID** — ou seja, **não é real**.
   - **Conclusão:** só é confiável se construirmos histórico via **snapshots recorrentes** (monitoramento) ao longo de semanas. Antes disso, deve ser claramente rotulado como "estimativa" ou removido.

4. **Índice de demanda da categoria (0–100).**
   - É um número **fixo/interno**, não medido em tempo real.
   - **Conclusão:** substituir por algo real (ex.: tendências de palavra-chave do `/trends`, que são reais) ou rotular como referência.

---

## 4. Recomendação prática

**Manter como está (confiáveis):** Radar de concorrentes, Mais vendidos, Categorias.

**Manter ajustando expectativa (parciais):**
- **Buscar produtos** e **Comparar:** preservar preço, frete e reputação; tratar nota/avaliação como "quando disponível"; nunca como eixo principal.
- **Monitoramento:** focar em **preço** (e disponibilidade), que são confiáveis e ganham valor com o tempo.

**Redesenhar ou rotular antes de confiar:**
- **Oportunidades:** hoje mistura dados reais (preço, frete, mais vendidos) com **estimativas sintéticas** (crescimento por hash, demanda fixa). Duas saídas honestas:
  1. **Versão enxuta confiável:** recalcular o score só com fatores reais (preço competitivo, frete grátis, presença nos mais vendidos, reputação do vendedor via Unwrangle), removendo "crescimento recente" e "demanda fixa".
  2. **Versão evolutiva:** ativar o **monitoramento recorrente** para, em algumas semanas, ter crescimento de preço/posição **real** — aí "oportunidade" passa a ter base concreta.

**Sobre custo de créditos (decisão de plano):**
- Busca custa ~1 crédito; **detalhe e sellers custam 10 créditos cada**.
- Uma análise completa de 1 concorrente (busca + detalhe) ≈ **11 créditos**.
- Com o **trial (90 créditos)** dá para ~8 análises completas — suficiente para validar valor antes de pagar plano. Só vale assinar (US$ 99/mês = 100k créditos) se você for fazer **muitas** análises com detalhe/sellers por mês.

---

## 5. Resumo de uma linha

> **A combinação API oficial (catálogo, categorias, mais vendidos, tendências, preço de ofertas ativas) + Unwrangle (preço universal, `seller_sales`, `seller_labels`, sellers por produto) cobre bem concorrência, ranking e preço. O que NÃO é confiável em nenhuma fonte é: vendas exatas por anúncio, nota/avaliações de forma consistente e "crescimento recente" — estes devem ser tratados como faixa, como complemento opcional, ou construídos com histórico próprio via monitoramento.**
