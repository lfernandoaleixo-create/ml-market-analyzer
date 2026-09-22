CREATE TABLE `sku_value_reservations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`normalizedSku` varchar(160) NOT NULL,
	`originalSku` varchar(160) NOT NULL,
	`sourceType` varchar(16) NOT NULL,
	`sourceKey` varchar(80) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sku_value_reservations_id` PRIMARY KEY(`id`),
	CONSTRAINT `sku_value_normalized_unique_idx` UNIQUE(`normalizedSku`)
);
--> statement-breakpoint
INSERT INTO `sku_value_reservations` (`normalizedSku`, `originalSku`, `sourceType`, `sourceKey`)
SELECT `normalizedSku`, `originalSku`, `sourceType`, `sourceKey`
FROM (
	SELECT
		`historical`.*,
		ROW_NUMBER() OVER (
			PARTITION BY `normalizedSku`
			ORDER BY CASE WHEN `sourceType` = 'main' THEN 0 ELSE 1 END, `sourceKey`
		) AS `reservationRank`
	FROM (
		SELECT
			LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(`sku`), ' ', ''), '.', '-'), CHAR(9), ''), CHAR(10), ''), CHAR(13), '')) AS `normalizedSku`,
			`sku` AS `originalSku`,
			'main' AS `sourceType`,
			CAST(`id` AS CHAR) AS `sourceKey`
		FROM `sku_sheet_rows`
		WHERE TRIM(`sku`) <> ''
		UNION ALL
		SELECT
			LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(`variationSku`), ' ', ''), '.', '-'), CHAR(9), ''), CHAR(10), ''), CHAR(13), '')) AS `normalizedSku`,
			`variationSku` AS `originalSku`,
			'variation' AS `sourceType`,
			CONCAT(`skuRowId`, ':', `variationIndex`) AS `sourceKey`
		FROM `sku_variations`
		WHERE TRIM(`variationSku`) <> ''
	) AS `historical`
) AS `ranked`
WHERE `reservationRank` = 1;
--> statement-breakpoint
ALTER TABLE `sku_variations` ADD `revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `sku_value_source_idx` ON `sku_value_reservations` (`sourceType`,`sourceKey`);
