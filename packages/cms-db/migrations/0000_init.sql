CREATE TABLE `content_types` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`definition` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_types_key` ON `content_types` (`key`);--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`type_id` text NOT NULL,
	`locale` text NOT NULL,
	`translation_group` text NOT NULL,
	`slug` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer NOT NULL,
	`publish_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_type_locale_slug` ON `entries` (`type_id`,`locale`,`slug`);--> statement-breakpoint
CREATE INDEX `entries_type_status` ON `entries` (`type_id`,`status`);--> statement-breakpoint
CREATE INDEX `entries_translation_group` ON `entries` (`translation_group`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`entry_id` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`entry_id`, `revision`)
);
