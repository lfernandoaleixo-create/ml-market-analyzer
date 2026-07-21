DROP INDEX `sku_var_row_index_idx` ON `sku_variations`;--> statement-breakpoint
ALTER TABLE `sku_sheet_rows` ADD `mainMlb` varchar(60) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sku_sheet_rows` ADD `mainDone` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sku_variations` ADD CONSTRAINT `sku_var_unique_idx` UNIQUE(`skuRowId`,`variationIndex`);