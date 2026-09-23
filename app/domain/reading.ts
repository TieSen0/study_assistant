/**
 * The stable language shared by the library, reader and agent.
 *
 * A document's original file is authoritative. Parsed pages are a machine
 * aid only; agent output must point back to a ReadingAnchor before it can be
 * presented as evidence from the document.
 */
export type ReadingPurpose = "overview" | "study" | "reproduce" | "critique" | "cite";
export type ExtractionMode = "normal" | "enhanced";
export type ExtractionState = "pending" | "ready" | "failed";

export type ReadingPage = { pageNumber: number; content: string };

export type ReadingDocument = {
  id: string;
  title: string;
  mime_type: string;
  page_count: number;
  last_page?: number;
  created_at: string;
  pages?: ReadingPage[];
};

export type ReadingAnchor = {
  documentId: string;
  page: number;
  quote?: string;
  /** Reserved for a future rectangle/text-range anchor without changing callers. */
  selector?: { kind: "text" | "region"; value: string };
};

export type ReadingSession = {
  documentId: string;
  purpose: ReadingPurpose;
  extractionMode: ExtractionMode;
  extractionState: ExtractionState;
};

export type EvidenceContext = {
  document: Pick<ReadingDocument, "id" | "title" | "page_count">;
  anchor: ReadingAnchor | null;
  source: "original_pdf" | "text_layer" | "user_note";
};

export const readingPurposeLabel: Record<ReadingPurpose, string> = {
  overview: "快速判断",
  study: "系统理解",
  reproduce: "复现实现",
  critique: "批判评估",
  cite: "写作引用",
};
