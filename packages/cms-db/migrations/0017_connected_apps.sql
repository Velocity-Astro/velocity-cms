CREATE TABLE `auth_app` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`redirect_uris` text NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`can_publish` integer DEFAULT false NOT NULL,
	`personal_data` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `auth_app`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_connection_app_id` ON `auth_connection` (`app_id`);--> statement-breakpoint
CREATE INDEX `auth_connection_user_id` ON `auth_connection` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_connection_secret` (
	`hash` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`kind` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`redirect_uri` text,
	`challenge` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `auth_connection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_connection_secret_connection_id` ON `auth_connection_secret` (`connection_id`);