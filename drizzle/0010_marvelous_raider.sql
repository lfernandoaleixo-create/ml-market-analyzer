CREATE TABLE `pricing_simulations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productName` varchar(200) NOT NULL,
	`sku` varchar(100),
	`notes` text,
	`sellingPriceCents` int NOT NULL,
	`usdToBrlMilli` int NOT NULL,
	`margins` json NOT NULL,
	`params` json NOT NULL,
	`results` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pricing_simulations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `pricing_simulations_user_idx` ON `pricing_simulations` (`userId`);