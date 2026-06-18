# Diagnóstico — divergência de visitas (Painel vs Anúncios ativos)

## Relato do usuário
- Gráfico do Painel: >100 visualizações ontem.
- Aba Anúncios ativos: visitas praticamente zeradas / "Preparando..." infinito.

## Investigação (18/06/2026)
1. Token do owner (LOJADOSRWU, seller 3308178634) está **válido** — `curl` direto:
   - `/users/me` → 200, identifica a conta.
   - `/users/{id}/items/search?status=active` → total 27 ativos.
   - `/items/{id}/visits/time_window?last=30&unit=day` → retorna `total_visits` real
     (ex.: 161, 42, 27, 13, 11...). As visitas EXISTEM.
2. No app (preview e produção), a aba zerava porque o ML passou a responder **429
   (Too Many Requests)** sob rajada de chamadas. O endpoint de visitas é **1 item por
   request**, então ~27 itens = ~27 chamadas, e com a coleta de ids + detalhes a conta
   estoura o limite do ML facilmente quando há vários refreshes/abas.

## Causas-raiz (no código)
A) **`getAllItemIds` confunde "fim da paginação" com "erro/429"**: quando a 1ª página
   volta vazia por 429, ele faz `break` e retorna `ids: []` → a aba mostra "0 anúncios"
   e zera TUDO (não distingue rate limit de loja vazia). Em `getListings`, deve propagar
   o 429 como `MLRateLimitError` (a classe já existe) em vez de devolver lista vazia.

B) **Visitas dependem de coleta item-a-item** (visitsStore, background, concorrência 4).
   No primeiro acesso resolve poucos itens; os demais ficam `visitsAvailable:false` →
   exibidos como 0. Some isso ao 429 e a soma fica muito menor que o gráfico, que usa
   o MESMO endpoint datado, mas já com cache aquecido. Não é bug de janela de dias
   (ambos usam `last=30&unit=day`); é tempo de coleta + 429.

## Correções planejadas
1. `getAllItemIds`/`getActiveItemIds`: detectar 429 e lançar `MLRateLimitError` em vez de
   retornar vazio (nunca zerar a lista por throttling).
2. `getListings`: ao receber `MLRateLimitError`, propagar para a procedure tratar como
   `status:"rate_limited"` (SWR mantém o último bom resultado / mostra aviso honesto,
   nunca "0 anúncios").
3. Visitas: aumentar a robustez da coleta (retry mais espaçado, manter o que já coletou).
   O gráfico e a aba usam a mesma fonte; com o cache aquecido convergem.
4. Reduzir o nº de chamadas: reusar a série de visitas já buscada pelo Painel quando
   disponível, em vez de refazer item-a-item na aba.

## Estado do limite
- Em 18/06 ~10:50 BRT o ML estava retornando 429 já na 1ª chamada (precisa esperar
  alguns minutos para reabrir). Validar correções só após o limite normalizar.
