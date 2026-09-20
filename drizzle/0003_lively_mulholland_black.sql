CREATE TABLE `reading_agent_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`context_page` integer,
	`context_kind` text DEFAULT 'document' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `reading_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_reading_agent_messages_document_created` ON `reading_agent_messages` (`document_id`,`created_at`);