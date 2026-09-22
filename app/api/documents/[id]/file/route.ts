import { env } from "cloudflare:workers";

function parseRange(header: string | null) {
  const match = header?.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : undefined;
  return Number.isFinite(start) && (end === undefined || Number.isFinite(end)) ? { start, end } : null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!env.DB || !env.BUCKET) throw new Error("原始文件暂不可用，请稍后重试。");
    const { id } = await context.params;
    const document = await env.DB
      .prepare("SELECT title, mime_type, object_key FROM reading_documents WHERE id = ?")
      .bind(id)
      .first<{ title: string; mime_type: string; object_key: string }>();
    if (!document) return Response.json({ error: "找不到这份资料。" }, { status: 404 });
    const requestedRange = parseRange(request.headers.get("Range"));
    const file = await env.BUCKET.get(document.object_key, requestedRange ? { range: requestedRange.end === undefined ? { offset: requestedRange.start } : { offset: requestedRange.start, length: requestedRange.end - requestedRange.start + 1 } } : undefined);
    if (!file) return Response.json({ error: "原始文件不存在。" }, { status: 404 });
    const total = file.size;
    const partial = requestedRange !== null && file.range !== undefined;
    const offset = partial && file.range && "offset" in file.range ? file.range.offset ?? 0 : 0;
    const length = partial && file.range && "length" in file.range ? file.range.length ?? total - offset : total;
    return new Response(file.body, {
      status: partial ? 206 : 200,
      headers: {
        "Content-Type": document.mime_type,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.title)}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(length),
        ...(partial ? { "Content-Range": `bytes ${offset}-${offset + length - 1}/${total}` } : {}),
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法读取原始文件。" }, { status: 500 });
  }
}
