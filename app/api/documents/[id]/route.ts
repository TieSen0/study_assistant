import { env } from "cloudflare:workers";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!env.DB) {
      throw new Error("资料库暂不可用，请稍后重试。");
    }
    const { id } = await context.params;
    const document = await env.DB
      .prepare("SELECT id, title, mime_type, page_count, created_at FROM reading_documents WHERE id = ?")
      .bind(id)
      .first();
    if (!document) {
      return Response.json({ error: "找不到这份资料。" }, { status: 404 });
    }
    const pages = await env.DB
      .prepare("SELECT page_number, content FROM reading_pages WHERE document_id = ? ORDER BY page_number ASC")
      .bind(id)
      .all();
    return Response.json({ document, pages: pages.results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法打开资料。" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!env.DB) throw new Error("资料库暂不可用，请稍后重试。");
    const { id } = await context.params;
    const body = await request.json() as { title?: unknown };
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 180) : "";
    if (!title) return Response.json({ error: "标题不能为空。" }, { status: 400 });
    const result = await env.DB.prepare("UPDATE reading_documents SET title = ? WHERE id = ?").bind(title, id).run();
    if (!result.meta.changes) return Response.json({ error: "找不到这份资料。" }, { status: 404 });
    return Response.json({ document: { id, title } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法更新资料。" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!env.DB || !env.BUCKET) throw new Error("资料库暂不可用，请稍后重试。");
    const { id } = await context.params;
    const document = await env.DB.prepare("SELECT object_key FROM reading_documents WHERE id = ?").bind(id).first<{ object_key: string }>();
    if (!document) return Response.json({ error: "找不到这份资料。" }, { status: 404 });
    await env.DB.prepare("DELETE FROM reading_documents WHERE id = ?").bind(id).run();
    await env.BUCKET.delete(document.object_key);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法删除资料。" }, { status: 500 });
  }
}
