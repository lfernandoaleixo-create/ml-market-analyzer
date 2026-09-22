CREATE TABLE `sku_product_number_reservations` (
	`productNumber` int AUTO_INCREMENT NOT NULL,
	`skuRowId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sku_product_number_reservations_productNumber` PRIMARY KEY(`productNumber`),
	CONSTRAINT `sku_product_number_row_unique_idx` UNIQUE(`skuRowId`)
);
--> statement-breakpoint
INSERT INTO `sku_product_number_reservations` (`productNumber`, `skuRowId`)
SELECT `productNumber`, MIN(`id`)
FROM `sku_sheet_rows`
WHERE `productNumber` IS NOT NULL AND `productNumber` > 0
GROUP BY `productNumber`
ORDER BY `productNumber`;--> statement-breakpoint
ALTER TABLE `sku_sheet_rows` ADD `skuMode` varchar(16) DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `sku_sheet_rows` ADD `skuSourceRowId` int;--> statement-breakpoint
ALTER TABLE `sku_sheet_rows` ADD `skuDecisionAt` bigint;--> statement-breakpoint
ALTER TABLE `sku_sheet_rows` ADD `isDeleted` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sku_sheet_rows` ADD `deletedAt` bigint;--> statement-breakpoint
CREATE INDEX `sku_sheet_deleted_idx` ON `sku_sheet_rows` (`isDeleted`);--> statement-breakpoint
INSERT INTO `sku_change_log` (
	`action`, `authorizedBy`, `description`, `affectedRowIds`, `oldValues`, `newValues`, `affectedCount`, `timestamp`
) VALUES (
	'policy_authorization',
	'Guilherme',
	'Política autorizada: exclusão lógica de linhas; números e SKUs históricos imutáveis; novo produto usa sequência permanente; reutilização de SKU somente por escolha explícita no card.',
	'[]',
	NULL,
	'{"policyVersion":"sku-immutable-v1","preserveExisting":true,"allowIntentionalReuse":true}',
	0,
	CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS UNSIGNED)
);
