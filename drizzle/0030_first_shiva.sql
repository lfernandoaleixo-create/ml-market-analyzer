CREATE TABLE `sku_variant_number_reservations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skuRowId` int NOT NULL,
	`tipoSku` varchar(20) NOT NULL,
	`categoryKey` varchar(255) NOT NULL,
	`productNumber` int NOT NULL,
	`variantNumber` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sku_variant_number_reservations_id` PRIMARY KEY(`id`),
	CONSTRAINT `sku_variant_number_row_unique_idx` UNIQUE(`skuRowId`),
	CONSTRAINT `sku_variant_number_group_unique_idx` UNIQUE(`tipoSku`,`categoryKey`,`productNumber`,`variantNumber`)
);
--> statement-breakpoint
CREATE INDEX `sku_variant_number_group_idx` ON `sku_variant_number_reservations` (`tipoSku`,`categoryKey`,`productNumber`);--> statement-breakpoint
INSERT INTO `sku_variant_number_reservations`
	(`skuRowId`, `tipoSku`, `categoryKey`, `productNumber`, `variantNumber`)
SELECT
	`current`.`id`, TRIM(`current`.`tipoSku`), LOWER(TRIM(`current`.`categoryName`)), `current`.`productNumber`, `current`.`variantNumber`
FROM `sku_sheet_rows` AS `current`
WHERE
	TRIM(`current`.`tipoSku`) <> ''
	AND `current`.`categoryName` IS NOT NULL
	AND TRIM(`current`.`categoryName`) <> ''
	AND `current`.`productNumber` IS NOT NULL
	AND `current`.`variantNumber` IS NOT NULL
	AND `current`.`variantNumber` > 0
	AND NOT EXISTS (
		SELECT 1
		FROM `sku_sheet_rows` AS `prior`
		WHERE `prior`.`id` < `current`.`id`
			AND TRIM(`prior`.`tipoSku`) = TRIM(`current`.`tipoSku`)
			AND LOWER(TRIM(`prior`.`categoryName`)) = LOWER(TRIM(`current`.`categoryName`))
			AND `prior`.`productNumber` = `current`.`productNumber`
			AND `prior`.`variantNumber` = `current`.`variantNumber`
	)
ORDER BY `current`.`id`;
