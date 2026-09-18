"use client";

import "./reading-workspace.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { Bookmark, ChevronLeft, ChevronRight, ListTree, LoaderCircle, StickyNote, X } from "lucide-react";
import { PdfPage, PdfThumbnail } from "./pdf-page";
import { ReaderSidebar, ReaderToolbar } from "./reader-toolbar";
import { clamp, findExcerpt, flattenOutline, type OutlineItem, type ReaderNavigation, type ReaderProps, type ReaderSelection, type ReaderView, type SearchResult } from "./model";

export function OfficePdfReader(props: ReaderProps) {
  const { documentId, title, pageCount, initialPage, pages, marks, onExit, onPageChange, onCreateMark, onEditMark, onDeleteMark, onSetDoubtStatus } = props;
  const [pdf, setPdf] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [totalPages, setTotalPages] = useState(Math.max(pageCount, 1));
  const [currentPage, setCurrentPage] = useState(clamp(initialPage, 1, Math.max(pageCount, 1)));
  const [zoom, setZoom] = useState(1.15);
  const [view, setView] = useState<ReaderView>("continuous");
  const [navigation, setNavigation] = useState<ReaderNavigation>("pages");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [marking, setMarking] = useState(false);
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDocument() {
      setLoading(true); setError("");
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
        const opened = await pdfjs.getDocument({ url: `/api/documents/${documentId}/file` }).promise;
        const rawOutline = await opened.getOutline();
        if (!cancelled) { setPdf(opened); setTotalPages(opened.numPages || Math.max(pageCount, 1)); setOutline(flattenOutline(rawOutline || [])); }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "无法加载原始 PDF。");
      } finally { if (!cancelled) setLoading(false); }
    }
    loadDocument();
    return () => { cancelled = true; };
  }, [documentId, pageCount]);

  useEffect(() => setCurrentPage(clamp(initialPage, 1, totalPages)), [initialPage, totalPages]);
  useEffect(() => onPageChange(currentPage), [currentPage, onPageChange]);

  const visiblePages = useMemo(() => view === "continuous" ? Array.from({ length: totalPages }, (_, index) => index + 1) : view === "double" ? [currentPage, currentPage + 1].filter((page) => page <= totalPages) : [currentPage], [currentPage, totalPages, view]);
  const searchResults = useMemo(() => {
    const query = findText.trim();
    if (!query) return [] as SearchResult[];
    return pages.flatMap((page) => {
      const excerpt = findExcerpt(page.content, query, false, false);
      return excerpt ? [{ pageNumber: page.pageNumber, source: "原文" as const, excerpt }] : [];
    });
  }, [findText, pages]);

  const jumpToPage = useCallback((next: number) => {
    const page = clamp(next, 1, totalPages);
    setCurrentPage(page); setSelection(null);
    if (view === "continuous") window.setTimeout(() => viewportRef.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }, [totalPages, view]);

  const fitPage = useCallback((kind: "width" | "page") => {
    const width = viewportRef.current?.clientWidth ?? 920;
    setZoom(kind === "width" ? clamp((width - 88) / 595, 0.65, 2.1) : clamp((window.innerHeight - 220) / 842, 0.55, 1.55));
  }, []);

  async function jumpToOutline(item: OutlineItem) {
    if (!pdf || !item.dest) return;
    try {
      const destination = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
      const ref = (destination as any[])?.[0];
      if (ref) jumpToPage((await pdf.getPageIndex(ref)) + 1);
    } catch { /* malformed outlines stay visible but inert */ }
  }

  return <main className="office-reader-shell">
    <ReaderToolbar title={title} marking={marking} sidebarOpen={sidebarOpen} zoom={zoom} view={view} findOpen={findOpen} findText={findText} results={searchResults} onExit={onExit} onToggleMarking={() => setMarking((value) => !value)} onToggleSidebar={() => setSidebarOpen((value) => !value)} onZoom={(delta) => setZoom((value) => clamp(value + delta, 0.5, 2.4))} onFit={fitPage} onViewChange={setView} onToggleFind={() => setFindOpen((value) => !value)} onFindChange={setFindText} onCloseFind={() => setFindOpen(false)} onJump={jumpToPage} />
    <div className="office-reader-body">
      {sidebarOpen && <ReaderSidebar navigation={navigation} onNavigationChange={setNavigation}>
        {navigation === "pages" && <div className="office-thumbnails">{pdf ? Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => <PdfThumbnail key={number} pdf={pdf} pageNumber={number} active={number === currentPage} onOpen={() => jumpToPage(number)} />) : <ReaderEmpty label="正在生成页面缩略图" loading />}</div>}
        {navigation === "outline" && (outline.length ? <div className="office-outline">{outline.map((item, index) => <button type="button" key={`${item.title}-${index}`} style={{ paddingLeft: `${12 + item.depth * 15}px` }} onClick={() => jumpToOutline(item)}>{item.title}</button>)}</div> : <ReaderEmpty label="这份 PDF 尚未提供可读取目录。" icon={<ListTree size={21} />} />)}
        {navigation === "bookmarks" && <div className="office-bookmarks">{marks.filter((mark) => mark.kind === "bookmark").length ? marks.filter((mark) => mark.kind === "bookmark").map((mark) => <button type="button" key={mark.id} onClick={() => jumpToPage(mark.page_number)}><Bookmark size={14} /> 第 {mark.page_number} 页 {mark.note || "书签"}</button>) : <ReaderEmpty label="暂无书签" icon={<Bookmark size={21} />} />}</div>}
        {navigation === "annotations" && <div className="office-annotation-manager">{marks.filter((mark) => mark.kind !== "bookmark").length ? marks.filter((mark) => mark.kind !== "bookmark").map((mark) => <article key={mark.id}><button type="button" className="office-annotation-main" onClick={() => jumpToPage(mark.page_number)}><span className={`office-annotation-dot ${mark.kind}`} /><span><b>{mark.kind === "note" ? "批注" : mark.kind === "question" ? "询问" : "存疑"} · 第 {mark.page_number} 页</b><em>{mark.note || "未添加文字说明"}</em></span></button><div><button type="button" onClick={() => onEditMark(mark.id)}>编辑</button>{mark.kind === "doubt" && <button type="button" onClick={() => onSetDoubtStatus(mark.id)}>{mark.status === "resolved" ? "恢复" : "解决"}</button>}<button type="button" onClick={() => onDeleteMark(mark.id)}>删除</button></div></article>) : <ReaderEmpty label="暂无批注" icon={<StickyNote size={21} />} />}</div>}
      </ReaderSidebar>}
      <section className={`office-document-stage ${view}`} ref={viewportRef}>
        {loading && <div className="office-document-state"><LoaderCircle size={22} className="inline-loader" /> 正在打开原始 PDF…</div>}
        {error && <div className="office-document-state error">无法打开论文：{error}</div>}
        {pdf && <div className="office-pages">{visiblePages.map((number) => <PdfPage key={`${number}-${zoom}`} pdf={pdf} pageNumber={number} zoom={zoom} marks={marks.filter((mark) => mark.page_number === number)} marking={marking} followScroll={view === "continuous"} onSelect={(pageNumber, anchor) => setSelection({ pageNumber, anchor })} onVisible={setCurrentPage} />)}</div>}
        {selection && <div className="office-selection-actions"><span>已选择第 {selection.pageNumber} 页区域</span><button type="button" onClick={() => { onCreateMark("note", selection.pageNumber, selection.anchor); setSelection(null); }}>批注</button><button type="button" onClick={() => { onCreateMark("question", selection.pageNumber, selection.anchor); setSelection(null); }}>询问</button><button type="button" onClick={() => { onCreateMark("doubt", selection.pageNumber, selection.anchor); setSelection(null); }}>存疑</button><button type="button" onClick={() => { onCreateMark("bookmark", selection.pageNumber, selection.anchor); setSelection(null); }}>书签</button><button type="button" onClick={() => setSelection(null)} aria-label="取消选择"><X size={14} /></button></div>}
      </section>
    </div>
    <footer className="office-statusbar"><div><button type="button" disabled={currentPage <= 1} onClick={() => jumpToPage(currentPage - 1)}><ChevronLeft size={16} /> 上一页</button><label>页码 <input type="number" min={1} max={totalPages} value={currentPage} onChange={(event) => jumpToPage(Number(event.target.value))} /></label><span>/ {totalPages}</span><button type="button" disabled={currentPage >= totalPages} onClick={() => jumpToPage(currentPage + 1)}>下一页 <ChevronRight size={16} /></button></div><span>{view === "continuous" ? "连续阅读 · 随滚动自动更新页码" : view === "double" ? "双页" : "单页"} · {marking ? "批注工具已开启" : "阅读模式"}</span></footer>
  </main>;
}

function ReaderEmpty({ label, icon, loading = false }: { label: string; icon?: React.ReactNode; loading?: boolean }) {
  return <div className="office-side-empty">{loading ? <LoaderCircle size={20} className="inline-loader" /> : icon}<p>{label}</p></div>;
}
