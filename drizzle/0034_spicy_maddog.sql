CREATE TABLE `alpha_catalog_products` (
	`ownerId` int NOT NULL,
	`id` varchar(256) NOT NULL,
	`recordPayload` mediumtext NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `alpha_catalog_owner_id_pk` PRIMARY KEY(`ownerId`,`id`)
);
--> statement-breakpoint
CREATE TABLE `alpha_pdf_exports` (
	`ownerId` int NOT NULL,
	`exportId` varchar(36) NOT NULL,
	`reportId` varchar(256) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`sku` varchar(256) NOT NULL,
	`projectId` int,
	`documentId` int,
	`sha256` varchar(64) NOT NULL,
	`byteSize` int NOT NULL,
	`contextHash` varchar(64) NOT NULL,
	`optionsPayload` text NOT NULL,
	`snapshotPayload` mediumtext,
	`status` enum('pending','failed','ready') NOT NULL,
	`leaseToken` varchar(36),
	`leaseExpiresAt` bigint,
	`key` text,
	`url` text,
	`uploadedAt` bigint,
	`lastError` varchar(100),
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `alpha_pdf_owner_export_pk` PRIMARY KEY(`ownerId`,`exportId`)
);
--> statement-breakpoint
CREATE INDEX `alpha_catalog_owner_updated_idx` ON `alpha_catalog_products` (`ownerId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `alpha_pdf_owner_created_idx` ON `alpha_pdf_exports` (`ownerId`,`createdAt`);