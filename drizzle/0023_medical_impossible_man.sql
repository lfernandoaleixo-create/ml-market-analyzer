CREATE TABLE `migration_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` varchar(32) NOT NULL DEFAULT 'kit_to_sku',
	`sourceKitRowId` int,
	`targetSkuRowId` int,
	`label` varchar(400) NOT NULL DEFAULT '',
	`sku` varchar(120) NOT NULL DEFAULT '',
	`snapshot` text,
	`migratedByOpenId` varchar(64),
	`migratedByName` varchar(200),
	`migratedAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `migration_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `productNumber` int;--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `variantNumber` int;--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `tipoSku` varchar(4) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `categoryId` varchar(24);--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `categoryName` varchar(160);--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `subCategoryId` varchar(24);--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `subCategoryName` varchar(160);--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `produto` varchar(300) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `variante` varchar(300) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `gerarSkuKit` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `skuKit` varchar(120) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `gpc` varchar(30) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `cest` varchar(20) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `precoAtacado` varchar(40) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `embProfundidade` varchar(40) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `embLargura` varchar(40) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `embAltura` varchar(40) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `embPeso` varchar(40) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `kit_sheet_rows` ADD `caracteristicas` text;--> statement-breakpoint
CREATE INDEX `migration_history_kind_idx` ON `migration_history` (`kind`);--> statement-breakpoint
CREATE INDEX `migration_history_migrated_at_idx` ON `migration_history` (`migratedAt`);