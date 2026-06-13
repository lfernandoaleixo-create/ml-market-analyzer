CREATE TABLE `tax_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ttsEnabled` boolean NOT NULL DEFAULT false,
	`config` json NOT NULL,
	`baselinkerInventoryId` bigint,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tax_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `tax_config_user_idx` ON `tax_config` (`userId`);