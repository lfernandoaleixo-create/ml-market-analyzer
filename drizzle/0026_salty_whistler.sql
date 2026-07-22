CREATE TABLE `sku_change_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` varchar(40) NOT NULL,
	`authorizedBy` varchar(100) NOT NULL,
	`description` varchar(1000) NOT NULL DEFAULT '',
	`affectedRowIds` text,
	`oldValues` text,
	`newValues` text,
	`affectedCount` int NOT NULL DEFAULT 0,
	`timestamp` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sku_change_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `sku_change_log_action_idx` ON `sku_change_log` (`action`);--> statement-breakpoint
CREATE INDEX `sku_change_log_timestamp_idx` ON `sku_change_log` (`timestamp`);--> statement-breakpoint
CREATE INDEX `sku_change_log_author_idx` ON `sku_change_log` (`authorizedBy`);