import { env } from "cloudflare:workers";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!env.DB || !env.BUCKET) throw new Error("原始文件暂不可用，请稍后重试。");
    const { id } = await context.params;
    const document = await env.DB
      .prepare("SELECT title, mime_type, object_key FROM reading_documents WHERE id = ?")
      .bind(id)
      .first<{ title: string; mime_type: string; object_key: string }>();
    if (!document) return Response.json({ error: "找不到这份资料。" }, { status: 404 });
    const file = await env.BUCKET.get(document.object_key);
    if (!file) return Response.json({ error: "原始文件不存在。" }, { status: 404 });
    return new Response(file.body, {
      headers: {
        "Content-Type": document.mime_type,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.title)}`,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法读取原始文件。" }, { status: 500 });
  }
}
