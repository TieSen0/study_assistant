import type { ReadingPage } from "../../domain/reading";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

export async function extractReadablePages(file: File): Promise<ReadingPage[]> {
  const lowerName = file.name.toLowerCase();
  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: ReadingPage[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const text = await page.getTextContent();
      pages.push({ pageNumber, content: text.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim() });
    }
    return pages;
  }
  if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) return [{ pageNumber: 1, content: await file.text() }];
  throw new Error("当前支持 PDF、TXT 或 Markdown 文件。");
}

export async function importDocument(file: File, pages: ReadingPage[]) {
  const form = new FormData();
  form.append("file", file);
  form.append("pages", JSON.stringify(pages));
  const response = await fetch("/api/documents", { method: "POST", body: form });
  const data = await response.json() as { error?: string; document?: unknown };
  if (!response.ok || !data.document) throw new Error(data.error ?? "导入失败。");
  return data.document;
}
