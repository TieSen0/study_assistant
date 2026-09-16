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
