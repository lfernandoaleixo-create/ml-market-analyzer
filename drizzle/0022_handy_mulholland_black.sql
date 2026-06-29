CREATE TABLE `embalagem_sheet_custom_columns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL DEFAULT '',
	`position` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `embalagem_sheet_custom_columns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `embalagem_sheet_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`produto` varchar(400) NOT NULL DEFAULT '',
	`eanGtin` varchar(60) NOT NULL DEFAULT '',
	`sku` varchar(120) NOT NULL DEFAULT '',
	`embalagem` varchar(200) NOT NULL DEFAULT '',
	`ncm` varchar(20) NOT NULL DEFAULT '',
	`gpc` varchar(30) NOT NULL DEFAULT '',
	`cest` varchar(20) NOT NULL DEFAULT '',
	`precoClassico` varchar(40) NOT NULL DEFAULT '',
	`precoPremium` varchar(40) NOT NULL DEFAULT '',
	`altura` varchar(40) NOT NULL DEFAULT '',
	`largura` varchar(40) NOT NULL DEFAULT '',
	`comprimento` varchar(40) NOT NULL DEFAULT '',
	`kg` varchar(40) NOT NULL DEFAULT '',
	`categoria` varchar(120) NOT NULL DEFAULT '',
	`observacao` text,
	`rowColor` varchar(20) NOT NULL DEFAULT '',
	`customValues` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `embalagem_sheet_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kit_sheet_custom_columns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL DEFAULT '',
	`position` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kit_sheet_custom_columns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kit_sheet_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`cadastradoMl` varchar(60) NOT NULL DEFAULT '',
	`kit` varchar(400) NOT NULL DEFAULT '',
	`eanGtin` varchar(60) NOT NULL DEFAULT '',
	`sku` varchar(120) NOT NULL DEFAULT '',
	`embalagem` varchar(200) NOT NULL DEFAULT '',
	`ncm` varchar(20) NOT NULL DEFAULT '',
	`precoClassico` varchar(40) NOT NULL DEFAULT '',
	`precoPremium` varchar(40) NOT NULL DEFAULT '',
	`profundidade` varchar(40) NOT NULL DEFAULT '',
	`largura` varchar(40) NOT NULL DEFAULT '',
	`alturaComprimento` varchar(40) NOT NULL DEFAULT '',
	`kg` varchar(40) NOT NULL DEFAULT '',
	`categoria` varchar(120) NOT NULL DEFAULT '',
	`dimensoesGs1` varchar(12) NOT NULL DEFAULT '',
	`baseAjustado` varchar(12) NOT NULL DEFAULT '',
	`mlAjustado` varchar(12) NOT NULL DEFAULT '',
	`formadoPor` varchar(300) NOT NULL DEFAULT '',
	`observacao` text,
	`rowColor` varchar(20) NOT NULL DEFAULT '',
	`customValues` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kit_sheet_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `embalagem_sheet_custom_col_position_idx` ON `embalagem_sheet_custom_columns` (`position`);--> statement-breakpoint
CREATE INDEX `embalagem_sheet_position_idx` ON `embalagem_sheet_rows` (`position`);--> statement-breakpoint
CREATE INDEX `kit_sheet_custom_col_position_idx` ON `kit_sheet_custom_columns` (`position`);--> statement-breakpoint
CREATE INDEX `kit_sheet_position_idx` ON `kit_sheet_rows` (`position`);