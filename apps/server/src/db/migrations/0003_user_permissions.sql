CREATE TABLE `user_permission` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`service` text NOT NULL,
	`instance_id` integer,
	`level` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instance_id`) REFERENCES `service_instance`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_permission_user_idx` ON `user_permission` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_permission_scope_uq` ON `user_permission` (`user_id`,`service`,`instance_id`);