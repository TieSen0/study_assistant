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
type NavigationTab = "pages" | "outline" | "bookmarks" | "annotations";
type MarkKind = "note" | "question" | "doubt" | "bookmark";

type ReaderMark = PdfMark & { page_number: number; note?: string };
type ReaderPageText = { pageNumber: number; content: string };
type OutlineItem = { title: string; dest: any; depth: number };
type SearchResult = { pageNumber: number; source: "原文" | "书签" | "批注"; excerpt: string };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function findExcerpt(content: string, query: string, matchCase: boolean, wholeWord: boolean) {
  if (!query.trim() || !content) return null;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = wholeWord ? new RegExp(`(?:^|\\W)(${escaped})(?=\\W|$)`, matchCase ? "" : "i") : new RegExp(escaped, matchCase ? "" : "i");
  const match = expression.exec(content);
  if (!match || match.index < 0) return null;
  const start = Math.max(0, match.index - 52);
  const end = Math.min(content.length, match.index + match[0].length + 92);
  return `${start ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}

function flattenOutline(items: any[], depth = 0): OutlineItem[] {
  return items.flatMap((item) => [{ title: item.title || "未命名章节", dest: item.dest, depth }, ...flattenOutline(item.items || [], depth + 1)]);
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
  trackPosition,
  onSelection,
  onPageVisible,
}: {
  pdf: any;
  pageNumber: number;
  zoom: number;
  marks: ReaderMark[];
  selectable: boolean;
  trackPosition: boolean;
  onSelection: (pageNumber: number, anchor: PdfAnchor) => void;
  onPageVisible: (pageNumber: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLElement>(null);
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

  useEffect(() => {
    const target = pageRef.current;
    if (!target || !trackPosition || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && entry.intersectionRatio >= 0.55) onPageVisible(pageNumber);
    }, { root: target.closest(".office-document-stage"), threshold: [0.55] });
    observer.observe(target);
    return () => observer.disconnect();
  }, [onPageVisible, pageNumber, trackPosition]);

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
    <figure ref={pageRef} className="office-page" style={{ width: size.width, minHeight: size.height }} data-page={pageNumber}>
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

function PageThumbnail({ pdf, pageNumber, active, onOpen }: { pdf: any; pageNumber: number; active: boolean; onOpen: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [shouldRender, setShouldRender] = useState(active || pageNumber <= 4);

  useEffect(() => {
    const target = buttonRef.current;
    if (!target || shouldRender || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldRender(true);
        observer.disconnect();
      }
    }, { root: target.closest(".office-navigation"), rootMargin: "120px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [shouldRender]);

  useEffect(() => {
    let cancelled = false;
    if (!shouldRender) return;
    async function render() {
      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 0.18 });
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
        await page.render({ canvasContext: context, viewport }).promise;
        if (!cancelled) setReady(true);
      } catch {
        // A broken thumbnail must not prevent the user from opening that page.
      }
    }
    render();
    return () => { cancelled = true; };
  }, [pageNumber, pdf, shouldRender]);

  return <button ref={buttonRef} type="button" className={active ? "active" : ""} onClick={onOpen}><span className="office-thumb-canvas"><canvas ref={canvasRef} />{!ready && <i>{pageNumber}</i>}</span><small>第 {pageNumber} 页</small></button>;
}

export function OfficePdfReader({
  documentId,
  title,
  pageCount,
  initialPage,
  pages,
  marks,
  onExit,
  onPageChange,
  onCreateMark,
  onEditMark,
  onDeleteMark,
  onSetDoubtStatus,
}: {
  documentId: string;
  title: string;
  pageCount: number;
  initialPage: number;
  pages: ReaderPageText[];
  marks: ReaderMark[];
  onExit: () => void;
  onPageChange: (pageNumber: number) => void;
  onCreateMark: (kind: MarkKind, pageNumber: number, anchor: PdfAnchor) => void;
  onEditMark: (id: string) => void;
  onDeleteMark: (id: string) => void;
  onSetDoubtStatus: (id: string) => void;
}) {
  const [pdf, setPdf] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [totalPages, setTotalPages] = useState(Math.max(pageCount, 1));
  const [currentPage, setCurrentPage] = useState(clamp(initialPage, 1, Math.max(pageCount, 1)));
  const [zoom, setZoom] = useState(1.15);
  const [view, setView] = useState<ViewMode>("continuous");
  const [navigation, setNavigation] = useState<NavigationTab>("pages");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [marking, setMarking] = useState(false);
  const [selection, setSelection] = useState<{ pageNumber: number; anchor: PdfAnchor } | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [findScope, setFindScope] = useState<"document" | "all">("document");
  const [outline, setOutline] = useState<OutlineItem[]>([]);
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
        if (!cancelled) {
          setPdf(loaded);
          setTotalPages(loaded.numPages || Math.max(pageCount, 1));
          const rawOutline = await loaded.getOutline();
          if (!cancelled) setOutline(flattenOutline(rawOutline || []));
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "无法加载原始 PDF。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [documentId, pageCount]);

  useEffect(() => {
    setCurrentPage(clamp(initialPage, 1, Math.max(totalPages, 1)));
  }, [initialPage, totalPages]);

  useEffect(() => {
    onPageChange(currentPage);
  }, [currentPage, onPageChange]);

  const visiblePages = useMemo(() => {
    if (view === "continuous") return Array.from({ length: totalPages }, (_, index) => index + 1);
    if (view === "double") return [currentPage, currentPage + 1].filter((item) => item <= totalPages);
    return [currentPage];
  }, [currentPage, totalPages, view]);

  const searchResults = useMemo(() => {
    const query = findText.trim();
    if (!query) return [] as SearchResult[];
    const documentResults = pages.flatMap((item) => {
      const excerpt = findExcerpt(item.content, query, matchCase, wholeWord);
      return excerpt ? [{ pageNumber: item.pageNumber, source: "原文" as const, excerpt }] : [];
    });
    if (findScope === "document") return documentResults;
    const markResults = marks.flatMap((mark) => {
      const excerpt = findExcerpt(mark.note || "", query, matchCase, wholeWord);
      if (!excerpt) return [];
      return [{ pageNumber: mark.page_number, source: mark.kind === "bookmark" ? "书签" as const : "批注" as const, excerpt }];
    });
    return [...documentResults, ...markResults];
  }, [findScope, findText, matchCase, marks, pages, wholeWord]);

  function changePage(next: number) {
    const page = clamp(next, 1, totalPages);
    setCurrentPage(page);
    setSelection(null);
    if (view === "continuous") window.setTimeout(() => viewportRef.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function setFit(kind: "width" | "page") {
    const width = viewportRef.current?.clientWidth ?? 920;
    setZoom(kind === "width" ? clamp((width - 88) / 595, 0.65, 2.1) : clamp((window.innerHeight - 220) / 842, 0.55, 1.55));
  }

  async function openOutlineItem(item: OutlineItem) {
    if (!pdf || !item.dest) return;
    try {
      const destination = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
      const reference = destination?.[0];
      if (!reference) return;
      changePage((await pdf.getPageIndex(reference)) + 1);
    } catch {
      // Some PDFs expose malformed named destinations. Keep the outline visible instead of failing the reader.
    }
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

      {findOpen && <section className="office-find-bar"><Search size={16} /><input value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="查找原文、书签或批注" autoFocus /><label><input type="checkbox" checked={wholeWord} onChange={(event) => setWholeWord(event.target.checked)} /> 整词</label><label><input type="checkbox" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} /> 区分大小写</label><label>范围<select value={findScope} onChange={(event) => setFindScope(event.target.value as "document" | "all")}><option value="document">仅原文</option><option value="all">原文、书签、批注</option></select></label><span className="office-result-count">{findText.trim() ? `${searchResults.length} 处结果` : "输入关键词"}</span><button type="button" onClick={() => setFindOpen(false)} aria-label="关闭查找"><X size={15} /></button>{findText.trim() && <div className="office-search-results">{searchResults.length ? searchResults.map((result, index) => <button key={`${result.source}-${result.pageNumber}-${index}`} type="button" onClick={() => changePage(result.pageNumber)}><b>{result.source} · 第 {result.pageNumber} 页</b><span>{result.excerpt}</span></button>) : <p>没有找到匹配项。扫描页或尚未提取文字的页面不会出现在结果中。</p>}</div>}</section>}

      <div className="office-reader-body">
        {sidebarOpen && <aside className="office-navigation">
          <div className="office-nav-tabs"><button type="button" className={navigation === "pages" ? "active" : ""} onClick={() => setNavigation("pages")}><FileText size={15} /> 页面</button><button type="button" className={navigation === "outline" ? "active" : ""} onClick={() => setNavigation("outline")}><ListTree size={15} /> 目录</button><button type="button" className={navigation === "bookmarks" ? "active" : ""} onClick={() => setNavigation("bookmarks")}><Bookmark size={15} /> 书签</button><button type="button" className={navigation === "annotations" ? "active" : ""} onClick={() => setNavigation("annotations")}><StickyNote size={15} /> 批注</button></div>
          {navigation === "pages" && <div className="office-thumbnails">{pdf ? Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => <PageThumbnail key={number} pdf={pdf} pageNumber={number} active={number === currentPage} onOpen={() => changePage(number)} />) : <div className="office-side-empty"><LoaderCircle size={20} className="inline-loader" /><p>正在生成页面缩略图</p></div>}</div>}
          {navigation === "outline" && (outline.length ? <div className="office-outline">{outline.map((item, index) => <button type="button" key={`${item.title}-${index}`} style={{ paddingLeft: `${12 + item.depth * 15}px` }} onClick={() => openOutlineItem(item)}>{item.title}</button>)}</div> : <div className="office-side-empty"><ListTree size={21} /><p>这份 PDF 尚未提供可读取目录。</p><small>保留原始目录；不会由系统虚构章节。</small></div>)}
          {navigation === "bookmarks" && <div className="office-bookmarks">{marks.filter((mark) => mark.kind === "bookmark").length ? marks.filter((mark) => mark.kind === "bookmark").map((mark) => <button type="button" key={mark.id} onClick={() => changePage(mark.page_number)}><Bookmark size={14} /> 第 {mark.page_number} 页 {mark.note || "书签"}</button>) : <div className="office-side-empty"><Bookmark size={21} /><p>暂无书签</p><small>开启批注工具后框选区域，即可添加书签。</small></div>}</div>}
          {navigation === "annotations" && <div className="office-annotation-manager">{marks.filter((mark) => mark.kind !== "bookmark").length ? marks.filter((mark) => mark.kind !== "bookmark").map((mark) => <article key={mark.id}><button type="button" className="office-annotation-main" onClick={() => changePage(mark.page_number)}><span className={`office-annotation-dot ${mark.kind}`} /><span><b>{mark.kind === "note" ? "批注" : mark.kind === "question" ? "询问" : "存疑"} · 第 {mark.page_number} 页</b><em>{mark.note || "未添加文字说明"}</em></span></button><div><button type="button" onClick={() => onEditMark(mark.id)}>编辑</button>{mark.kind === "doubt" && <button type="button" onClick={() => onSetDoubtStatus(mark.id)}>{mark.status === "resolved" ? "恢复" : "解决"}</button>}<button type="button" onClick={() => onDeleteMark(mark.id)}>删除</button></div></article>) : <div className="office-side-empty"><StickyNote size={21} /><p>暂无批注</p><small>在“批注工具”中框选原文区域，即可建立可回访的标记。</small></div>}</div>}
        </aside>}

        <section className={`office-document-stage ${view}`} ref={viewportRef}>
          {loading && <div className="office-document-state"><LoaderCircle size={22} className="inline-loader" /> 正在打开原始 PDF…</div>}
          {error && <div className="office-document-state error">无法打开论文：{error}</div>}
          {pdf && <div className="office-pages">{visiblePages.map((number) => <PageCanvas key={`${number}-${zoom}`} pdf={pdf} pageNumber={number} zoom={zoom} marks={marks.filter((mark) => mark.page_number === number)} selectable={marking} trackPosition={view === "continuous"} onSelection={(pageNumber, anchor) => setSelection({ pageNumber, anchor })} onPageVisible={(pageNumber) => setCurrentPage(pageNumber)} />)}</div>}
          {selection && <div className="office-selection-actions"><span>已选择第 {selection.pageNumber} 页区域</span><button type="button" onClick={() => { onCreateMark("note", selection.pageNumber, selection.anchor); setSelection(null); }}>批注</button><button type="button" onClick={() => { onCreateMark("question", selection.pageNumber, selection.anchor); setSelection(null); }}>询问</button><button type="button" onClick={() => { onCreateMark("doubt", selection.pageNumber, selection.anchor); setSelection(null); }}>存疑</button><button type="button" onClick={() => { onCreateMark("bookmark", selection.pageNumber, selection.anchor); setSelection(null); }}>书签</button><button type="button" onClick={() => setSelection(null)} aria-label="取消选择"><X size={14} /></button></div>}
        </section>
      </div>

      <footer className="office-statusbar"><div><button type="button" disabled={currentPage <= 1} onClick={() => changePage(currentPage - 1)}><ChevronLeft size={16} /> 上一页</button><label>页码 <input type="number" min={1} max={totalPages} value={currentPage} onChange={(event) => changePage(Number(event.target.value))} /></label><span>/ {totalPages}</span><button type="button" disabled={currentPage >= totalPages} onClick={() => changePage(currentPage + 1)}>下一页 <ChevronRight size={16} /></button></div><span>{view === "continuous" ? "连续阅读 · 随滚动自动更新页码" : view === "double" ? "双页" : "单页"} · {marking ? "批注工具已开启" : "阅读模式"}</span></footer>
    </main>
  );
}
