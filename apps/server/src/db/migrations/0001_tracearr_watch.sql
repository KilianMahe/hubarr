CREATE TABLE `tracearr_sync` (
	`tracearr_user_id` text PRIMARY KEY NOT NULL,
	`cursor_at` integer,
	`last_run_at` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `tracearr_watch` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tracearr_user_id` text NOT NULL,
	`record_id` text NOT NULL,
	`media_type` text NOT NULL,
	`tmdb_id` integer,
	`tvdb_id` integer,
	`season` integer,
	`episode` integer,
	`watched_at` integer NOT NULL,
	`percent` integer DEFAULT 0 NOT NULL,
	`watched` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracearr_watch_record_uq` ON `tracearr_watch` (`record_id`);--> statement-breakpoint
CREATE INDEX `tracearr_watch_user_idx` ON `tracearr_watch` (`tracearr_user_id`,`media_type`);--> statement-breakpoint
ALTER TABLE `user` ADD `tracearr_user_id` text;