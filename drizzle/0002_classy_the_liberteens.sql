CREATE TABLE `competitor_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`searchId` int NOT NULL,
	`rank` int NOT NULL DEFAULT 0,
	`name` varchar(512) NOT NULL,
	`price` double,
	`payload` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `competitor_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `competitor_searches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`query` varchar(256) NOT NULL,
	`normalizedQuery` varchar(256) NOT NULL,
	`status` enum('pending','running','done','failed') NOT NULL DEFAULT 'pending',
	`resultCount` int NOT NULL DEFAULT 0,
	`triangulated` boolean NOT NULL DEFAULT false,
	`sourcesUsed` json,
	`errorNote` text,
	`finishedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `competitor_searches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `comp_result_search_idx` ON `competitor_results` (`searchId`);--> statement-breakpoint
CREATE INDEX `comp_search_user_idx` ON `competitor_searches` (`userId`);--> statement-breakpoint
CREATE INDEX `comp_search_norm_idx` ON `competitor_searches` (`normalizedQuery`);