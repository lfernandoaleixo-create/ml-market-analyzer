CREATE TABLE `luis_suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`position` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `luis_suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `luis_product_step_progress` ADD `supplierId` int;--> statement-breakpoint
CREATE INDEX `luis_suppliers_product_idx` ON `luis_suppliers` (`productId`);--> statement-breakpoint
CREATE INDEX `luis_suppliers_position_idx` ON `luis_suppliers` (`position`);--> statement-breakpoint
CREATE INDEX `luis_progress_supplier_idx` ON `luis_product_step_progress` (`supplierId`);