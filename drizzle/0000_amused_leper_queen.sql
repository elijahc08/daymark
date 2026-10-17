CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `occurrence_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`original_date` text NOT NULL,
	`title` text,
	`skipped` integer DEFAULT false NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`moved_date` text,
	`start_time` text,
	`end_time` text,
	`duration_minutes` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_task_date` ON `occurrence_exceptions` (`task_id`,`original_date`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`time_zone` text DEFAULT 'Europe/London' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`scheduled_date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`goal_id` text,
	`recurrence` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null
);
