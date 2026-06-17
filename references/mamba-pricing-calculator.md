# Análise — Calculadora de Precificação da Mamba Nexus

Fonte: https://www.mambanexus.com.br/tools/pricing-calculator (acesso autenticado de Fernando)
Objetivo: replicar/adaptar a lógica na aba "Calculadora de precificação" do Mercato.

## Estrutura geral
Layout em 2 colunas: ESQUERDA = formulário de entrada; DIREITA = painel de resultados
("Preencha o custo do produto para ver os resultados" enquanto vazio).
Ações no topo: "Adicionar à Lista", "Salvar Cálculo".

## 1) Custos Base do Produto
- Identificação: Nome do Produto (texto), SKU (texto)
- **Modo de Cálculo** (toggle, 2 modos):
  - **Custo → Preço**: informa custos + margem desejada → calculadora mostra o PREÇO de venda ideal por marketplace.
  - **Preço → Margem**: informa o preço e vê a margem real.

## 2) Margem de Lucro Desejada
- Slider 0% — 50% (com marcações 0/25/50) + input numérico (%). Default 20%.
- (Aplica no modo Custo → Preço.)

## 3) Custos
- **Custo do Produto (R$)** * (obrigatório)
- **Impostos (%)**
- **Tacos (%)**  — (taxa de ADS/publicidade, TACoS)
- **Afiliados (%)**
- **Outros Custos** — alternável entre R$ e % (toggle R$/%)

## 4) Marketplace
- Seleção de canal: **Mercado Livre** | **Shopee** | **Outro Marketplace**
- Mercado Livre:
  - Tipo de anúncio: **Clássico** | **Premium**
  - **Modelo logístico** (radio): 📦 Padrão | 🛒 Full Super | 📦 Cat. Especiais
  - Switch: 🚚 **Frete Grátis Rápido (FGR)**
  - Bloco de cubagem/frete: "Informe dimensões e peso para calcular a cubagem e descobrir
    quanto o marketplace realmente cobra de frete":
    - Comp. (cm), Larg. (cm), Alt. (cm), Peso Real (kg)
    - **Peso do Produto (Embalado)**: combobox (ex.: "Até 300g")
  - Nota: "Todos os cálculos consideram reputação verde."
  - **Comissão (%)** (auto, editável)
  - **Taxa Fixa (R$)** (auto)
  - **Custo de Frete (R$)** — com switch "Manual" para sobrescrever

## Resultados (painel direito) — a investigar preenchendo valores
Pelos destaques da landing, o painel mostra:
- Preço sugerido de venda
- Margem de contribuição (quanto sobra por venda após impostos, comissões e custos)
- Custo total / detalhamento (fixo, variável)
- Ponto de equilíbrio
- Lucro estimado
- Exportável em CSV/planilha

## Regras conhecidas do Mercado Livre (a confirmar nos cálculos)
- Comissão por tipo de anúncio (Clássico vs Premium) varia por categoria.
- Taxa fixa por faixa de preço (itens baratos): ML cobra taxa fixa em pedidos abaixo de
  determinado valor.
- Frete: depende de peso/cubagem, modelo logístico e se o anúncio tem frete grátis (vendedor paga).
- Reputação verde assumida.

## TODO de investigação
- [ ] Preencher um exemplo (custo, margem, ML clássico) e capturar os números de saída
      para inferir as fórmulas (comissão, taxa fixa, frete, preço final).
- [ ] Confirmar tabela de comissão/taxa fixa/frete que eles usam.

## FÓRMULA CONFIRMADA (modo Custo → Preço)

Exemplo capturado: Custo R$ 30,00; Margem 20%; ML Clássico; Comissão 12%; Frete R$ 7,75;
Impostos/Tacos/Afiliados/Outros = 0; Taxa Fixa = 0.

Detalhamento exibido:
- Custos Fixos: Custo do Produto R$ 30,00 + Frete R$ 7,75 = **Total Fixo R$ 37,75**
  (Taxa Fixa entraria aqui também quando > 0)
- Custos Variáveis (% do Preço): Margem 20% (R$ 11,10) + Comissão 12% (R$ 6,66)
  = **Total Variável 32% (R$ 17,76)**
  (Impostos %, Tacos %, Afiliados %, Outros% também entram aqui quando > 0)
- Resumo: Custo Total (Break Even) R$ 44,41 | Margem de Contribuição R$ 11,10 |
  **Preço de Venda R$ 55,51**

### Fórmula (markup divisor):
```
fixos      = custoProduto + frete + taxaFixa + outrosEmReais
variaveisPct = margemDesejada% + comissao% + impostos% + tacos% + afiliados% + outros%(se em %)
Preço de Venda = fixos / (1 - variaveisPct/100)
Margem de Contribuição (R$) = margemDesejada% * Preço
Custo Total (Break Even)    = Preço - Margem de Contribuição  (= fixos + (variaveisPct - margem)% * Preço)
```
Conferência: 37,75 / (1 - 0,32) = 37,75 / 0,68 = 55,5147 ≈ R$ 55,51 ✓
Margem contrib = 0,20 * 55,51 = 11,10 ✓ ; Break even = 55,51 - 11,10 = 44,41 ✓

### Modo Preço → Margem (inverso):
Dado o Preço informado e os custos, calcular a margem real:
```
variaveisCustoPct = comissao% + impostos% + tacos% + afiliados% + outros%
margemReal(R$)  = Preço - fixos - (variaveisCustoPct/100)*Preço
margemReal(%)   = margemReal(R$) / Preço * 100
```

## Distribuição da Receita (donut)
Percentual de cada componente sobre o preço: Margem 20%, Custo Produto 54%, Comissão 12%, Frete 14%.
(Custo Produto% = 30/55,51 = 54%; Frete% = 7,75/55,51 = 14%.)

## Promoção
Campo "Aplicar Promoção (%)" recalcula a partir do "Preço Base" (desconto sobre o preço sugerido).

## Saída/itens
- Preço de Venda Sugerido (destaque)
- Margem de Contribuição (R$)
- Custo Total (Break Even)
- Donut "Distribuição da Receita" + legenda com %
- "Ver detalhamento do cálculo" expansível (Fixos / Variáveis / Resumo) + switch "Ocultar itens zerados"
- Ações: "Adicionar à Lista", "Salvar Cálculo" (+ histórico)

## Campos do bloco Marketplace (ML)
- Comissão (%): default 12% no Clássico (Premium maior, ~17%); editável
- Taxa Fixa (R$): depende da faixa de preço do ML (itens de baixo valor)
- Custo de Frete (R$): auto via cubagem (dimensões+peso) OU switch "Manual"
- Frete já veio R$ 7,75 sem dimensões → valor default/estimado; com FGR e dimensões muda

## Premium (confirmado)
Ao trocar Clássico→Premium, Comissão muda de 12% → **17%**.
Exemplo: Custo 30, margem 20%, frete 7,75, comissão 17% → variável 37% → Preço = 37,75/0,63 = R$ 59,92 ✓
(Custo Produto% 50%, Comissão 17%, Frete 13%.)

## Defaults observados
- Comissão Clássico: 12% | Premium: 17% (editáveis)
- Frete default exibido: R$ 7,75 (sem dimensões); editável via switch "Manual"
- Taxa Fixa default: R$ 0,00 (editável)
- Modelo logístico inicial: Padrão; FGR off
