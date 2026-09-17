import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const readingDocuments = sqliteTable(
  "reading_documents",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    mimeType: text("mime_type").notNull(),
    objectKey: text("object_key").notNull(),
    pageCount: integer("page_count").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_reading_documents_created_at").on(table.createdAt)],
);

export const readingPages = sqliteTable(
  "reading_pages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    documentId: text("document_id")
      .notNull()
      .references(() => readingDocuments.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    content: text("content").notNull(),
  },
  (table) => [
    uniqueIndex("idx_reading_pages_document_page").on(table.documentId, table.pageNumber),
  ],
);

export const readingAnnotations = sqliteTable(
  "reading_annotations",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => readingDocuments.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    kind: text("kind").notNull(),
    anchor: text("anchor").notNull(),
    note: text("note").notNull().default(""),
    status: text("status").notNull().default("open"),
    createdAt: text("created_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("idx_reading_annotations_document_page").on(table.documentId, table.pageNumber),
    index("idx_reading_annotations_document_kind_status").on(table.documentId, table.kind, table.status),
  ],
);
