ALTER TABLE `sku_change_log` ADD `idempotencyKey` varchar(100);--> statement-breakpoint
ALTER TABLE `sku_sheet_rows` ADD `revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `sku_change_log` ADD CONSTRAINT `sku_change_log_idempotency_unique_idx` UNIQUE(`idempotencyKey`);--> statement-breakpoint
UPDATE `sku_change_log`
SET `idempotencyKey` = 'sku-immutable-v1-guilherme'
WHERE `id` = (
	SELECT `policyLog`.`id`
	FROM (
		SELECT MAX(`id`) AS `id`
		FROM `sku_change_log`
		WHERE `action` = 'policy_authorization' AND `authorizedBy` = 'Guilherme'
	) AS `policyLog`
);
