ALTER TABLE `drive_backup_config` ADD `lastInternalBackupAt` bigint;--> statement-breakpoint
ALTER TABLE `drive_backup_config` ADD `lastInternalBackupKey` varchar(512) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `drive_backup_config` ADD `lastInternalBackupFileName` varchar(200) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `drive_backup_config` ADD `lastInternalBackupError` text;