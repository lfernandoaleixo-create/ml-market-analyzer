CREATE TABLE `mercato_read_api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`createdBy` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`prefix` varchar(24) NOT NULL,
	`keyHash` varchar(64) NOT NULL,
	`scopes` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	CONSTRAINT `mercato_read_api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `read_api_key_hash_unique` UNIQUE(`keyHash`)
);
--> statement-breakpoint
CREATE INDEX `read_api_key_owner_idx` ON `mercato_read_api_keys` (`ownerUserId`);