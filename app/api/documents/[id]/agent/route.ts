import { agentDatabase } from "@/lib/agent-storage";
import { contextKind, validateQuestion, validateResponse, type AgentMessage } from "@/app/features/agent/model";

type RouteContext = { params: Promise<{ id: string }> };
const columns = "id, document_id, role, content, context_page, context_kind, source_quote, parent_message_id, created_at";
const noCache = { "Cache-Control": "no-store" };

class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function documentRecord(id: string) {
  const record = await agentDatabase().prepare("SELECT id, page_count FROM reading_documents WHERE id = ?")
    .bind(id).first<{ id: string; page_count: number }>();
  if (!record) throw new RequestError("找不到这份资料。", 404);
  return record;
}

async function readBody(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { throw new RequestError("请求内容不是有效 JSON。", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestError("请求内容无效。", 400);
  return body as Record<string, unknown>;
}

function messageId(body: Record<string, unknown>) {
  if (typeof body.id !== "string" || !/^[\w-]{1,100}$/.test(body.id)) throw new RequestError("问题编号无效。", 400);
  return body.id;
}

function failure(error: unknown) {
  if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status, headers: noCache });
  console.error("Agent storage request failed", error);
  return Response.json({ error: "问题资料库暂不可用，请稍后重试。输入内容仍会保留。" }, { status: 500, headers: noCache });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await documentRecord(id);
    const messages = await agentDatabase().prepare(`SELECT ${columns} FROM reading_agent_messages WHERE document_id = ? ORDER BY created_at ASC, id ASC`).bind(id).all();
    return Response.json({ messages: messages.results }, { headers: noCache });
  } catch (error) { return failure(error); }
}

async function write(request: Request, context: RouteContext, editing: boolean) {
  try {
    const { id: documentId } = await context.params;
    const document = await documentRecord(documentId);
    const body = await readBody(request);
    if (!editing && body.role === "assistant") return await writeResponse(body, documentId);
    let input;
    try { input = validateQuestion(body, document.page_count); }
    catch (error) { throw new RequestError((error as Error).message, 400); }
    const db = agentDatabase();
    // Client-generated ids make uncertain saves safe to retry. Accept old clients too.
    const id = !editing && body.id === undefined ? crypto.randomUUID() : messageId(body);
    if (editing) {
      const result = await db.prepare("UPDATE reading_agent_messages SET content = ?, context_page = ?, context_kind = ?, source_quote = ? WHERE id = ? AND document_id = ? AND role = 'user'")
        .bind(input.content, input.contextPage, contextKind(input), input.sourceQuote, id, documentId).run();
      if (!result.meta.changes) throw new RequestError("找不到可编辑的问题。", 404);
    } else {
      await db.prepare("INSERT INTO reading_agent_messages (id, document_id, role, content, context_page, context_kind, source_quote, parent_message_id, created_at) VALUES (?, ?, 'user', ?, ?, ?, ?, NULL, ?) ON CONFLICT(id) DO NOTHING")
        .bind(id, documentId, input.content, input.contextPage, contextKind(input), input.sourceQuote, new Date().toISOString()).run();
    }
    const message = await db.prepare(`SELECT ${columns} FROM reading_agent_messages WHERE id = ? AND document_id = ?`).bind(id, documentId).first<AgentMessage>();
    if (!message || message.content !== input.content || message.context_page !== input.contextPage || message.source_quote !== input.sourceQuote) {
      throw new RequestError("这个问题编号已用于另一条内容。请重新打开编辑后保存。", 409);
    }
    return Response.json({ message }, { status: editing ? 200 : 201, headers: noCache });
  } catch (error) { return failure(error); }
}

async function writeResponse(body: Record<string, unknown>, documentId: string) {
  let input;
  try { input = validateResponse(body); }
  catch (error) { throw new RequestError((error as Error).message, 400); }
  const db = agentDatabase();
  const source = await db.prepare(`SELECT ${columns} FROM reading_agent_messages WHERE id = ? AND document_id = ? AND role = 'user'`)
    .bind(input.parentMessageId, documentId).first<AgentMessage>();
  if (!source) throw new RequestError("找不到这条问题，无法保存回答。", 404);
  const id = body.id === undefined ? crypto.randomUUID() : messageId(body);
  await db.prepare("INSERT INTO reading_agent_messages (id, document_id, role, content, context_page, context_kind, source_quote, parent_message_id, created_at) VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
    .bind(id, documentId, input.content, source.context_page, source.context_kind, source.source_quote, source.id, new Date().toISOString()).run();
  const message = await db.prepare(`SELECT ${columns} FROM reading_agent_messages WHERE id = ? AND document_id = ?`).bind(id, documentId).first<AgentMessage>();
  if (!message || message.role !== "assistant" || message.content !== input.content || message.parent_message_id !== source.id) {
    throw new RequestError("这个回答编号已用于另一条内容。请重新粘贴后保存。", 409);
  }
  return Response.json({ message }, { status: 201, headers: noCache });
}

export function POST(request: Request, context: RouteContext) { return write(request, context, false); }
export function PATCH(request: Request, context: RouteContext) { return write(request, context, true); }

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await documentRecord(id);
    const body = await readBody(request);
    const questionId = messageId(body);
    await agentDatabase().batch([
      agentDatabase().prepare("DELETE FROM reading_agent_messages WHERE document_id = ? AND parent_message_id = ?").bind(id, questionId),
      agentDatabase().prepare("DELETE FROM reading_agent_messages WHERE id = ? AND document_id = ? AND role = 'user'").bind(questionId, id),
    ]);
    return Response.json({ ok: true }, { headers: noCache });
  } catch (error) { return failure(error); }
}
