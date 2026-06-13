CREATE TABLE `profit_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`snapshotDate` varchar(10) NOT NULL,
	`periodDays` int NOT NULL DEFAULT 30,
	`ttsEnabled` boolean NOT NULL DEFAULT false,
	`orderCount` int NOT NULL DEFAULT 0,
	`revenue` double NOT NULL DEFAULT 0,
	`netProfitSemTts` double NOT NULL DEFAULT 0,
	`netProfitComTts` double NOT NULL DEFAULT 0,
	`marginSemTts` double NOT NULL DEFAULT 0,
	`marginComTts` double NOT NULL DEFAULT 0,
	`commission` double NOT NULL DEFAULT 0,
	`shipping` double NOT NULL DEFAULT 0,
	`cmv` double NOT NULL DEFAULT 0,
	`taxes` double NOT NULL DEFAULT 0,
	`ads` double NOT NULL DEFAULT 0,
	`capturedAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `profit_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `profit_snapshots_user_date_idx` ON `profit_snapshots` (`userId`,`snapshotDate`);