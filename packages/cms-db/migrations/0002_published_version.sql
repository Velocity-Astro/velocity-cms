ALTER TABLE `entries` ADD `published_slug` text;--> statement-breakpoint
ALTER TABLE `entries` ADD `published_data` text;--> statement-breakpoint
ALTER TABLE `entries` ADD `published_revision` integer;--> statement-breakpoint
ALTER TABLE `entries` ADD `published_at` text;--> statement-breakpoint
-- Entries published before this migration were live as they stood.
UPDATE `entries` SET `published_slug` = `slug`, `published_data` = `data`, `published_revision` = `revision`, `published_at` = `updated_at` WHERE `status` = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX `entries_type_locale_published_slug` ON `entries` (`type_id`,`locale`,`published_slug`);