CREATE TABLE `auth_token` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`hint` text NOT NULL,
	`role` text NOT NULL,
	`can_publish` integer DEFAULT false NOT NULL,
	`personal_data` integer DEFAULT false NOT NULL,
	`user_id` text,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_token_hash_unique` ON `auth_token` (`hash`);--> statement-breakpoint
CREATE INDEX `auth_token_user_id` ON `auth_token` (`user_id`);