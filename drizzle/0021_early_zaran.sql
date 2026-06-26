CREATE TABLE `sku_sheet_custom_columns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL DEFAULT '',
	`position` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sku_sheet_custom_columns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `sku_sheet_rows` ADD `customValues` text;--> statement-breakpoint
CREATE INDEX `sku_sheet_custom_col_position_idx` ON `sku_sheet_custom_columns` (`position`);