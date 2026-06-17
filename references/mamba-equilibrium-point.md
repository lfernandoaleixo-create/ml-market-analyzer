# Análise — Ponto de Equilíbrio (Mamba Nexus)

Fonte: https://www.mambanexus.com.br/tools/equilibrium-point
Layout: ESQUERDA = formulário em 3 seções colapsáveis; DIREITA = resultados.

## Entradas (3 seções)

### 1) Informações de venda
- Faturamento bruto (mensal) — R$
- Faturamento cancelado (mensal) — R$
- Unidades vendidas — número (unid.)

### 2) Custos variáveis
- Custo de mercadoria vendida (CMV) — R$
- Investimento em publicidade — R$
- Comissão do canal de venda — R$
- Custo de frete/envios — R$
- Custo de embalagem — R$
- Custo de devolução — R$
- Alíquota (%) 
- Outros impostos (%)

### 3) Custos fixos (todos R$/mês)
Pró-labore, Folha de pagto., Aluguel, Água e Energia, Internet, Seguro,
Sistema de gerenciamento, Outros Softwares e Licenças, Taxas Mensais Bancárias,
Empréstimos e Financiamentos, Contabilidade, Outros.

Botão: "Calcular ponto de equilíbrio"

## Saídas (painel direito)
- **Ponto de equilíbrio (R$)**: "Receita mínima para não operar no negativo"
  + nº de unidades "Considerando ticket médio de (R$ X)"
- **Custos pela margem** (donut: Custos fixos / Custos variáveis / Margem)
- **Margem de contribuição** (R$ e %)
- **Margem unitária** (R$)
- **Custos variáveis por unidade** (R$)
- **Análise do Nexus** (insight em texto via IA)
- **Demonstrativo Financeiro** (DRE): Lucro Líquido, Margem, Impostos — Baixar Excel / Ver DRE completo
- **Análise de cenários**: tabela com Ponto de equilíbrio / Cenário Atual -10% / +10%
  (cada um com Volume, Receita, Lucro, Margem) — Baixar Excel / Ver tabela completa

## Fórmulas (padrão de ponto de equilíbrio)
```
ticketMedio = faturamentoLiquido / unidades        (fat. líquido = bruto - cancelado)
custoVariavelTotal = soma custos variáveis (R$) + (alíquota%+outros%)*faturamento
custoVariavelUnit  = custoVariavelTotal / unidades
margemContribUnit  = ticketMedio - custoVariavelUnit
margemContribPct   = margemContribUnit / ticketMedio
custoFixoTotal     = soma custos fixos
PE (R$)   = custoFixoTotal / margemContribPct
PE (unid) = custoFixoTotal / margemContribUnit
lucroLiquido = faturamento - custoVariavelTotal - custoFixoTotal
```
Cenários -10%/+10%: recalcular volume/receita/lucro/margem variando o volume de vendas.
