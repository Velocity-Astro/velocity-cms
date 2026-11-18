CREATE TABLE `plugin_data` (
	`plugin` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`plugin`, `key`)
);
