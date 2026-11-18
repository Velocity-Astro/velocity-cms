DROP INDEX `entries_type_locale_slug`;--> statement-breakpoint
ALTER TABLE `entries` ADD `deleted_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `entries_type_locale_slug` ON `entries` (`type_id`,`locale`,`slug`) WHERE "entries"."deleted_at" is null;