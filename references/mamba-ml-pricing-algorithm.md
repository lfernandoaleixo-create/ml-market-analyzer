# Algoritmo exato da Calculadora de Precificação da Mamba (Mercado Livre)

Extraído do bundle `index-DTF4iuoj.js` (engenharia reversa, 17/06/2026).
Objetivo: replicar fielmente a auto-alimentação de **taxa fixa** e **frete** conforme as opções,
usando as tabelas reais do Mercado Livre.

## Entradas do bloco Marketplace (ML)
- Tipo de anúncio: **Clássico** | **Premium** (campo comissão default 12%, editável)
- Modelo logístico (radio): **Padrão** | **Full Super** | **Cat. Especiais**
- Switch **Frete Grátis Rápido (FGR)** (`programaFreteGratis`)
- Switch **Campanhas Destaque** (`campanhasDestaque`) — quando ligado soma `ky=6` na comissão
- Peso do produto embalado (combobox, 28 faixas) → índice `pesoSelecionado` (0..27)
- Reputação: assume "verde" (há "amarela" no código → usa OLt em vez de PLt no Premium)
- Comissão (%) — editável (default 12 ML)
- Taxa Fixa (R$) — AUTO (mostrada, normalmente 0 no ML; ver `cue()`)
- Custo de Frete (R$) — AUTO; switch **Manual** (`manualFreightEnabled`) permite sobrescrever

## Constantes
- `ky = 6`   → acréscimo de comissão quando Campanhas Destaque (FGR de comissão) ligado
- `I5 = 3.5` → desconto aplicado em pixSubsidy/uso interno (Premium subtrai I5 em uma das telas de info)
- `uue = 100` → teto: se o frete-percentual estourar, recалcula com custo fixo 100
- `hue = 10` → nº de iterações do solver
- `mue = 0.01` → tolerância de convergência (R$)
- `LLt` → preço máximo (sanidade); `FLt` → mínimo denominador

## Mapa de índice de peso → kg (RR)
```
0:0.3, 1:0.5, 2:1, 3:2, 4:3, 5:4, 6:5, 7:6, 8:7, 9:8, 10:9, 11:11, 12:13, 13:15,
14:17, 15:20, 16:25, 17:30, 18:40, 19:50, 20:60, 21:70, 22:80, 23:90, 24:100,
25:125, 26:150, 27:200 (acima de 150kg)
```
Labels: "Até 300g","300g a 500g","500g a 1kg","1kg a 2kg","2kg a 3kg","3kg a 4kg",
"4kg a 5kg","5kg a 6kg","6kg a 7kg","7kg a 8kg","8kg a 9kg","9kg a 11kg","11kg a 13kg",
"13kg a 15kg","15kg a 17kg","17kg a 20kg","20kg a 25kg","25kg a 30kg","30kg a 40kg",
"40kg a 50kg","50kg a 60kg","60kg a 70kg","70kg a 80kg","80kg a 90kg","90kg a 100kg",
"100kg a 125kg","125kg a 150kg","Mais de 150kg"

## Solver de preço ($Lt) — modo Custo → Preço
```
precoFromCustos(fixos, frete, comissaoPct, margemPct, impostosPct, tacosPct, afiliadosPct, outrosPct=0):
  denom = 1 - margem/100 - imposto/100 - tacos/100 - afiliado/100 - comissao/100 - outros/100
  if denom <= FLt: return -1
  preco = (fixos + frete) / denom
  return (preco>0 && finito && preco<=LLt) ? preco : -1
```
Onde `fixos = custoProduto + outrosCustosEmReais`. (outros em % entram no denom.)

## Frete (fue) — escolhe a tabela conforme opções
```
fue(pesoIdx, preco, isFullSuper, isCatEspecial, reputacao="verde"):
  kg = RR[pesoIdx]
  if isFullSuper:           // tabela jLt, faixas TLt (7 faixas)
      row = jLt.find(kg <= maxWeight) || último
      faixa = TLt(preco)    // 0-18.99 / 19-28.99 / 29-48.99 / 49-78.99 / 79-98.99 / 99-198.99 / 199+
      custo = row.costs[faixa]
      if preco < 29: custo = min(custo, preco*0.25)
      return custo
  if isCatEspecial:         // tabela OLt (reputacao amarela) ou PLt (verde) — faixas DLt (8 faixas)
      tabela = (reputacao==="amarela") ? OLt : PLt
      row = tabela.find(kg <= maxWeight) || último
      faixa = DLt(preco)    // 0-18.99 /19-48.99 /49-78.99 /79-99.99 /100-119.99 /120-149.99 /150-199.99 /200+
      return row.costs[faixa]
  // PADRÃO (Clássico) -> ALt
  ALt(pesoIdx, preco):
      row = qL.find(kg <= maxWeight) || último
      faixa = ELt(preco)    // mesmas 8 faixas do DLt
      custo = row.costs[faixa]
      if preco < 19: custo = min(custo, preco*0.5)
      return custo
```
NOTA sobre tabelas: confirmar mapeamento Premium. No código:
- Clássico Padrão → `qL` (ALt)
- Cat. Especiais (verde) → `PLt`; (amarela) → `OLt`
- Full Super → `jLt`
- `WL` (due) → custo fixo por peso usado em fallback quando preço<79 com FGR e sem full/especial.
  due(pesoIdx, preco): custo = WL.find(kg<=maxWeight).cost; if preco<19: min(custo, preco*0.5)

