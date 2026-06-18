# Sondagem de peso — conta LOJADOSRWU (2026-06-17)

## Mercado Livre (fonte recomendada para o frete)
- `shipping.dimensions` veio **null** em TODOS os 15 itens (modo `me2`, logística `drop_off`).
- Porém o atributo **`SELLER_PACKAGE_WEIGHT`** (Peso da embalagem do vendedor) vem **preenchido em 100% dos itens**, em GRAMAS (ex.: "1920 g", "400 g", "4280 g", "12100 g").
- Também há `SELLER_PACKAGE_HEIGHT/WIDTH/LENGTH` (cm) para volume, se um dia precisarmos de peso cubado.
- Conclusão: o peso REAL usado pelo ML para frete é o `SELLER_PACKAGE_WEIGHT`. É a fonte mais fiel (é o que o vendedor declarou ao ML e que o ML usa para cobrar frete).

## Baselinker (fonte secundária / fallback)
- O campo `weight` existe, mas é **inconsistente**: a maioria em kg (0.15, 0.484, 1.401) e ALGUNS claramente errados/incoerentes (ex.: "weight":350 e "weight":960 — provavelmente gramas digitadas no campo de kg). Não confiável como fonte primária.

## Decisão
1. Fonte primária do peso = ML `SELLER_PACKAGE_WEIGHT` (converter g→kg).
2. Mapear kg → índice de faixa de peso da calculadora (ML_WEIGHT_KG) via menor faixa cujo limite >= kg.
3. Logística `drop_off`/`cross_docking`/`self_service`/`xd_drop_off` → "padrao" (Clássico); `fulfillment` → "full_super".
4. O usuário pode sobrescrever peso/frete/comissão no card (lote e por anúncio).

## Observação importante (frete vs frete grátis)
- Os itens são `me2` e a maioria com preço alto (frete grátis acima de R$79). O frete pago pelo vendedor depende de peso + faixa de preço + logística. O `SELLER_PACKAGE_WEIGHT` é o insumo que faltava.
