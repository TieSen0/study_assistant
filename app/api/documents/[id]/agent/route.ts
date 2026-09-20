import { env } from "cloudflare:workers";

type AgentMessageInput = {
  content?: unknown;
  contextPage?: unknown;
  contextKind?: unknown;
};

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!env.DB) throw new Error("Agent 资料库暂不可用，请稍后重试。");
    const { id: documentId } = await context.params;
    const messages = await env.DB
      .prepare("SELECT id, document_id, role, content, context_page, context_kind, created_at FROM reading_agent_messages WHERE document_id = ? ORDER BY created_at ASC")
      .bind(documentId)
      .all();
    return Response.json({ messages: messages.results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法读取 Agent 线程。" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!env.DB) throw new Error("Agent 资料库暂不可用，请稍后重试。");
    const { id: documentId } = await context.params;
    const body = await request.json() as AgentMessageInput;
    const content = typeof body.content === "string" ? body.content.trim().slice(0, 8_000) : "";
    const contextPage = body.contextPage === undefined || body.contextPage === null ? null : Number(body.contextPage);
    const contextKind = body.contextKind === "selection" ? "selection" : "document";
    if (!content) return Response.json({ error: "请输入要保存的问题。" }, { status: 400 });
    if (contextPage !== null && (!Number.isInteger(contextPage) || contextPage < 1)) {
      return Response.json({ error: "页面上下文无效。" }, { status: 400 });
    }
    const exists = await env.DB.prepare("SELECT id FROM reading_documents WHERE id = ?").bind(documentId).first();
    if (!exists) return Response.json({ error: "找不到这份资料。" }, { status: 404 });
    const message = {
      id: crypto.randomUUID(),
      document_id: documentId,
      role: "user",
      content,
      context_page: contextPage,
      context_kind: contextKind,
      created_at: new Date().toISOString(),
    };
    await env.DB
      .prepare("INSERT INTO reading_agent_messages (id, document_id, role, content, context_page, context_kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(message.id, message.document_id, message.role, message.content, message.context_page, message.context_kind, message.created_at)
      .run();
    return Response.json({ message }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法保存 Agent 问题。" }, { status: 500 });
  }
}
