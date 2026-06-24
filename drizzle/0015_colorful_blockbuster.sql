CREATE TABLE `pedro_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`userId` int,
	`guestName` varchar(100),
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pedro_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pedro_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`url` text NOT NULL,
	`fileKey` text NOT NULL,
	`type` enum('documento','foto') NOT NULL DEFAULT 'documento',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`uploadedBy` int,
	CONSTRAINT `pedro_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pedro_product_step_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`supplierId` int,
	`stageId` int NOT NULL,
	`done` boolean NOT NULL DEFAULT false,
	`note` text,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pedro_product_step_progress_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pedro_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`priority` enum('alta','media','baixa') NOT NULL DEFAULT 'media',
	`currentStep` enum('fornecedor','amostra','aprovacao','embalagem','pedido','producao','inspecao','embarque','chegada','lancamento') NOT NULL DEFAULT 'fornecedor',
	`supplier` varchar(255),
	`supplierContact` varchar(255),
	`notes` text,
	`imageUrl` text,
	`expectedArrival` timestamp,
	`orderDeadline` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `pedro_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pedro_timeline_stages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(255) NOT NULL,
	`position` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pedro_timeline_stages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pedro_timeline_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`step` enum('fornecedor','amostra','aprovacao','embalagem','pedido','producao','inspecao','embarque','chegada','lancamento') NOT NULL,
	`status` enum('pendente','em_andamento','concluido') NOT NULL DEFAULT 'pendente',
	`notes` text,
	`completedAt` timestamp,
	`targetDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pedro_timeline_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pedro_todos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`completed` boolean NOT NULL DEFAULT false,
	`assignedTo` int,
	`dueDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `pedro_todos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `pedro_comments_product_idx` ON `pedro_comments` (`productId`);--> statement-breakpoint
CREATE INDEX `pedro_documents_product_idx` ON `pedro_documents` (`productId`);--> statement-breakpoint
CREATE INDEX `pedro_progress_product_idx` ON `pedro_product_step_progress` (`productId`);--> statement-breakpoint
CREATE INDEX `pedro_progress_supplier_idx` ON `pedro_product_step_progress` (`supplierId`);--> statement-breakpoint
CREATE INDEX `pedro_progress_stage_idx` ON `pedro_product_step_progress` (`stageId`);--> statement-breakpoint
CREATE INDEX `pedro_timeline_stages_position_idx` ON `pedro_timeline_stages` (`position`);--> statement-breakpoint
CREATE INDEX `pedro_timeline_product_idx` ON `pedro_timeline_steps` (`productId`);--> statement-breakpoint
CREATE INDEX `pedro_todos_product_idx` ON `pedro_todos` (`productId`);