CREATE TABLE `drive_backup_config` (
	`id` int NOT NULL,
	`refreshToken` text,
	`accountEmail` varchar(200) NOT NULL DEFAULT '',
	`folderId` varchar(120) NOT NULL DEFAULT '',
	`folderName` varchar(200) NOT NULL DEFAULT '',
	`enabled` boolean NOT NULL DEFAULT false,
	`schedule_cron_task_uid` varchar(65),
	`scheduleHourUtc` int NOT NULL DEFAULT 9,
	`lastBackupAt` bigint,
	`lastStatus` varchar(16) NOT NULL DEFAULT '',
	`lastError` text,
	`lastFileId` varchar(120) NOT NULL DEFAULT '',
	`lastFileName` varchar(200) NOT NULL DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `drive_backup_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sku_variations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skuRowId` int NOT NULL,
	`variationIndex` int NOT NULL,
	`variationSku` varchar(140) NOT NULL DEFAULT '',
	`ean` varchar(60) NOT NULL DEFAULT '',
	`mlb` varchar(60) NOT NULL DEFAULT '',
	`done` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sku_variations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `sku_var_row_index_idx` ON `sku_variations` (`skuRowId`,`variationIndex`);