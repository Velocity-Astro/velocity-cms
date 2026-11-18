CREATE TABLE `form_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`email` text,
	`locale` text,
	`page` text,
	`created_at` text NOT NULL,
	`handled_at` text,
	`handled_by` text
);
--> statement-breakpoint
CREATE INDEX `form_submissions_form_created` ON `form_submissions` (`form_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `form_submissions_email` ON `form_submissions` (`email`);--> statement-breakpoint
CREATE TABLE `forms` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`revision` integer NOT NULL,
	`definition` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forms_key` ON `forms` (`key`) WHERE "forms"."deleted_at" is null;