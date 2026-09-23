import type { ReadingAnchor } from "../../domain/reading";

export type WorkbenchActivity = "explorer" | "search" | "notes" | "extensions";
export type WorkbenchPanelTab = "PROBLEMS" | "OUTPUT" | "TERMINAL";
export type SourceTarget = { documentId: string; page: number; revision: number };

export function anchorFromSelection(documentId: string, page: number, quote: string): ReadingAnchor {
  return { documentId, page, quote, selector: { kind: "text", value: quote } };
}
