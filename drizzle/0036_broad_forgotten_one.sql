CREATE TABLE `sales_margin_costs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`sellerId` varchar(30) NOT NULL,
	`operationId` varchar(100) NOT NULL,
	`productCost` decimal(18,2),
	`extraCosts` decimal(18,2),
	`note` varchar(1000) NOT NULL DEFAULT '',
	`updatedBy` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_margin_costs_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_margin_cost_operation_unique` UNIQUE(`ownerUserId`,`sellerId`,`operationId`)
);
--> statement-breakpoint
CREATE TABLE `sales_margin_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`sellerId` varchar(30) NOT NULL,
	`fileName` varchar(160) NOT NULL,
	`fileHash` varchar(64) NOT NULL,
	`format` varchar(30) NOT NULL,
	`rowCount` int NOT NULL,
	`operations` json NOT NULL,
	`fromDate` varchar(10) NOT NULL,
	`toDate` varchar(10) NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_margin_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_margin_report_file_unique` UNIQUE(`ownerUserId`,`sellerId`,`fileHash`)
);
--> statement-breakpoint
CREATE INDEX `sales_margin_cost_owner_idx` ON `sales_margin_costs` (`ownerUserId`,`sellerId`);--> statement-breakpoint
CREATE INDEX `sales_margin_report_owner_idx` ON `sales_margin_reports` (`ownerUserId`,`sellerId`);