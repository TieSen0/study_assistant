import type { ReadingDocument } from "../../domain/reading";

export type AgentDocument = Pick<ReadingDocument, "id" | "title" | "page_count" | "pages">;
export type AgentMessage = {
  id: string;
  document_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  context_page: number | null;
  context_kind: "document" | "selection" | "page";
  source_quote: string;
  parent_message_id: string | null;
  created_at: string;
};
export type QuestionInput = { content: string; contextPage: number | null; sourceQuote: string };
export type ResponseInput = { content: string; parentMessageId: string };
export const MAX_QUESTION = 8000;
export const MAX_QUOTE = 4000;
export const MAX_RESPONSE = 16000;
export const MAX_CONTEXT_TEXT = 7000;

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

export function validateResponse(value: unknown): ResponseInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("回答内容无效。");
  const body = value as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content || content.length > MAX_RESPONSE) throw new Error(`回答应为 1–${MAX_RESPONSE} 个字符。`);
  if (typeof body.parentMessageId !== "string" || !/^[\w-]{1,100}$/.test(body.parentMessageId)) {
    throw new Error("回答关联的问题无效。");
  }
  return { content, parentMessageId: body.parentMessageId };
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

// The package is deliberately inspectable: original PDF remains the source of truth.
export function manualPrompt(document: AgentDocument, message: AgentMessage) {
  const context = questionContext(document, message);
  const pageText = context.pageText?.text ?? "";
  const clippedPageText = pageText.length > MAX_CONTEXT_TEXT
    ? `${pageText.slice(0, MAX_CONTEXT_TEXT)}\n\n[本页提取文字过长，已截取前 ${MAX_CONTEXT_TEXT} 字；请以原 PDF 为准。]`
    : pageText;
  return [
    "你是 Lens 的论文与书籍阅读助手。请用中文回答。",
    "原始 PDF 是唯一的视觉与排版事实来源；下方文字来自 PDF 文本层，可能遗漏公式、图表或版面信息。",
    "请严格分开：1. 直接回答 2. 论文证据 3. 背景解释／推断与不确定性。没有证据时明确说待确认，不要编造。",
    `文档：${document.title}`,
    `定位：${message.context_page === null ? "整篇文档" : `第 ${message.context_page} 页`}`,
    `用户选区：${message.source_quote || "（未指定）"}`,
    `可用页面文字：${message.context_page === null ? "（未指定页码）" : clippedPageText || "（本页没有可用文本层；请提示用户核对原 PDF）"}`,
    `用户问题：${message.content}`,
  ].join("\n\n");
}
