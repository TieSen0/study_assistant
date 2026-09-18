import type { PdfAnchor, PdfMark } from "../../components/original-pdf-reader";

export type ReaderView = "single" | "double" | "continuous";
export type ReaderNavigation = "pages" | "outline" | "bookmarks" | "annotations";
export type ReaderMarkKind = "note" | "question" | "doubt" | "bookmark";
export type ReaderMark = PdfMark & { page_number: number; note?: string };
export type ReaderPageText = { pageNumber: number; content: string };
export type OutlineItem = { title: string; dest: unknown; depth: number };
export type SearchResult = { pageNumber: number; source: "原文" | "书签" | "批注"; excerpt: string };
export type ReaderSelection = { pageNumber: number; anchor: PdfAnchor };

export type ReaderProps = {
  documentId: string;
  title: string;
  pageCount: number;
  initialPage: number;
  pages: ReaderPageText[];
  marks: ReaderMark[];
  onExit: () => void;
  onPageChange: (pageNumber: number) => void;
  onCreateMark: (kind: ReaderMarkKind, pageNumber: number, anchor: PdfAnchor) => void;
  onEditMark: (id: string) => void;
  onDeleteMark: (id: string) => void;
  onSetDoubtStatus: (id: string) => void;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function findExcerpt(content: string, query: string, matchCase: boolean, wholeWord: boolean) {
  if (!query.trim() || !content) return null;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = wholeWord ? new RegExp(`(?:^|\\W)(${escaped})(?=\\W|$)`, matchCase ? "" : "i") : new RegExp(escaped, matchCase ? "" : "i");
  const match = expression.exec(content);
  if (!match || match.index < 0) return null;
  const start = Math.max(0, match.index - 52);
  const end = Math.min(content.length, match.index + match[0].length + 92);
  return `${start ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}

export function flattenOutline(items: any[], depth = 0): OutlineItem[] {
  return items.flatMap((item) => [{ title: item.title || "未命名章节", dest: item.dest, depth }, ...flattenOutline(item.items || [], depth + 1)]);
}
