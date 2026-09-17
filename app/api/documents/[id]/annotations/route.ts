import { env } from "cloudflare:workers";

type Anchor = { x: number; y: number; width: number; height: number };
const kinds = new Set(["note", "question", "doubt", "bookmark"]);

function validAnchor(value: unknown): value is Anchor {
  if (!value || typeof value !== "object") return false;
  const anchor = value as Anchor;
  return [anchor.x, anchor.y, anchor.width, anchor.height].every((number) => typeof number === "number" && Number.isFinite(number) && number >= 0 && number <= 1)
    && anchor.width > 0 && anchor.height > 0 && anchor.x + anchor.width <= 1.001 && anchor.y + anchor.height <= 1.001;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!env.DB) throw new Error("批注资料库暂不可用，请稍后重试。");
    const { id } = await context.params;
    const result = await env.DB
      .prepare("SELECT id, document_id, page_number, kind, anchor, note, status, created_at, resolved_at FROM reading_annotations WHERE document_id = ? ORDER BY created_at ASC")
      .bind(id)
      .all();
    return Response.json({ annotations: result.results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法读取批注。" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!env.DB) throw new Error("批注资料库暂不可用，请稍后重试。");
    const { id: documentId } = await context.params;
    const body = await request.json() as { pageNumber?: unknown; kind?: unknown; anchor?: unknown; note?: unknown };
    const pageNumber = Number(body.pageNumber);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || typeof body.kind !== "string" || !kinds.has(body.kind) || !validAnchor(body.anchor)) {
      return Response.json({ error: "批注位置或类型无效。" }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 2_000) : "";
    await env.DB
      .prepare("INSERT INTO reading_annotations (id, document_id, page_number, kind, anchor, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)")
      .bind(id, documentId, pageNumber, body.kind, JSON.stringify(body.anchor), note, createdAt)
      .run();
    return Response.json({ annotation: { id, document_id: documentId, page_number: pageNumber, kind: body.kind, anchor: JSON.stringify(body.anchor), note, status: "open", created_at: createdAt, resolved_at: null } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法保存批注。" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!env.DB) throw new Error("批注资料库暂不可用，请稍后重试。");
    const { id: documentId } = await context.params;
    const body = await request.json() as { id?: unknown; status?: unknown };
    if (typeof body.id !== "string" || !["open", "resolved"].includes(String(body.status))) {
      return Response.json({ error: "批注状态无效。" }, { status: 400 });
    }
    const resolvedAt = body.status === "resolved" ? new Date().toISOString() : null;
    await env.DB
      .prepare("UPDATE reading_annotations SET status = ?, resolved_at = ? WHERE id = ? AND document_id = ?")
      .bind(body.status, resolvedAt, body.id, documentId)
      .run();
    return Response.json({ ok: true, status: body.status, resolved_at: resolvedAt });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法更新批注。" }, { status: 500 });
  }
}
