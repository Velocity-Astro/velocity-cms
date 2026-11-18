CREATE TABLE `media` (
	`name` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`content_type` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_key` ON `media` (`key`);