CREATE TABLE `ads_campaign_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`captureDay` varchar(10) NOT NULL,
	`campaignId` bigint NOT NULL,
	`name` varchar(256) NOT NULL,
	`status` varchar(32) NOT NULL,
	`strategy` varchar(64),
	`acosTarget` double,
	`roasTarget` double,
	`budget` double,
	`automaticBudget` boolean NOT NULL DEFAULT false,
	`mlLastUpdated` varchar(40),
	`metrics` json,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ads_campaign_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ads_change_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`campaignId` bigint NOT NULL,
	`campaignName` varchar(256) NOT NULL,
	`detectedDay` varchar(10) NOT NULL,
	`field` varchar(40) NOT NULL,
	`oldValue` varchar(128),
	`newValue` varchar(128),
	`verdict` enum('coherent','questionable','neutral') NOT NULL DEFAULT 'neutral',
	`assessment` text,
	`recommendation` text,
	`detectedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ads_change_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ads_item_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`captureDay` varchar(10) NOT NULL,
	`itemId` varchar(32) NOT NULL,
	`campaignId` bigint,
	`title` varchar(512) NOT NULL,
	`categoryKey` varchar(32) NOT NULL,
	`status` varchar(32),
	`price` double,
	`metrics` json,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ads_item_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ads_camp_snap_day_idx` ON `ads_campaign_snapshots` (`userId`,`captureDay`);--> statement-breakpoint
CREATE INDEX `ads_camp_snap_camp_idx` ON `ads_campaign_snapshots` (`campaignId`);--> statement-breakpoint
CREATE INDEX `ads_change_user_idx` ON `ads_change_log` (`userId`);--> statement-breakpoint
CREATE INDEX `ads_change_day_idx` ON `ads_change_log` (`userId`,`detectedDay`);--> statement-breakpoint
CREATE INDEX `ads_change_camp_idx` ON `ads_change_log` (`campaignId`);--> statement-breakpoint
CREATE INDEX `ads_item_snap_day_idx` ON `ads_item_snapshots` (`userId`,`captureDay`);--> statement-breakpoint
CREATE INDEX `ads_item_snap_cat_idx` ON `ads_item_snapshots` (`userId`,`categoryKey`);--> statement-breakpoint
CREATE INDEX `ads_item_snap_item_idx` ON `ads_item_snapshots` (`itemId`);