"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { PdfAnchor } from "../../components/original-pdf-reader";
import type { ReaderMark } from "./model";
import { clamp } from "./model";

function relativePoint(event: PointerEvent<HTMLDivElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return { x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1), y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1) };
}

export function PdfPage({ pdf, pageNumber, zoom, marks, marking, followScroll, onSelect, onVisible }: {
  pdf: any;
  pageNumber: number;
  zoom: number;
  marks: ReaderMark[];
  marking: boolean;
  followScroll: boolean;
  onSelect: (pageNumber: number, anchor: PdfAnchor) => void;
  onVisible: (pageNumber: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<PdfAnchor | null>(null);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState({ width: 680, height: 880 });

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | undefined;
    async function render() {
      setLoading(true);
      try {
        const sourcePage = await pdf.getPage(pageNumber);
        const viewport = sourcePage.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        setSize({ width: viewport.width, height: viewport.height });
        const context = canvas.getContext("2d");
        if (!context) throw new Error("无法创建页面画布");
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        task = sourcePage.render({ canvasContext: context, viewport });
        await task.promise;
      } catch (error) {
        if (!(error instanceof Error && error.name === "RenderingCancelledException")) console.error(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    render();
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, pageNumber, zoom]);

  useEffect(() => {
    const target = pageRef.current;
    if (!target || !followScroll || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && entry.intersectionRatio >= 0.55) onVisible(pageNumber);
    }, { root: target.closest(".office-document-stage"), threshold: [0.55] });
    observer.observe(target);
    return () => observer.disconnect();
  }, [followScroll, onVisible, pageNumber]);

  function finish(event: PointerEvent<HTMLDivElement>) {
    const origin = dragStart.current;
    dragStart.current = null;
    if (!origin) return;
    const end = relativePoint(event);
    const anchor = { x: Math.min(origin.x, end.x), y: Math.min(origin.y, end.y), width: Math.abs(end.x - origin.x), height: Math.abs(end.y - origin.y) };
    setDraft(null);
    if (anchor.width > 0.012 && anchor.height > 0.008) onSelect(pageNumber, anchor);
  }

  return <figure ref={pageRef} className="office-page" style={{ width: size.width, minHeight: size.height }} data-page={pageNumber}>
    <canvas ref={canvasRef} />
    {marking && <div className="office-selection-layer" onPointerDown={(event) => { dragStart.current = relativePoint(event); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!dragStart.current) return; const end = relativePoint(event); setDraft({ x: Math.min(dragStart.current.x, end.x), y: Math.min(dragStart.current.y, end.y), width: Math.abs(end.x - dragStart.current.x), height: Math.abs(end.y - dragStart.current.y) }); }} onPointerUp={finish}>
      {marks.map((mark) => <span key={mark.id} className={`office-mark ${mark.kind} ${mark.status === "resolved" ? "resolved" : ""}`} style={{ left: `${mark.anchor.x * 100}%`, top: `${mark.anchor.y * 100}%`, width: `${mark.anchor.width * 100}%`, height: `${mark.anchor.height * 100}%` }} />)}
      {draft && <span className="office-mark draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.width * 100}%`, height: `${draft.height * 100}%` }} />}
    </div>}
    {loading && <span className="office-page-loading"><LoaderCircle size={18} className="inline-loader" /> 正在载入第 {pageNumber} 页</span>}
    <figcaption>{pageNumber}</figcaption>
  </figure>;
}

export function PdfThumbnail({ pdf, pageNumber, active, onOpen }: { pdf: any; pageNumber: number; active: boolean; onOpen: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [shouldRender, setShouldRender] = useState(active || pageNumber <= 4);

  useEffect(() => {
    const target = buttonRef.current;
    if (!target || shouldRender || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { setShouldRender(true); observer.disconnect(); } }, { root: target.closest(".office-navigation"), rootMargin: "120px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [shouldRender]);

  useEffect(() => {
    let cancelled = false;
    if (!shouldRender) return;
    async function render() {
      try {
        const sourcePage = await pdf.getPage(pageNumber);
        const viewport = sourcePage.getViewport({ scale: 0.18 });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        await sourcePage.render({ canvasContext: context, viewport }).promise;
        if (!cancelled) setReady(true);
      } catch { /* A thumbnail cannot block the reader. */ }
    }
    render();
    return () => { cancelled = true; };
  }, [pageNumber, pdf, shouldRender]);

  return <button ref={buttonRef} type="button" className={active ? "active" : ""} onClick={onOpen}><span className="office-thumb-canvas"><canvas ref={canvasRef} />{!ready && <i>{pageNumber}</i>}</span><small>第 {pageNumber} 页</small></button>;
}
