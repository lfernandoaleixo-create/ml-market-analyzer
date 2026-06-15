CREATE TABLE `tax_config_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ttsEnabled` boolean NOT NULL DEFAULT false,
	`config` json NOT NULL,
	`baselinkerInventoryId` bigint,
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tax_config_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `tax_config_history_user_idx` ON `tax_config_history` (`userId`);