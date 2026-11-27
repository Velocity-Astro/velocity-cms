CREATE TABLE `entry_like` (
	`type_id` text NOT NULL,
	`entry` text NOT NULL,
	`visitor` text NOT NULL,
	`at` text NOT NULL,
	PRIMARY KEY(`type_id`, `entry`, `visitor`)
);
--> statement-breakpoint
CREATE INDEX `entry_like_at` ON `entry_like` (`at`);