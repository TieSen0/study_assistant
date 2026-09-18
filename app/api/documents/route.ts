import { env } from "cloudflare:workers";

type PagePayload = { pageNumber: number; content: string };

function storage() {
  if (!env.DB || !env.BUCKET) {
    throw new Error("资料存储暂不可用，请稍后重试。");
  }
  return { db: env.DB, bucket: env.BUCKET };
}

function safeTitle(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, "_").slice(0, 180) || "未命名资料";
}

export async function GET() {
  try {
    const { db } = storage();
    const result = await db
      .prepare("SELECT id, title, mime_type, page_count, last_page, created_at FROM reading_documents ORDER BY created_at DESC LIMIT 30")
      .all();
    return Response.json({ documents: result.results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法读取资料库。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let objectKey = "";
  try {
    const form = await request.formData();
    const file = form.get("file");
    const pagesRaw = form.get("pages");
    if (!(file instanceof File) || !pagesRaw || typeof pagesRaw !== "string") {
      return Response.json({ error: "请提供资料文件和已解析的页面文本。" }, { status: 400 });
    }
    if (!file.size || file.size > 20 * 1024 * 1024) {
      return Response.json({ error: "当前支持 20 MB 以内的资料。" }, { status: 400 });
    }
    const pages = JSON.parse(pagesRaw) as PagePayload[];
    if (!Array.isArray(pages) || !pages.length || pages.length > 800) {
      return Response.json({ error: "未解析到有效页面内容。" }, { status: 400 });
    }
    const normalized = pages
      .map((page, index) => ({
        pageNumber: Number.isInteger(page.pageNumber) ? page.pageNumber : index + 1,
        content: String(page.content ?? "").replace(/\s+/g, " ").trim().slice(0, 60_000),
      }));
    if (!normalized.length) {
      return Response.json({ error: "资料中没有可读取的页面。" }, { status: 400 });
    }

    const { db, bucket } = storage();
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const title = safeTitle(file.name.replace(/\.[^.]+$/, ""));
    const mimeType = file.type || "application/octet-stream";
    objectKey = `documents/${id}/${safeTitle(file.name)}`;
    await bucket.put(objectKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: mimeType },
    });
    const statements = [
      db
        .prepare("INSERT INTO reading_documents (id, title, mime_type, object_key, page_count, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, title, mimeType, objectKey, normalized.length, createdAt),
      ...normalized.map((page) =>
        db
          .prepare("INSERT INTO reading_pages (document_id, page_number, content) VALUES (?, ?, ?)")
          .bind(id, page.pageNumber, page.content),
      ),
    ];
    await db.batch(statements);
    return Response.json({ document: { id, title, mime_type: mimeType, page_count: normalized.length, created_at: createdAt } }, { status: 201 });
  } catch (error) {
    try {
      if (objectKey) await storage().bucket.delete(objectKey);
    } catch {
      // Keep the original storage error visible; an orphaned upload is harmless and inaccessible.
    }
    return Response.json({ error: error instanceof Error ? error.message : "上传资料失败。" }, { status: 500 });
  }
}
