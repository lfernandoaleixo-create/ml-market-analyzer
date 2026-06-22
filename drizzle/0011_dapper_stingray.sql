CREATE TABLE `matrix_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`sku` varchar(100),
	`anchorPriceCents` int NOT NULL,
	`anchorMarginPct` double NOT NULL DEFAULT 20,
	`weightIndex` int NOT NULL DEFAULT 0,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `matrix_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `matrix_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ttsRegime` enum('com_tts','sem_tts') NOT NULL DEFAULT 'com_tts',
	`listingType` enum('classico','premium') NOT NULL DEFAULT 'classico',
	`margins` json NOT NULL,
	`anchorMarginPct` double NOT NULL DEFAULT 20,
	`tacosPercent` double NOT NULL DEFAULT 3,
	`affiliatePercent` double NOT NULL DEFAULT 0,
	`freeShipping` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `matrix_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `matrix_settings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE INDEX `matrix_products_user_idx` ON `matrix_products` (`userId`);--> statement-breakpoint
CREATE INDEX `matrix_products_user_name_idx` ON `matrix_products` (`userId`,`name`);