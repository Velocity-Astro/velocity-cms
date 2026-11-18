ALTER TABLE `deals` ADD `about_type` text;--> statement-breakpoint
ALTER TABLE `deals` ADD `about_entry` text;--> statement-breakpoint
CREATE INDEX `deals_about` ON `deals` (`about_entry`);