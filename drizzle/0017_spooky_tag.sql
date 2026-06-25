CREATE TABLE `pedro_item_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`stageId` int NOT NULL,
	`itemSource` varchar(16) NOT NULL DEFAULT 'default',
	`itemId` int NOT NULL,
	`checked` boolean NOT NULL DEFAULT false,
	`textValue` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pedro_item_answers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pedro_product_stage_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`stageId` int NOT NULL,
	`type` varchar(16) NOT NULL DEFAULT 'checkbox',
	`label` varchar(500) NOT NULL,
	`position` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pedro_product_stage_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pedro_stage_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stageId` int NOT NULL,
	`type` varchar(16) NOT NULL DEFAULT 'checkbox',
	`label` varchar(500) NOT NULL,
	`position` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pedro_stage_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `pedro_item_answers_product_stage_idx` ON `pedro_item_answers` (`productId`,`stageId`);--> statement-breakpoint
CREATE INDEX `pedro_item_answers_lookup_idx` ON `pedro_item_answers` (`productId`,`stageId`,`itemSource`,`itemId`);--> statement-breakpoint
CREATE INDEX `pedro_pstage_items_product_stage_idx` ON `pedro_product_stage_items` (`productId`,`stageId`);--> statement-breakpoint
CREATE INDEX `pedro_stage_items_stage_idx` ON `pedro_stage_items` (`stageId`);--> statement-breakpoint
CREATE INDEX `pedro_stage_items_position_idx` ON `pedro_stage_items` (`position`);