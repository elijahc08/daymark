ALTER TABLE `goals` ADD `end_date` text;--> statement-breakpoint
ALTER TABLE `goals` ADD `completed` integer DEFAULT false NOT NULL;