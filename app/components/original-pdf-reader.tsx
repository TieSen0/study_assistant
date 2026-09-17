"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { LoaderCircle } from "lucide-react";

export type PdfAnchor = { x: number; y: number; width: number; height: number };
export type PdfMark = { id: string; kind: string; anchor: PdfAnchor; status: string };

const markClass: Record<string, string> = {
  note: "note",
  question: "question",
  doubt: "doubt",
  bookmark: "bookmark",
};

function point(event: PointerEvent<HTMLDivElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

export function OriginalPdfReader({
  documentId,
  pageNumber,
  zoom,
  marks,
  onSelection,
}: {
  documentId: string;
  pageNumber: number;
  zoom: number;
  marks: PdfMark[];
  onSelection: (anchor: PdfAnchor) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<PdfAnchor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void } | undefined;
    async function render() {
      setLoading(true);
      setError("");
      setDraft(null);
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
        const pdf = await pdfjs.getDocument({ url: `/api/documents/${documentId}/file` }).promise;
        const pdfPage = await pdf.getPage(pageNumber);
        const viewport = pdfPage.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("无法创建页面画布。");
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        renderTask = pdfPage.render({ canvasContext: context, viewport });
        await renderTask.promise;
        if (!cancelled) setLoading(false);
      } catch (reason) {
        if (!cancelled) {
          setLoading(false);
          setError(reason instanceof Error ? reason.message : "无法渲染此 PDF 页面。");
        }
      }
    }
    render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [documentId, pageNumber, zoom]);

  function finish(event: PointerEvent<HTMLDivElement>) {
    const origin = start.current;
    start.current = null;
    if (!origin) return;
    const end = point(event);
    const anchor = {
      x: Math.min(origin.x, end.x),
      y: Math.min(origin.y, end.y),
      width: Math.abs(end.x - origin.x),
      height: Math.abs(end.y - origin.y),
    };
    setDraft(null);
    if (anchor.width > 0.012 && anchor.height > 0.008) onSelection(anchor);
  }

  return (
    <section className="pdf-reader" aria-label="原始 PDF 阅读器">
      <div className="pdf-canvas-wrap">
        <canvas ref={canvasRef} />
        <div
          className="pdf-selection-layer"
          onPointerDown={(event) => {
            start.current = point(event);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!start.current) return;
            const end = point(event);
            setDraft({ x: Math.min(start.current.x, end.x), y: Math.min(start.current.y, end.y), width: Math.abs(end.x - start.current.x), height: Math.abs(end.y - start.current.y) });
          }}
          onPointerUp={finish}
        >
          {marks.map((mark) => <span key={mark.id} className={`pdf-mark ${markClass[mark.kind] ?? "note"} ${mark.status === "resolved" ? "resolved" : ""}`} style={{ left: `${mark.anchor.x * 100}%`, top: `${mark.anchor.y * 100}%`, width: `${mark.anchor.width * 100}%`, height: `${mark.anchor.height * 100}%` }} />)}
          {draft && <span className="pdf-mark draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.width * 100}%`, height: `${draft.height * 100}%` }} />}
        </div>
        {loading && <div className="pdf-loading"><LoaderCircle className="inline-loader" size={22} /> 正在渲染原始页面…</div>}
        {error && <div className="pdf-error">页面渲染失败：{error}</div>}
      </div>
      <p>拖拽框选文字、公式、图片或表格；原始 PDF 不会被重排或改写。</p>
    </section>
  );
}
