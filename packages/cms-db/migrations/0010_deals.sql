CREATE TABLE `deals` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`title` text NOT NULL,
	`value` integer NOT NULL,
	`stage` text NOT NULL,
	`owner_id` text,
	`close_on` text,
	`closed_at` text,
	`revision` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deals_contact` ON `deals` (`contact_id`);--> statement-breakpoint
CREATE INDEX `deals_stage` ON `deals` (`stage`,`created_at`);