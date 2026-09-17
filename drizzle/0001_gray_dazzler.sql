CREATE TABLE `reading_annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`page_number` integer NOT NULL,
	`kind` text NOT NULL,
	`anchor` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`document_id`) REFERENCES `reading_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_reading_annotations_document_page` ON `reading_annotations` (`document_id`,`page_number`);--> statement-breakpoint
CREATE INDEX `idx_reading_annotations_document_kind_status` ON `reading_annotations` (`document_id`,`kind`,`status`);