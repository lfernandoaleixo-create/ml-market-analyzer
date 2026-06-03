CREATE TABLE `alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`monitoredProductId` int NOT NULL,
	`type` enum('price_drop','price_rise','sales_surge','position_gain','position_loss') NOT NULL,
	`severity` enum('info','warning','critical') NOT NULL DEFAULT 'info',
	`title` varchar(256) NOT NULL,
	`message` text NOT NULL,
	`changePercent` double,
	`previousValue` double,
	`currentValue` double,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `app_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monitoringCronTaskUid` varchar(65),
	`alertThresholds` json,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `app_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ml_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`appId` varchar(128) NOT NULL DEFAULT '',
	`clientSecret` varchar(256) NOT NULL DEFAULT '',
	`accessToken` text,
	`refreshToken` text,
	`tokenExpiresAt` bigint,
	`status` enum('unconfigured','connected','error') NOT NULL DEFAULT 'unconfigured',
	`statusMessage` text,
	`siteId` varchar(8) NOT NULL DEFAULT 'MLB',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ml_credentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `monitored_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`mlItemId` varchar(32) NOT NULL,
	`title` varchar(512) NOT NULL,
	`thumbnail` text,
	`permalink` text,
	`categoryId` varchar(32),
	`categoryName` varchar(256),
	`sellerName` varchar(256),
	`trackKeyword` varchar(256),
	`lastPrice` double,
	`lastSoldQuantity` int,
	`lastPosition` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monitored_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monitoredProductId` int NOT NULL,
	`price` double,
	`soldQuantity` int,
	`availableQuantity` int,
	`position` int,
	`reviewsCount` int,
	`rating` double,
	`capturedAt` bigint NOT NULL,
	CONSTRAINT `product_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `alert_user_idx` ON `alerts` (`userId`);--> statement-breakpoint
CREATE INDEX `alert_product_idx` ON `alerts` (`monitoredProductId`);--> statement-breakpoint
CREATE INDEX `monitored_user_idx` ON `monitored_products` (`userId`);--> statement-breakpoint
CREATE INDEX `monitored_item_idx` ON `monitored_products` (`mlItemId`);--> statement-breakpoint
CREATE INDEX `snapshot_product_idx` ON `product_snapshots` (`monitoredProductId`);--> statement-breakpoint
CREATE INDEX `snapshot_captured_idx` ON `product_snapshots` (`capturedAt`);