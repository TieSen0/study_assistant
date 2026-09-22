"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import "./workbench-pdf.css";

type Citation = { page: number; text: string };
type Target = { page: number; revision: number } | null;

function OriginalPage({ pdf, number, width, zoom, root, onSelect }: { pdf: PDFDocumentProxy; number: number; width: number; zoom: string; root: RefObject<HTMLDivElement | null>; onSelect: (citation: Citation | null) => void }) {
  const pageRef = useRef<HTMLElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const annotationHost = useRef<HTMLDivElement>(null);
  const textHost = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(false);
  const [size, setSize] = useState({ width: 612, height: 792 });
  const [status, setStatus] = useState("正在显示原页…");
  const scale = zoom === "width" ? Math.max(0.2, (width - 36) / size.width) : Number(zoom);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setNearby(entry.isIntersecting), { root: root.current, rootMargin: "700px 0px" });
    if (pageRef.current) observer.observe(pageRef.current);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!nearby) return;
    let cancelled = false;
    let drawing: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
    let annotationLayer: import("pdfjs-dist/legacy/web/pdf_viewer.mjs").AnnotationLayerBuilder | undefined;
    const host = canvasHost.current;
    const annotations = annotationHost.current;
    const text = textHost.current;
    setStatus("正在显示原页…");
    async function render() {
      try {
        const page = await pdf.getPage(number);
        if (cancelled || !host || !annotations || !text) return;
        const normal = page.getViewport({ scale: 1 });
        setSize((old) => old.width === normal.width && old.height === normal.height ? old : { width: normal.width, height: normal.height });
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        host.replaceChildren(canvas);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("无法创建页面画布。");
        drawing = page.render({ canvas, canvasContext: context, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
        await drawing.promise;
        if (cancelled) return;
        setStatus("");
        const [{ TextLayer: Layer }, { AnnotationLayerBuilder, SimpleLinkService }] = await Promise.all([
          import("pdfjs-dist/legacy/build/pdf.mjs"),
          import("pdfjs-dist/legacy/web/pdf_viewer.mjs"),
        ]);
        const content = await page.getTextContent();
        if (cancelled) return;
        // Page rendering only draws annotation appearance streams. The dedicated
        // layer is what keeps PDF-native markup (boxes, highlights, ink, notes)
        // visible when a reader added it without baking it into the page.
        annotations.replaceChildren();
        annotationLayer = new AnnotationLayerBuilder({
          pdfPage: page,
          linkService: new SimpleLinkService(),
          renderForms: true,
          onAppend: (layer: HTMLDivElement) => annotations.appendChild(layer),
        });
        await annotationLayer.render({ viewport });
        if (cancelled) return;
        text.replaceChildren();
        textLayer = new Layer({ textContentSource: content, container: text, viewport });
        await textLayer.render();
      } catch (error) {
        if (!cancelled) setStatus(`此页显示失败：${(error as Error).message}`);
      }
    }
    void render();
    return () => { cancelled = true; drawing?.cancel(); textLayer?.cancel(); annotationLayer?.cancel(); host?.replaceChildren(); annotations?.replaceChildren(); text?.replaceChildren(); };
  }, [pdf, number, nearby, scale]);

  function selected() {
    const selection = window.getSelection();
    const quote = selection?.toString().trim() ?? "";
    // A single-page citation must not silently claim a cross-page selection.
    if (!selection?.rangeCount || !quote || !textHost.current?.contains(selection.getRangeAt(0).commonAncestorContainer)) { onSelect(null); return; }
    onSelect({ page: number, text: quote });
  }

  return <figure ref={pageRef} className="workbench-original-page" data-page={number} aria-label={`原文第 ${number} 页`} style={{ width: size.width * scale, height: size.height * scale, "--total-scale-factor": scale } as CSSProperties}>
    {nearby && <><div ref={canvasHost} className="workbench-canvas" /><div ref={annotationHost} className="workbench-annotations" /><div ref={textHost} className="textLayer" onMouseUp={selected} onKeyUp={selected} />{status && <div className="workbench-page-status" role="status">{status}</div>}</>}
    <figcaption>第 {number} 页</figcaption>
  </figure>;
}

export function WorkbenchPdf({ documentId, initialPage, target, onQuote }: { documentId: string; initialPage: number; target: Target; onQuote: (citation: Citation) => void }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [width, setWidth] = useState(640);
  const [zoom, setZoom] = useState("width");
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [selection, setSelection] = useState<Citation | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const scrollToPage = useCallback((page: number) => {
    const container = root.current;
    const element = container?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (!container || !element) return;
    container.scrollTo({ top: container.scrollTop + element.getBoundingClientRect().top - container.getBoundingClientRect().top - 16 });
    setPageInput(String(page));
    setSelection(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined;
    setError(""); setPdf(null);
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
        task = pdfjs.getDocument({ url: `/api/documents/${documentId}/file`, useSystemFonts: true });
        const opened = await task.promise;
        if (!cancelled) setPdf(opened);
      } catch (error) { if (!cancelled) setError((error as Error).message); }
    })();
    return () => { cancelled = true; void task?.destroy(); };
  }, [documentId, retry]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { if (pdf) scrollToPage(Math.min(pdf.numPages, target?.page ?? initialPage)); }, [pdf, target?.revision, target?.page, initialPage, scrollToPage]);

  return <div className="workbench-pdf">
    <div className="workbench-pdf-toolbar">
      <form onSubmit={(event) => { event.preventDefault(); const page = Number(pageInput); if (pdf && Number.isInteger(page) && page >= 1 && page <= pdf.numPages) scrollToPage(page); }}><label>跳至<input aria-label="跳至原文页" type="number" min={1} max={pdf?.numPages ?? 1} value={pageInput} onChange={(event) => setPageInput(event.target.value)} /></label><span>/ {pdf?.numPages ?? "—"}</span><button type="submit" disabled={!pdf}>转到</button></form>
      <select aria-label="原文缩放" value={zoom} onChange={(event) => { setZoom(event.target.value); setSelection(null); }}><option value="width">适合宽度</option>{[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value * 100}%</option>)}</select>
      {selection && <button className="workbench-quote" type="button" onClick={() => { onQuote(selection); setSelection(null); }}>引用提问 · 第 {selection.page} 页</button>}
    </div>
    <div className="workbench-pdf-scroll" ref={root}>
      {error ? <div className="workbench-pdf-error" role="alert"><p>无法显示原页：{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>重新加载</button></div> : !pdf ? <p className="workbench-opening" role="status">正在打开原始 PDF…</p> : Array.from({ length: pdf.numPages }, (_, index) => <OriginalPage key={index + 1} pdf={pdf} number={index + 1} width={width} zoom={zoom} root={root} onSelect={setSelection} />)}
    </div>
  </div>;
}
