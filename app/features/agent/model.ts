export type AgentDocument = { id: string; title: string; page_count: number; pages?: { pageNumber: number; content: string }[] };
export type AgentMessage = {
  id: string;
  document_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  context_page: number | null;
  context_kind: "document" | "selection" | "page";
  source_quote: string;
  created_at: string;
};
export type QuestionInput = { content: string; contextPage: number | null; sourceQuote: string };
export const MAX_QUESTION = 8000;
export const MAX_QUOTE = 4000;

export function validateQuestion(value: unknown, pageCount: number): QuestionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("问题内容无效。");
  const body = value as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content || content.length > MAX_QUESTION) throw new Error(`问题应为 1–${MAX_QUESTION} 个字符。`);
  const page = body.contextPage ?? null;
  if (page !== null && (typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > pageCount)) {
    throw new Error(`引用页码应在 1–${pageCount} 之间。`);
  }
  if (body.sourceQuote !== undefined && typeof body.sourceQuote !== "string") throw new Error("摘录必须是文字。");
  const quote = typeof body.sourceQuote === "string" ? body.sourceQuote.trim() : "";
  if (quote.length > MAX_QUOTE) throw new Error(`摘录不能超过 ${MAX_QUOTE} 个字符。`);
  if (quote && page === null) throw new Error("请为摘录填写引用页码。");
  return { content, contextPage: page, sourceQuote: quote };
}

export function contextKind(input: QuestionInput) {
  return input.sourceQuote ? "selection" : input.contextPage === null ? "document" : "page";
}

// Inspectable source material; this does not claim a model has read the paper.
export function questionContext(document: AgentDocument, message: AgentMessage) {
  const text = document.pages?.find((page) => page.pageNumber === message.context_page)?.content ?? "";
  return {
    question: message.content,
    source: { documentId: document.id, title: document.title, page: message.context_page },
    excerpt: message.source_quote ? { text: message.source_quote, origin: "user_supplied" } : null,
    pageText: message.context_page === null ? null : { text, origin: "extracted_text_layer", available: !!text },
    modelCalled: false,
  };
}
