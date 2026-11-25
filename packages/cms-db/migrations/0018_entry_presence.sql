CREATE TABLE `entry_presence` (
	`entry_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`until` text NOT NULL,
	PRIMARY KEY(`entry_id`, `actor_id`)
);
--> statement-breakpoint
CREATE INDEX `entry_presence_until` ON `entry_presence` (`until`);