## Taxa fixa do ML (cue) e por faixa de preço (_y)
- `cue()` (ML) → `{ taxaFixa: 0, vendedorPagaFrete: true, meliPagaFrete: false }`
  → ou seja, no fluxo de FRETE a taxa fixa some (0). A "Taxa Fixa (R$)" exibida no ML costuma 0.
- `_y(preco, sellerType, campanhasDestaque)` (usado p/ Shopee e infos) por faixa de PREÇO:
  - preco < 80   → comissão 20, taxaFixaBase 4,  tier1
  - 80..<100     → 14, 16, tier2
  - 100..<200    → 14, 20, tier3
  - 200..<500    → 14, 26, tier4
  - >=500        → 14, 26, tier5
  - Regressivo p/ CPF e preço<12: 10..11.99→3.5; 8..9.99→3; <8→2
  - fixedFeeTotal = base + (cpf_full ? CLt=3 : 0)
  - campanhasDestaque (r=true) → comissão += I5(3.5)

## Loop iterativo ML (modo Custo→Preço) — REPLICAR EXATO
```
isFull = (logistic==="full_super"); isEsp = (logistic==="cat_especial")
fixosBase = custoProduto + outrosEmReais
frete = manual ? freteManual : 0
preco = solver(fixosBase, frete, comissao, margem, imp, tacos, afil, outros%)
repeat up to 10x:
  prev = preco
  taxaFixa = cue().taxaFixa          // = 0 no ML
  if not manualFrete:
     freteTab = fue(peso, preco, isFull, isEsp, reputacao)
     if FGR and preco<79 and not isFull and not isEsp:
        frete = due(peso, preco)     // tabela WL custo fixo
     else:
        frete = freteTab
  fixos = custoProduto + outrosEmReais + taxaFixa
  preco = solver(fixos, frete, comissao, margem, imp, tacos, afil, outros%)
  if |preco - prev| < 0.01: break
margemContribuicao = preco * margem/100
custosTotais (break even) = preco - margemContribuicao
precoBasePromocional = (min(desconto,80)>0) ? preco/(1 - min(desconto,80)/100) : null
```
ATENÇÃO: no exemplo capturado (custo30, margem20, comissão12, sem FGR, padrão, peso "Até 300g")
o frete exibido foi R$ 7,75 e preço R$ 55,51. Conferindo: faixa de preço 55,51 → "49-78.99".
qL("Até 300g"=idx0)["49-78.99"] = 7,75. ✓  → fixos=30+0=30, frete=7,75 →
preco = (30+7,75)/(1-0,12-0,20)=37,75/0,68=55,51 ✓ (a comissão usada é a do campo: 12%).
Ao mudar peso p/ "1kg a 2kg" (idx3) faixa "49-78.99"→ na verdade preço subiu p/56,10 →
qL idx3 (maxWeight 2) ["49-78.99"]=8,05? medido 8,15 (idx4 maxWeight2?). Ajustar índice: confirmamos
qL maxWeight:2 / "49-78.99" = 8,15. ✓ (preço 56,10 ainda na faixa 49-78.99).

## Marketplaces (cAe) — defaults
- meli:   defaultComissao 12, defaultTaxaFixa 6.25 (mas cue() zera no fluxo ML)
- shopee: defaultComissao 12, defaultTaxaFixa 6.25 (usa _y para taxa fixa real)
- outros: defaultComissao 14, defaultTaxaFixa 4
- Premium: ao alternar Clássico→Premium a UI sobe a comissão (observado 12→17). Tratar como
  acréscimo configurável (Premium = Clássico + 5 p.p. por padrão, editável).

## Modo Preço → Margem (inverso)
Dado preço informado e custos:
```
custosVarPct = comissao + impostos + tacos + afiliados + outros%
margemReais = preco - (custoProduto + outrosEmReais + taxaFixa + frete) - preco*custosVarPct/100
margemPct = margemReais / preco * 100
```
(frete/taxaFixa também são auto conforme o preço informado e as opções.)

## Tabelas em JSON
Salvas em `/home/ubuntu/mamba_bundle/tables.json` (qL, OLt, PLt, jLt, WL).
Copiar para `shared/ml-shipping-tables.ts` no projeto.
