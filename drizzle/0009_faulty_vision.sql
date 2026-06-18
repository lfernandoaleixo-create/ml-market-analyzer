CREATE TABLE `project_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`userId` int,
	`guestName` varchar(100),
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`url` text NOT NULL,
	`fileKey` text NOT NULL,
	`type` enum('documento','foto') NOT NULL DEFAULT 'documento',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`uploadedBy` int,
	CONSTRAINT `project_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_products` (
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
	CONSTRAINT `project_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_timeline_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`step` enum('fornecedor','amostra','aprovacao','embalagem','pedido','producao','inspecao','embarque','chegada','lancamento') NOT NULL,
	`status` enum('pendente','em_andamento','concluido') NOT NULL DEFAULT 'pendente',
	`notes` text,
	`completedAt` timestamp,
	`targetDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_timeline_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_todos` (
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
	CONSTRAINT `project_todos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `project_comments_product_idx` ON `project_comments` (`productId`);--> statement-breakpoint
CREATE INDEX `project_documents_product_idx` ON `project_documents` (`productId`);--> statement-breakpoint
CREATE INDEX `project_timeline_product_idx` ON `project_timeline_steps` (`productId`);--> statement-breakpoint
CREATE INDEX `project_todos_product_idx` ON `project_todos` (`productId`);