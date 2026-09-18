"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  FileText,
  ListTree,
  LoaderCircle,
  MessageCircleQuestion,
  Minus,
  PanelLeft,
  Plus,
  Search,
  StickyNote,
  X,
} from "lucide-react";
import type { PdfAnchor, PdfMark } from "./original-pdf-reader";

type ViewMode = "single" | "double" | "continuous";
type NavigationTab = "pages" | "outline" | "bookmarks";
type MarkKind = "note" | "question" | "doubt" | "bookmark";

type ReaderMark = PdfMark & { page_number: number; note?: string };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function anchorFromPointer(event: PointerEvent<HTMLDivElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
    y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
  };
}

function PageCanvas({
  pdf,
  pageNumber,
  zoom,
  marks,
  selectable,
  onSelection,
}: {
  pdf: any;
  pageNumber: number;
  zoom: number;
  marks: ReaderMark[];
  selectable: boolean;
  onSelection: (pageNumber: number, anchor: PdfAnchor) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<PdfAnchor | null>(null);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState({ width: 680, height: 880 });

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | undefined;
    async function render() {
      setLoading(true);
      try {
        const pdfPage = await pdf.getPage(pageNumber);
        const viewport = pdfPage.getViewport({ scale: zoom });
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
        task = pdfPage.render({ canvasContext: context, viewport });
        await task.promise;
      } catch (error) {
        if (!(error instanceof Error && error.name === "RenderingCancelledException")) console.error(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    render();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, zoom]);

  function finish(event: PointerEvent<HTMLDivElement>) {
    const origin = start.current;
    start.current = null;
    if (!origin) return;
    const end = anchorFromPointer(event);
    const anchor = {
      x: Math.min(origin.x, end.x),
      y: Math.min(origin.y, end.y),
      width: Math.abs(end.x - origin.x),
      height: Math.abs(end.y - origin.y),
    };
    setDraft(null);
    if (anchor.width > 0.012 && anchor.height > 0.008) onSelection(pageNumber, anchor);
  }

  return (
    <figure className="office-page" style={{ width: size.width, minHeight: size.height }} data-page={pageNumber}>
      <canvas ref={canvasRef} />
      {selectable && <div
        className="office-selection-layer"
        onPointerDown={(event) => {
          start.current = anchorFromPointer(event);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!start.current) return;
          const end = anchorFromPointer(event);
          setDraft({ x: Math.min(start.current.x, end.x), y: Math.min(start.current.y, end.y), width: Math.abs(end.x - start.current.x), height: Math.abs(end.y - start.current.y) });
        }}
        onPointerUp={finish}
      >
        {marks.map((mark) => <span key={mark.id} className={`office-mark ${mark.kind} ${mark.status === "resolved" ? "resolved" : ""}`} style={{ left: `${mark.anchor.x * 100}%`, top: `${mark.anchor.y * 100}%`, width: `${mark.anchor.width * 100}%`, height: `${mark.anchor.height * 100}%` }} />)}
        {draft && <span className="office-mark draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.width * 100}%`, height: `${draft.height * 100}%` }} />}
      </div>}
      {loading && <span className="office-page-loading"><LoaderCircle size={18} className="inline-loader" /> 正在载入第 {pageNumber} 页</span>}
      <figcaption>{pageNumber}</figcaption>
    </figure>
  );
}

export function OfficePdfReader({
  documentId,
  title,
  pageCount,
  initialPage,
  marks,
  onExit,
  onPageChange,
  onCreateMark,
}: {
  documentId: string;
  title: string;
  pageCount: number;
  initialPage: number;
  marks: ReaderMark[];
  onExit: () => void;
  onPageChange: (pageNumber: number) => void;
  onCreateMark: (kind: MarkKind, pageNumber: number, anchor: PdfAnchor) => void;
}) {
  const [pdf, setPdf] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(clamp(initialPage, 1, Math.max(pageCount, 1)));
  const [zoom, setZoom] = useState(1.15);
  const [view, setView] = useState<ViewMode>("single");
  const [navigation, setNavigation] = useState<NavigationTab>("pages");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [marking, setMarking] = useState(false);
  const [selection, setSelection] = useState<{ pageNumber: number; anchor: PdfAnchor } | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
        const loaded = await pdfjs.getDocument({ url: `/api/documents/${documentId}/file` }).promise;
        if (!cancelled) setPdf(loaded);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "无法加载原始 PDF。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [documentId]);

  useEffect(() => {
    setCurrentPage(clamp(initialPage, 1, Math.max(pageCount, 1)));
  }, [initialPage, pageCount]);

  useEffect(() => {
    onPageChange(currentPage);
  }, [currentPage, onPageChange]);

  const visiblePages = useMemo(() => {
    if (view === "continuous") return Array.from({ length: pageCount }, (_, index) => index + 1);
    if (view === "double") return [currentPage, currentPage + 1].filter((item) => item <= pageCount);
    return [currentPage];
  }, [currentPage, pageCount, view]);

  function changePage(next: number) {
    const page = clamp(next, 1, pageCount);
    setCurrentPage(page);
    setSelection(null);
    if (view === "continuous") window.setTimeout(() => viewportRef.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function setFit(kind: "width" | "page") {
    const width = viewportRef.current?.clientWidth ?? 920;
    setZoom(kind === "width" ? clamp((width - 88) / 595, 0.65, 2.1) : clamp((window.innerHeight - 220) / 842, 0.55, 1.55));
  }

  return (
    <main className="office-reader-shell">
      <header className="office-titlebar">
        <div className="office-file-name"><FileText size={17} /><strong>{title}</strong><span>· PDF</span></div>
        <button type="button" className="office-exit" onClick={onExit}><X size={16} /> 退出阅读模式</button>
      </header>

      <nav className="office-ribbon" aria-label="阅读工具">
        <div className="office-tabs"><button type="button" className="active">阅读</button><button type="button" onClick={() => setMarking((value) => !value)} className={marking ? "active" : ""}>批注</button><button type="button" onClick={() => setFindOpen((value) => !value)} className={findOpen ? "active" : ""}>查找</button><button type="button" onClick={() => alert("翻译服务尚未配置。后续会在这里显示划词和选区翻译。")}>翻译</button></div>
        <div className="office-ribbon-tools">
          <button type="button" onClick={() => setSidebarOpen((value) => !value)} title="显示导航"><PanelLeft size={17} /></button>
          <span className="office-divider" />
          <button type="button" onClick={() => setZoom((value) => clamp(value - 0.1, 0.5, 2.4))}><Minus size={16} /></button>
          <output>{Math.round(zoom * 100)}%</output>
          <button type="button" onClick={() => setZoom((value) => clamp(value + 0.1, 0.5, 2.4))}><Plus size={16} /></button>
          <button type="button" onClick={() => setFit("width")}>适合宽度</button><button type="button" onClick={() => setFit("page")}>适合整页</button>
          <span className="office-divider" />
          <label>视图<select value={view} onChange={(event) => setView(event.target.value as ViewMode)}><option value="single">单页</option><option value="double">双页</option><option value="continuous">连续阅读</option></select></label>
          <button type="button" onClick={() => setMarking((value) => !value)} className={marking ? "marking" : ""}><StickyNote size={16} /> {marking ? "正在批注" : "批注工具"}</button>
        </div>
      </nav>

      {findOpen && <section className="office-find-bar"><Search size={16} /><input value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="在原文、书签或批注中查找" autoFocus /><label><input type="checkbox" checked={wholeWord} onChange={(event) => setWholeWord(event.target.checked)} /> 整词</label><label><input type="checkbox" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} /> 区分大小写</label><button type="button" onClick={() => alert("全文索引将在后台提取完成后启用；当前不会显示不可靠的搜索结果。")}>查找</button><button type="button" onClick={() => setFindOpen(false)} aria-label="关闭查找"><X size={15} /></button></section>}

      <div className="office-reader-body">
        {sidebarOpen && <aside className="office-navigation">
          <div className="office-nav-tabs"><button type="button" className={navigation === "pages" ? "active" : ""} onClick={() => setNavigation("pages")}><FileText size={15} /> 页面</button><button type="button" className={navigation === "outline" ? "active" : ""} onClick={() => setNavigation("outline")}><ListTree size={15} /> 目录</button><button type="button" className={navigation === "bookmarks" ? "active" : ""} onClick={() => setNavigation("bookmarks")}><Bookmark size={15} /> 书签</button></div>
          {navigation === "pages" && <div className="office-thumbnails">{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button key={number} type="button" className={number === currentPage ? "active" : ""} onClick={() => changePage(number)}><span>{number}</span><small>第 {number} 页</small></button>)}</div>}
          {navigation === "outline" && <div className="office-side-empty"><ListTree size={21} /><p>这份 PDF 尚未提供可读取目录。</p><small>保留原始目录；不会由系统虚构章节。</small></div>}
          {navigation === "bookmarks" && <div className="office-bookmarks">{marks.filter((mark) => mark.kind === "bookmark").length ? marks.filter((mark) => mark.kind === "bookmark").map((mark) => <button type="button" key={mark.id} onClick={() => changePage(mark.page_number)}><Bookmark size={14} /> 第 {mark.page_number} 页 {mark.note || "书签"}</button>) : <div className="office-side-empty"><Bookmark size={21} /><p>暂无书签</p><small>开启批注工具后框选区域，即可添加书签。</small></div>}</div>}
        </aside>}

        <section className={`office-document-stage ${view}`} ref={viewportRef}>
          {loading && <div className="office-document-state"><LoaderCircle size={22} className="inline-loader" /> 正在打开原始 PDF…</div>}
          {error && <div className="office-document-state error">无法打开论文：{error}</div>}
          {pdf && <div className="office-pages">{visiblePages.map((number) => <PageCanvas key={`${number}-${zoom}`} pdf={pdf} pageNumber={number} zoom={zoom} marks={marks.filter((mark) => mark.page_number === number)} selectable={marking} onSelection={(pageNumber, anchor) => setSelection({ pageNumber, anchor })} />)}</div>}
          {selection && <div className="office-selection-actions"><span>已选择第 {selection.pageNumber} 页区域</span><button type="button" onClick={() => { onCreateMark("note", selection.pageNumber, selection.anchor); setSelection(null); }}>批注</button><button type="button" onClick={() => { onCreateMark("question", selection.pageNumber, selection.anchor); setSelection(null); }}>询问</button><button type="button" onClick={() => { onCreateMark("doubt", selection.pageNumber, selection.anchor); setSelection(null); }}>存疑</button><button type="button" onClick={() => { onCreateMark("bookmark", selection.pageNumber, selection.anchor); setSelection(null); }}>书签</button><button type="button" onClick={() => setSelection(null)} aria-label="取消选择"><X size={14} /></button></div>}
        </section>
      </div>

      <footer className="office-statusbar"><div><button type="button" disabled={currentPage <= 1} onClick={() => changePage(currentPage - 1)}><ChevronLeft size={16} /> 上一页</button><label>页码 <input type="number" min={1} max={pageCount} value={currentPage} onChange={(event) => changePage(Number(event.target.value))} /></label><span>/ {pageCount}</span><button type="button" disabled={currentPage >= pageCount} onClick={() => changePage(currentPage + 1)}>下一页 <ChevronRight size={16} /></button></div><span>{view === "continuous" ? "连续阅读" : view === "double" ? "双页" : "单页"} · {marking ? "批注工具已开启" : "阅读模式"}</span></footer>
    </main>
  );
}
