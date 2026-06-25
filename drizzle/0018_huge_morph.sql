ALTER TABLE `pedro_product_stage_items` ADD `groupName` varchar(120);--> statement-breakpoint
ALTER TABLE `pedro_product_stage_items` ADD `groupColor` varchar(24);--> statement-breakpoint
ALTER TABLE `pedro_product_stage_items` ADD `groupPosition` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `pedro_stage_items` ADD `groupName` varchar(120);--> statement-breakpoint
ALTER TABLE `pedro_stage_items` ADD `groupColor` varchar(24);--> statement-breakpoint
ALTER TABLE `pedro_stage_items` ADD `groupPosition` int DEFAULT 0 NOT NULL;