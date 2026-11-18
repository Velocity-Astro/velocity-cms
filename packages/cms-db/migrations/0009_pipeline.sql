CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `contacts` ADD `stage` text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE `contacts` ADD `owner_id` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `follow_up_at` text;--> statement-breakpoint
CREATE INDEX `contacts_stage` ON `contacts` (`stage`,`created_at`);--> statement-breakpoint
CREATE INDEX `contacts_follow_up` ON `contacts` (`follow_up_at`);