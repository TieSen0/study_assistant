CREATE TABLE `reading_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`mime_type` text NOT NULL,
	`object_key` text NOT NULL,
	`page_count` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reading_documents_created_at` ON `reading_documents` (`created_at`);--> statement-breakpoint
CREATE TABLE `reading_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` text NOT NULL,
	`page_number` integer NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `reading_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reading_pages_document_page` ON `reading_pages` (`document_id`,`page_number`);