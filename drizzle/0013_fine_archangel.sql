CREATE TABLE `luis_product_step_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`stageId` int NOT NULL,
	`done` boolean NOT NULL DEFAULT false,
	`note` text,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `luis_product_step_progress_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `luis_timeline_stages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(255) NOT NULL,
	`position` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `luis_timeline_stages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `luis_progress_product_idx` ON `luis_product_step_progress` (`productId`);--> statement-breakpoint
CREATE INDEX `luis_progress_stage_idx` ON `luis_product_step_progress` (`stageId`);--> statement-breakpoint
CREATE INDEX `luis_timeline_stages_position_idx` ON `luis_timeline_stages` (`position`);