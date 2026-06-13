# Tributação — Lucro Presumido + ICMS/DIFAL + TTS-MG (GRUPO FOX, Minas Gerais)

> Base de estudo para o motor de imposto da aba "Lucratividade Real".
> ATENÇÃO: estes são parâmetros de referência. As alíquotas finais devem ser confirmadas
> com o contador. O sistema deve deixar tudo CONFIGURÁVEL.

## 1. Tributos federais — Lucro Presumido (comércio/revenda)
Incidem sobre a RECEITA da venda (faturamento), independentemente do estado:
- PIS (cumulativo): **0,65%**
- COFINS (cumulativo): **3,00%**
- IRPJ e CSLL: incidem sobre a BASE PRESUMIDA, não sobre a receita cheia.
  - Comércio: presunção IRPJ = 8% da receita; CSLL = 12% da receita.
  - IRPJ = 15% sobre a base presumida → 15% × 8% = **1,2% da receita**.
  - CSLL = 9% sobre a base presumida → 9% × 12% = **1,08% da receita**.
  - Adicional IRPJ de 10% sobre base que exceder R$ 60.000/trimestre (lucro alto).
- Soma federal típica sobre receita (comércio, sem adicional): 0,65 + 3,00 + 1,2 + 1,08 = **~5,93%**.
  - OBS: IRPJ/CSLL são apurados no conjunto da empresa por trimestre; aqui usamos a
    aproximação "por dentro" da receita para estimar lucro por venda. Configurável.

## 2. ICMS (estadual) — regime NORMAL (SEM TTS) — origem MG
Venda a consumidor final (B2C, e-commerce). 100% do DIFAL vai ao destino desde 2019.
- Venda DENTRO de MG (interna): alíquota interna MG = **18%**.
- Venda INTERESTADUAL: ICMS origem (interestadual) + DIFAL para o destino:
  - Alíquota interestadual de saída de MG:
    - 12% para Sul/Sudeste (exceto ES).
    - 7% para Norte/Nordeste/Centro-Oeste e ES.
  - DIFAL = (alíquota interna do estado de DESTINO) − (alíquota interestadual).
  - Carga total ICMS na operação interestadual ≈ alíquota interna do DESTINO
    (origem fica com a interestadual; destino recebe o DIFAL = diferença).
  - Ex.: MG → SP. Interestadual 12%. Interna SP 18%. DIFAL 6%. Carga ICMS total ~18%.
  - Ex.: MG → BA. Interestadual 7%. Interna BA 20,5%. DIFAL 13,5%. Carga ICMS total ~20,5%.
- FCP (Fundo de Combate à Pobreza): adicional de até 2% em alguns estados/produtos. Configurável por UF.
- IMPORTANTE: no Lucro Presumido (diferente do Simples), a empresa É contribuinte e
  recolhe ICMS próprio + DIFAL nas vendas interestaduais a não contribuinte.

### Alíquotas internas por UF (destino) — 2025 (referência, configurável)
AC 19, AL 19, AM 20, AP 18, BA 20.5, CE 20, DF 20, ES 17, GO 19, MA 23, MG 18,
MS 17, MT 17, PA 19, PB 20, PE 20.5, PI 22.5, PR 19.5, RJ 20 (+FCP), RN 20, RO 19.5,
RR 20, RS 17, SC 17, SE 19, SP 18, TO 20.

### Interestadual de saída de MG por destino
7%: Norte, Nordeste, Centro-Oeste e ES.
12%: Sul e Sudeste exceto ES (ou seja, SP, RJ, PR, SC, RS).

## 3. ICMS COM TTS/E-commerce de MG (Resolução SEF/MG 5.793/2024)
Regime especial: crédito presumido → carga EFETIVA de ICMS muito menor.
Cartilha CRC/MG (carga efetiva por crédito presumido):
- Vendas INTERESTADUAIS: carga efetiva de **1,3%** (independente de ser 4/7/12% a interestadual).
  - Pode chegar a **1,0%** mediante compromisso de crescimento de arrecadação (15% + IPCA).
- Vendas INTERNAS (dentro de MG): carga efetiva por crédito presumido:
  - **2%** quando alíquota interna do produto é 12%
  - **6%** quando alíquota interna é 18% (caso geral)
  - **13%** quando alíquota interna é 25%
- Dispensa de ICMS-ST nas entradas; diferimento na importação (carga 1,6%).
- Requisitos: empresa em MG, Lucro Presumido/Real (Simples NÃO pode), 100% vendas não presenciais, B2C/consumo próprio.
- Vantagem central p/ e-commerce que vende para todo Brasil: a MAIORIA das vendas é interestadual
  → cai de ~18% (carga destino) para **1,3%**. Economia enorme.

## 4. Os 2 MODELOS pedidos pelo Fernando
### Modelo A — SEM TTS (regime normal hoje)
ICMS por venda = carga do estado de destino:
- Interna MG: 18%.
- Interestadual: alíquota interna do destino (origem 7/12% + DIFAL até o interno do destino).
+ Federais Lucro Presumido (~5,93% receita) + comissão ML + frete + CMV.

### Modelo B — COM TTS (cenário futuro, na iminência de conseguir)
ICMS por venda (crédito presumido):
- Interna MG: 6% (alíquota interna 18%).
- Interestadual: 1,3% (ou 1,0% com compromisso de arrecadação).
+ Federais Lucro Presumido (iguais) + comissão ML + frete + CMV.
→ O sistema mostra os dois lado a lado: "quanto você lucra hoje" vs "quanto lucraria com o TTS".

## 5. Respostas às perguntas do Fernando
### "Quando a venda é efetivada, o imposto real a pagar fica na Base ou é o contador que calcula?"
- O **recolhimento oficial** (guias, GNRE/DIFAL, apuração mensal/trimestral, SPED) é
  **obrigação do contador** — é ele quem apura e gera o que de fato será pago ao fisco.
- O BaseLinker pode até ter módulo fiscal/NF-e, mas a APURAÇÃO e o pagamento legal são do contador.
- O NOSSO sistema NÃO substitui o contador. Ele faz a **estimativa gerencial** do imposto por
  venda/anúncio para você enxergar a MARGEM REAL na hora de precificar e decidir. É uma régua de
  gestão, não a guia oficial. Deixar isso explícito na UI (disclaimer).

### "Como tratar o DIFAL, já que depende do estado de destino?"
- O pedido do BaseLinker traz o estado de destino (`delivery_state` / `delivery_country_code`).
- O motor calcula o ICMS/DIFAL por UF de destino usando a tabela de alíquotas internas.
- SEM TTS: carga ICMS = alíquota interna do destino (origem interestadual + DIFAL).
- COM TTS: carga efetiva fixa (1,3% interestadual / 6% interna MG) — o DIFAL deixa de pesar.
- Quando faltar o estado de destino, usar uma alíquota média configurável (fallback) e sinalizar estimativa.

## 6. Implicações para o sistema
- Tudo configurável: alíquotas federais, presunção, alíquotas internas por UF, FCP por UF, carga TTS.
- Toggle de cenário: "Sem TTS" vs "Com TTS" (comparativo).
- Por venda: usar UF de destino real do pedido.
- Por anúncio: agregar vendas (e usar distribuição real de UFs daquele anúncio).
- Disclaimer: estimativa gerencial; apuração oficial é do contador.
