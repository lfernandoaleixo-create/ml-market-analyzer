ALTER TABLE `sku_product_number_reservations` ADD `isVoided` boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `sku_product_number_reservations`
SET `skuRowId` = NULL, `isVoided` = true
WHERE `productNumber` = 30002
  AND `skuRowId` = 330001
  AND EXISTS (
    SELECT 1 FROM `sku_sheet_rows`
    WHERE `id` = 330001
      AND `produto` = 'CONJUNTO CORAÇAO COLAR E BRINCO PRATA'
      AND `productNumber` IN (30, 30002)
  );
--> statement-breakpoint
INSERT INTO `sku_product_number_reservations` (`productNumber`, `skuRowId`, `isVoided`)
SELECT 30, 330001, false
WHERE EXISTS (
  SELECT 1 FROM `sku_sheet_rows`
  WHERE `id` = 330001
    AND `produto` = 'CONJUNTO CORAÇAO COLAR E BRINCO PRATA'
    AND `productNumber` IN (30, 30002)
)
AND NOT EXISTS (
  SELECT 1 FROM `sku_product_number_reservations` WHERE `productNumber` = 30
);
--> statement-breakpoint
UPDATE `sku_variant_number_reservations`
SET `productNumber` = 30
WHERE `skuRowId` = 330001
  AND `productNumber` = 30002
  AND `variantNumber` = 1;
--> statement-breakpoint
INSERT INTO `sku_value_reservations` (`normalizedSku`, `originalSku`, `sourceType`, `sourceKey`)
SELECT '2-joias-30-1', '2-JOIAS-30-1', 'main', '330001'
WHERE EXISTS (
  SELECT 1 FROM `sku_sheet_rows`
  WHERE `id` = 330001
    AND `produto` = 'CONJUNTO CORAÇAO COLAR E BRINCO PRATA'
    AND `sku` IN ('2-JOIAS-30-1', '2-JOIAS-30002-1')
)
AND NOT EXISTS (
  SELECT 1 FROM `sku_value_reservations` WHERE `normalizedSku` = '2-joias-30-1'
);
--> statement-breakpoint
UPDATE `sku_sheet_rows`
SET `productNumber` = 30,
    `sku` = '2-JOIAS-30-1',
    `revision` = `revision` + 1
WHERE `id` = 330001
  AND `produto` = 'CONJUNTO CORAÇAO COLAR E BRINCO PRATA'
  AND `productNumber` = 30002
  AND `variantNumber` = 1
  AND `sku` = '2-JOIAS-30002-1'
  AND `isDeleted` = false;
--> statement-breakpoint
INSERT INTO `sku_change_log` (
  `action`, `authorizedBy`, `description`, `affectedRowIds`, `oldValues`,
  `newValues`, `affectedCount`, `timestamp`, `idempotencyKey`
)
SELECT
  'correct_product_number',
  'Guilherme',
  'Correção autorizada por Guilherme da linha 330001: Nº Produto técnico 30002 corrigido para o próximo número comercial permanente 30 e SKU principal ajustado para 2-JOIAS-30-1. Nenhuma outra coluna, produto ou variação foi alterada. A reserva 30002 foi aposentada e não será reutilizada.',
  '[330001]',
  '{"productNumber":30002,"sku":"2-JOIAS-30002-1","variantNumber":1}',
  '{"productNumber":30,"sku":"2-JOIAS-30-1","variantNumber":1}',
  1,
  CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS UNSIGNED),
  'authorized-fix-row330001-product-30002-to-30-20260924'
WHERE EXISTS (
  SELECT 1 FROM `sku_sheet_rows`
  WHERE `id` = 330001
    AND `productNumber` = 30
    AND `sku` = '2-JOIAS-30-1'
)
AND NOT EXISTS (
  SELECT 1 FROM `sku_change_log`
  WHERE `idempotencyKey` = 'authorized-fix-row330001-product-30002-to-30-20260924'
);
--> statement-breakpoint
UPDATE `sku_sheet_rows`
SET `variante` = 'LIGADEZINCO - CONJUNTO CORAÇÃO - CHINA',
    `revision` = `revision` + 1
WHERE `id` = 330001
  AND `productNumber` = 30
  AND `variantNumber` = 1
  AND `sku` = '2-JOIAS-30-1'
  AND `variante` = 'LIGADEZINCO - PONTO DE LUZ - BRÁS'
  AND `isDeleted` = false;
--> statement-breakpoint
INSERT INTO `sku_change_log` (
  `action`, `authorizedBy`, `description`, `affectedRowIds`, `oldValues`,
  `newValues`, `affectedCount`, `timestamp`, `idempotencyKey`
)
SELECT
  'correct_variant_text',
  'Guilherme',
  'Correção autorizada por Guilherme da linha 330001: somente o texto da Variante foi alterado para LIGADEZINCO - CONJUNTO CORAÇÃO - CHINA. Nº Produto 30, Nº Variante 1, SKU 2-JOIAS-30-1 e todas as demais colunas foram preservados.',
  '[330001]',
  '{"variante":"LIGADEZINCO - PONTO DE LUZ - BRÁS"}',
  '{"variante":"LIGADEZINCO - CONJUNTO CORAÇÃO - CHINA"}',
  1,
  CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS UNSIGNED),
  'authorized-fix-row330001-variant-20260924'
WHERE EXISTS (
  SELECT 1 FROM `sku_sheet_rows`
  WHERE `id` = 330001
    AND `variante` = 'LIGADEZINCO - CONJUNTO CORAÇÃO - CHINA'
    AND `productNumber` = 30
    AND `sku` = '2-JOIAS-30-1'
)
AND NOT EXISTS (
  SELECT 1 FROM `sku_change_log`
  WHERE `idempotencyKey` = 'authorized-fix-row330001-variant-20260924'
);
--> statement-breakpoint
INSERT INTO `sku_change_log` (
  `action`, `authorizedBy`, `description`, `affectedRowIds`, `oldValues`,
  `newValues`, `affectedCount`, `timestamp`, `idempotencyKey`
)
SELECT
  'enable_explicit_sku_finalization',
  'Guilherme',
  'Política autorizada por Guilherme: novas linhas permanecem com skuMode pending e Produto/Variante editáveis até escolha explícita no card (gerar pela regra, reutilizar quando aplicável ou editar manualmente). Linhas finalizadas existentes permanecem imutáveis. Nenhum SKU existente foi alterado por esta política.',
  '[]',
  '{"finalization":"automatic_while_typing"}',
  '{"finalization":"explicit_card_decision"}',
  0,
  CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS UNSIGNED),
  'authorized-explicit-sku-finalization-20260924'
WHERE NOT EXISTS (
  SELECT 1 FROM `sku_change_log`
  WHERE `idempotencyKey` = 'authorized-explicit-sku-finalization-20260924'
);
