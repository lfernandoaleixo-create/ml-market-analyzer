# Análise — Demais ferramentas da Mamba Nexus

## 3) Diagnóstico Estratégico
Fonte: /preview/diagnostic → /tools/diagnostic/{uuid}
- Tempo médio: 10-20 min | Saída: PDF exportável | Custo Mamba: 50 coins
- Fluxo: questionário (perguntas múltipla escolha) divididas por **5 Pilares**:
  Pessoas, Estratégia, Financeiro, Estrutura, Marketplaces.
- Ex. Pergunta 1/5: "Quantas pessoas trabalham hoje na sua operação (incluindo você)?"
  Opções: Somente eu / De 2 a 5 / De 5 a 10 / De 10 a 30 / Mais de 30 → "Avançar".
- IA analisa respostas → calcula maturidade, notas por pilar, insights e **plano de ação personalizado**.
- Saída: dashboard com nível de maturidade + notas por pilar + recomendações + PDF.
- Replicação no Mercato: questionário por pilares + cálculo de score + análise via invokeLLM
  (gerar insights e plano de ação) + relatório. NÃO usa dados do ML diretamente.

## 4) Raio-x do Anúncio
- Custo Mamba: 25 coins
- "Diagnóstico completo do seu anúncio com análise de funil e ações recomendadas."
- Entrada provável: link/ID do anúncio do ML → análise de funil (visitas→conversão),
  qualidade da ficha, fotos, etc. + ações recomendadas.
- OBS: O Mercato JÁ tem dados reais dos anúncios do ML conectado. Forte candidato a usar
  dados próprios em vez de pedir link. (Há também conhecimento do usuário: card
  "Raio X da Ficha Técnica" inspirado em seconds.com.br — relacionado mas distinto.)

## 5) Gerador de Imagens IA
- Custo Mamba: a partir de 75 coins | "Novo"
- Gera imagens profissionais para anúncios: cards de benefícios, fotos ambientadas, banners.
- Replicação: usar generateImage() do template (server/_core/imageGeneration.ts).

## 6) Criação de Clips
- Custo Mamba: 600 coins | "Atualizado"
- Transforma as imagens do anúncio em vídeo via IA.
- Replicação: geração de vídeo (não há helper nativo de vídeo no template; avaliar viabilidade
  ou marcar como "Em breve").

## Estrutura de cada ferramenta na Mamba (padrão)
Página "preview" (landing da ferramenta): banner com título + descrição + botão "Iniciar",
metadados (tempo médio, formato de saída, custo, ideal para), abas Ferramenta/Histórico,
seção "Conheça a ferramenta" (prints), "Destaques" (cards), "Como funciona" (passos numerados).
Depois entra na ferramenta em si (/tools/...).

## Decisão de escopo para o hub do Mercato
Hub = grade de cards (modelos), cada um abre sua própria sub-página:
1. Calculadora de Precificação  — IMPLEMENTAR (lógica conhecida)
2. Ponto de Equilíbrio          — IMPLEMENTAR (lógica conhecida)
3. Diagnóstico Estratégico      — IMPLEMENTAR (questionário + IA)  [fase posterior]
4. Raio-x do Anúncio            — IMPLEMENTAR usando dados do ML    [fase posterior]
5. Gerador de Imagens IA        — IMPLEMENTAR (generateImage)       [fase posterior]
6. Criação de Clips             — placeholder "Em breve" (vídeo)    [avaliar]

Prioridade imediata (esta entrega): hub + as 2 calculadoras numéricas (Precificação e
Ponto de Equilíbrio), que são o núcleo "calculadora". As demais entram como cards no hub,
algumas já funcionais e outras como "Em breve", conforme andamento.
