"use client";

import "./import-status.css";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { OriginalPdfReader, PdfAnchor, PdfMark } from "./components/original-pdf-reader";
import { OfficePdfReader } from "./components/office-pdf-reader";
import {
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Highlighter,
  LibraryBig,
  LoaderCircle,
  MessageCircleQuestion,
  MoreHorizontal,
  Network,
  PanelLeftClose,
  Plus,
  Quote,
  Search,
  Send,
  Sparkles,
  Upload,
} from "lucide-react";

type ReadingPage = { pageNumber: number; content: string };
type ReadingDocument = {
  id: string;
  type: "论文" | "书籍" | "笔记" | "资料";
  title: string;
  source: string;
  tag: string;
  pages: ReadingPage[];
  isRemote?: boolean;
  mimeType?: string;
  lastPage?: number;
};

type RemoteDocument = { id: string; title: string; mime_type: string; page_count: number; last_page?: number; created_at: string };
type AnnotationKind = "note" | "question" | "doubt" | "bookmark";
type ReadingAnnotation = PdfMark & { document_id: string; page_number: number; note: string; created_at: string; resolved_at: string | null };

function parseAnchor(value: string): PdfAnchor | null {
  try {
    const anchor = JSON.parse(value) as PdfAnchor;
    return typeof anchor.x === "number" && typeof anchor.y === "number" && typeof anchor.width === "number" && typeof anchor.height === "number" ? anchor : null;
  } catch {
    return null;
  }
}

const sampleDocuments: ReadingDocument[] = [
  {
    id: "sample-retrieval",
    type: "论文",
    title: "Retrieval as a Reading Practice",
    source: "示例论文 · 第 2 页",
    tag: "示例材料",
    pages: [{ pageNumber: 2, content: "A reading system should lower the cost of returning to evidence, rather than merely increase the amount of notes a reader produces.\n\nThe useful unit is not a document-sized summary. It is a claim, the passage that supports it, and the question that caused the reader to care.\n\nWhen a later question arrives, retrieval should surface the smallest sufficient context and preserve the path back to the original page." }],
  },
  {
    id: "sample-algorithm",
    type: "书籍",
    title: "算法导论 · 动态规划",
    source: "示例书籍 · 第 15 章",
    tag: "示例材料",
    pages: [{ pageNumber: 15, content: "动态规划并不是记住更多状态，而是先证明一个最优解能由更小的最优解组成。\n\n若某个子问题的选择会改变后续子问题的定义，就需要谨慎检查是否真的存在最优子结构。\n\n推导状态转移式之前，先写清状态究竟承诺了什么信息。" }],
  },
];

const tools = [
  { id: "explain", label: "解释这段" },
  { id: "argument", label: "拆解论证" },
  { id: "terms", label: "标出术语" },
];

function splitParagraphs(content: string) {
  const blocks = content
    .split(/\n{2,}|(?<=[。！？.!?])\s+(?=[A-Z\u4e00-\u9fff])/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return blocks.length ? blocks : [content.trim()];
}

async function extractPages(file: File): Promise<ReadingPage[]> {
  const lowerName = file.name.toLowerCase();
  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // Vite turns `new URL(..., import.meta.url)` into a file:// URL in this
    // client bundle. Importing with ?url emits a browser-accessible asset URL.
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: ReadingPage[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const text = await page.getTextContent();
      const content = text.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      // Keep an entry for every original page. An empty text layer is useful
      // debug information, not a reason to hide a scanned PDF from the reader.
      pages.push({ pageNumber, content });
    }
    return pages;
  }
  if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) {
    return [{ pageNumber: 1, content: await file.text() }];
  }
  throw new Error("当前请上传 PDF、TXT 或 Markdown 文件。扫描版 PDF 需要先经过 OCR。 ");
}

function remoteToDocument(item: RemoteDocument, pages: ReadingPage[] = []): ReadingDocument {
  return {
    id: item.id,
    type: "资料",
    title: item.title,
    source: `${item.page_count} 页 · ${new Date(item.created_at).toLocaleDateString("zh-CN")}`,
    tag: "我的资料",
    pages,
    isRemote: true,
    mimeType: item.mime_type,
    lastPage: item.last_page,
  };
}

export default function Home() {
  const [remoteDocuments, setRemoteDocuments] = useState<ReadingDocument[]>([]);
  const [activeDocument, setActiveDocument] = useState<ReadingDocument>(sampleDocuments[0]);
  const [activePage, setActivePage] = useState(0);
  const [selectedText, setSelectedText] = useState("");
  const [tool, setTool] = useState("explain");
  const [question, setQuestion] = useState("");
  const [saved, setSaved] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "extracting" | "uploading">("idle");
  const [uploadMessage, setUploadMessage] = useState("上传 PDF、TXT 或 Markdown，资料会保存在你的私有资料库。");
  const [uploadKind, setUploadKind] = useState<"hint" | "working" | "success" | "error">("hint");
  const [showDebug, setShowDebug] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [quickZoom, setQuickZoom] = useState("page-width");
  const [annotations, setAnnotations] = useState<ReadingAnnotation[]>([]);
  const [pendingAnchor, setPendingAnchor] = useState<PdfAnchor | null>(null);
  const [annotationMessage, setAnnotationMessage] = useState("");

  const library = [...remoteDocuments, ...sampleDocuments];
  const page = activeDocument.pages[activePage] ?? activeDocument.pages[0];
  const paragraphs = useMemo(() => (page ? splitParagraphs(page.content) : []), [page]);
  const selection = selectedText || paragraphs[0] || "请选择一段原文。";
  const isOriginalPdf = activeDocument.isRemote && activeDocument.mimeType === "application/pdf";
  const extractedPages = activeDocument.pages.filter((item) => item.content.trim().length > 0).length;

  useEffect(() => {
    fetch("/api/documents")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setRemoteDocuments((data.documents ?? []).map((item: RemoteDocument) => remoteToDocument(item))))
      .catch(() => {
        setUploadKind("error");
        setUploadMessage("资料库暂不可用；示例材料仍可正常阅读。");
      });
  }, []);

  useEffect(() => {
    setPendingAnchor(null);
    setAnnotationMode(false);
    setAnnotationMessage("");
    if (!activeDocument.isRemote) {
      setAnnotations([]);
      return;
    }
    fetch(`/api/documents/${activeDocument.id}/annotations`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setAnnotations((data.annotations ?? []).map((item: Omit<ReadingAnnotation, "anchor"> & { anchor: string }) => ({ ...item, anchor: parseAnchor(item.anchor) })).filter((item: ReadingAnnotation) => item.anchor)))
      .catch(() => setAnnotationMessage("批注暂时无法载入。"));
  }, [activeDocument.id, activeDocument.isRemote]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.key === "ArrowLeft" && activePage > 0) setActivePage((value) => value - 1);
      if (event.key === "ArrowRight" && activePage < activeDocument.pages.length - 1) setActivePage((value) => value + 1);
      if (event.key === "Escape") setReadingMode(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePage, activeDocument.pages.length]);

  useEffect(() => {
    if (!activeDocument.isRemote || !page) return;
    const timer = window.setTimeout(() => {
      fetch(`/api/documents/${activeDocument.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lastPage: page.pageNumber }) }).catch(() => undefined);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [activeDocument.id, activeDocument.isRemote, page?.pageNumber]);

  const response = useMemo(() => {
    if (question.trim()) {
      return `你正在问：“${question.trim()}”。当前版本先固定回答于已选原文：它强调的核心是“${selection.slice(0, 96)}${selection.length > 96 ? "…" : ""}”。模型式追问会在后续接入，但不会脱离这段证据。`;
    }
    if (tool === "argument") {
      return `主张：${selection.slice(0, 120)}${selection.length > 120 ? "…" : ""}\n\n阅读提示：先区分这段提出的结论、它给出的理由，以及仍需原文其他位置支持的部分。`;
    }
    if (tool === "terms") {
      return "本地标注模式会优先保留原文术语和它所在页码。等接入模型后，术语解释仍会附着在这段文本上，而不是脱离来源单独生成。";
    }
    return `这段最直接的意思是：${selection.slice(0, 150)}${selection.length > 150 ? "…" : ""}\n\n先读清它在断言什么，再回到前后段确认作者给出的依据。`;
  }, [question, selection, tool]);

  const pageAnnotations = annotations.filter((item) => item.page_number === page?.pageNumber);
  const openDoubts = annotations.filter((item) => item.kind === "doubt" && item.status === "open");

  async function saveAnnotation(kind: AnnotationKind, suppliedAnchor?: PdfAnchor, suppliedPageNumber?: number) {
    const anchor = suppliedAnchor ?? pendingAnchor;
    const pageNumber = suppliedPageNumber ?? page?.pageNumber;
    if (!activeDocument.isRemote || !anchor || !pageNumber) return;
    const label = kind === "note" ? "批注" : kind === "doubt" ? "存疑" : kind === "question" ? "询问" : "书签";
    const note = kind === "bookmark" ? "" : window.prompt(`${label}内容（可留空）：`) ?? "";
    try {
      setAnnotationMessage(`正在保存${label}…`);
      const response = await fetch(`/api/documents/${activeDocument.id}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageNumber, kind, anchor, note }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法保存标记。 ");
      const annotation = { ...data.annotation, anchor: parseAnchor(data.annotation.anchor) } as ReadingAnnotation;
      setAnnotations((items) => [...items, annotation]);
      setPendingAnchor(null);
      setAnnotationMessage(`已添加${label}。`);
      setSelectedText(`第 ${pageNumber} 页的${label}区域`);
      if (kind === "question") {
        setReadingMode(false);
        setQuestion(note || `请解释第 ${pageNumber} 页这个选区。`);
      }
    } catch (error) {
      setAnnotationMessage(error instanceof Error ? error.message : "无法保存标记。 ");
    }
  }

  async function setDoubtStatus(annotation: ReadingAnnotation) {
    try {
      const nextStatus = annotation.status === "open" ? "resolved" : "open";
      const response = await fetch(`/api/documents/${activeDocument.id}/annotations`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: annotation.id, status: nextStatus }) });
      if (!response.ok) throw new Error("无法更新存疑状态。 ");
      setAnnotations((items) => items.map((item) => item.id === annotation.id ? { ...item, status: nextStatus } : item));
    } catch (error) {
      setAnnotationMessage(error instanceof Error ? error.message : "无法更新存疑状态。 ");
    }
  }

  async function editAnnotation(annotation: ReadingAnnotation) {
    const note = window.prompt("编辑标记内容：", annotation.note);
    if (note === null) return;
    const response = await fetch(`/api/documents/${activeDocument.id}/annotations`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: annotation.id, status: annotation.status, note }) });
    if (!response.ok) return setAnnotationMessage("无法编辑标记。 ");
    setAnnotations((items) => items.map((item) => item.id === annotation.id ? { ...item, note } : item));
  }

  async function deleteAnnotation(annotation: ReadingAnnotation) {
    if (!window.confirm("删除这个标记吗？此操作不可恢复。")) return;
    const response = await fetch(`/api/documents/${activeDocument.id}/annotations`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: annotation.id }) });
    if (!response.ok) return setAnnotationMessage("无法删除标记。 ");
    setAnnotations((items) => items.filter((item) => item.id !== annotation.id));
  }

  async function renameDocument() {
    if (!activeDocument.isRemote) return;
    const title = window.prompt("资料标题：", activeDocument.title)?.trim();
    if (!title || title === activeDocument.title) return;
    const response = await fetch(`/api/documents/${activeDocument.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
    if (!response.ok) return setUploadMessage("无法修改资料标题。 ");
    setActiveDocument((item) => ({ ...item, title }));
    setRemoteDocuments((items) => items.map((item) => item.id === activeDocument.id ? { ...item, title } : item));
    setUploadKind("success");
    setUploadMessage("资料标题已更新。 ");
  }

  async function deleteDocument() {
    if (!activeDocument.isRemote || !window.confirm(`删除「${activeDocument.title}」及其所有标记吗？此操作不可恢复。`)) return;
    const id = activeDocument.id;
    const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!response.ok) return setUploadMessage("无法删除资料。 ");
    setRemoteDocuments((items) => items.filter((item) => item.id !== id));
    setActiveDocument(sampleDocuments[0]);
    setActivePage(0);
    setUploadKind("success");
    setUploadMessage("资料及其标记已删除。 ");
  }

  function jumpTo(annotation: ReadingAnnotation) {
    const index = activeDocument.pages.findIndex((item) => item.pageNumber === annotation.page_number);
    if (index >= 0) setActivePage(index);
    setPendingAnchor(null);
    setSelectedText(`第 ${annotation.page_number} 页的${annotation.kind === "doubt" ? "存疑" : "标记"}区域`);
  }

  async function openDocument(document: ReadingDocument) {
    setQuestion("");
    setSelectedText("");
    setSaved(false);
    setActivePage(0);
    setShowDebug(false);
    if (!document.isRemote || document.pages.length) {
      setActiveDocument(document);
      return;
    }
    setUploadKind("working");
    setUploadMessage("正在打开已保存的资料…");
    try {
      const response = await fetch(`/api/documents/${document.id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法打开资料。");
      const opened = remoteToDocument(data.document as RemoteDocument, (data.pages ?? []).map((item: { page_number: number; content: string }) => ({ pageNumber: item.page_number, content: item.content })));
      setRemoteDocuments((items) => items.map((item) => item.id === opened.id ? opened : item));
      setActiveDocument(opened);
      const restoredIndex = opened.pages.findIndex((item) => item.pageNumber === (opened.lastPage ?? 1));
      setActivePage(restoredIndex >= 0 ? restoredIndex : 0);
      setUploadKind("success");
      setUploadMessage("资料已打开。阅读区展示原始文件；需要核对解析结果时可打开 Debug。 ");
    } catch (error) {
      setUploadKind("error");
      setUploadMessage(error instanceof Error ? error.message : "无法打开资料。 ");
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setUploadKind("error");
      setUploadMessage("文件超过 20 MB，请先拆分或压缩后再上传。 ");
      return;
    }
    try {
      setUploadState("extracting");
      setUploadKind("working");
      setUploadMessage(`正在读取「${file.name}」并提取页面文字…`);
      const pages = await extractPages(file);
      if (!pages.length) throw new Error("文件中没有可读取的页面。 ");
      setUploadState("uploading");
      setUploadMessage(`已提取 ${pages.length} 页，正在安全保存原文件与页面文本…`);
      const form = new FormData();
      form.append("file", file);
      form.append("pages", JSON.stringify(pages));
      const response = await fetch("/api/documents", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "上传失败。 ");
      const document = remoteToDocument(data.document as RemoteDocument, pages);
      setRemoteDocuments((items) => [document, ...items]);
      setActiveDocument(document);
      setActivePage(0);
      setSelectedText("");
      setQuestion("");
      setUploadKind("success");
      setShowDebug(false);
      const readablePages = pages.filter((item) => item.content.trim().length > 0).length;
      setUploadMessage(`已保存「${document.title}」：原始文件将直接显示；后台从 ${readablePages}/${pages.length} 页提取到文字。`);
    } catch (error) {
      setUploadKind("error");
      const reason = error instanceof Error ? error.message : "资料导入失败。";
      setUploadMessage(`没有导入成功：${reason}`);
    } finally {
      setUploadState("idle");
    }
  }

  if (readingMode && isOriginalPdf) {
    return <OfficePdfReader
      documentId={activeDocument.id}
      title={activeDocument.title}
      pageCount={Math.max(activeDocument.pages.length, 1)}
      initialPage={page?.pageNumber ?? 1}
      marks={annotations}
      onExit={() => setReadingMode(false)}
      onPageChange={(pageNumber) => {
        const index = activeDocument.pages.findIndex((item) => item.pageNumber === pageNumber);
        if (index >= 0) setActivePage(index);
      }}
      onCreateMark={(kind, pageNumber, anchor) => saveAnnotation(kind, anchor, pageNumber)}
    />;
  }

  return (
    <main className={`lens-shell ${readingMode ? "reading-mode" : ""}`}>
      <aside className="lens-rail">
        <div className="lens-logo" aria-label="Lens 阅读工作台"><span>l</span>ens<i>·</i></div>
        <nav aria-label="主导航" className="rail-nav">
          <button className="rail-item active" type="button"><BookOpen size={18} /> 阅读中</button>
          <button className="rail-item" type="button"><LibraryBig size={18} /> 我的资料</button>
          <button className="rail-item" type="button"><Highlighter size={18} /> 片段与标注</button>
          <button className="rail-item" type="button"><Network size={18} /> 关联线索</button>
        </nav>
        <div className="rail-foot"><span className="local-dot" /> 私有资料库</div>
      </aside>

      <section className="lens-main">
        <header className="lens-topbar">
          <div className="crumb"><FolderOpen size={15} /> 个人资料库 <span>/</span> 正在阅读</div>
          <div className="topbar-actions"><button type="button" className="reading-mode-toggle" onClick={() => isOriginalPdf ? setReadingMode(true) : setUploadMessage("请先导入并打开一份 PDF，再进入完整阅读模式。")}>阅读模式</button><label className={`import-button ${uploadState !== "idle" ? "busy" : ""}`}><Upload size={15} /> {uploadState === "idle" ? "导入资料" : "正在处理"}<input type="file" accept="application/pdf,text/plain,text/markdown,.pdf,.txt,.md" disabled={uploadState !== "idle"} onChange={handleUpload} /></label></div>
        </header>

        <div className={`import-status ${uploadKind}`} role="status" aria-live="polite">
          {uploadState !== "idle" && <LoaderCircle size={16} className="inline-loader" />}
          <span>{uploadMessage}</span>
        </div>

        <div className="lens-workspace">
          <aside className="library-panel">
            <div className="library-head"><div><p>资料库</p><strong>最近打开</strong></div><button type="button" aria-label="收起资料库"><PanelLeftClose size={17} /></button></div>
            <label className="search-box"><Search size={15} /><input placeholder="检索标题或内容" aria-label="检索资料" /></label>
            <div className="document-list">
              {library.map((item) => (
                <button type="button" key={item.id} onClick={() => openDocument(item)} className={`document-item ${item.id === activeDocument.id ? "selected" : ""}`}>
                  <FileText size={16} /><span><small>{item.type}</small><strong>{item.title}</strong><em>{item.source}</em></span>
                </button>
              ))}
            </div>
            <button type="button" className="new-collection"><Plus size={16} /> 新建资料夹</button>
          </aside>

          <article className="reader-pane">
            {uploadState !== "idle" && <div className="upload-overlay"><LoaderCircle size={24} className="inline-loader" /><strong>{uploadState === "extracting" ? "正在解析文章" : "正在保存资料"}</strong><span>请保持此页面打开，完成后会自动切换到文章正文。</span></div>}
            <div className="reader-toolbar"><div><span className="doc-kind">{activeDocument.type}</span><span className="doc-source">{activeDocument.source}</span></div><div className="reader-actions"><button type="button" aria-label="更多操作"><MoreHorizontal size={18} /></button>{isOriginalPdf && <button type="button" className={annotationMode ? "debug-active" : ""} onClick={() => { setAnnotationMode((value) => !value); setPendingAnchor(null); }}>{annotationMode ? "退出标记模式" : "标记模式"}</button>}{activeDocument.isRemote && <button type="button" onClick={renameDocument}>重命名</button>}{activeDocument.isRemote && <button type="button" className={showDebug ? "debug-active" : ""} onClick={() => setShowDebug((value) => !value)}>解析 Debug</button>}{activeDocument.isRemote && <a href={`/api/documents/${activeDocument.id}/file`} target="_blank" rel="noreferrer">新窗口打开</a>}{activeDocument.isRemote && <button type="button" className="danger-action" onClick={deleteDocument}>删除资料</button>}<button className={saved ? "saved" : ""} type="button" onClick={() => setSaved((value) => !value)}><Bookmark size={15} fill={saved ? "currentColor" : "none"} /> {saved ? "已保存片段" : "保存片段"}</button></div></div>
            <div className="reader-paper">
              <div className="reader-title"><p>{activeDocument.tag}</p><h1>{activeDocument.title}</h1><div><span>阅读视图</span><i /> <span>第 {page?.pageNumber ?? 1} 页</span><i /> <span>可追溯原文</span></div></div>
              {isOriginalPdf ? annotationMode ? <><OriginalPdfReader documentId={activeDocument.id} pageNumber={page?.pageNumber ?? 1} zoom={1.25} marks={pageAnnotations.map((item) => ({ id: item.id, kind: item.kind, anchor: item.anchor, status: item.status }))} onSelection={(anchor) => { setPendingAnchor(anchor); setSelectedText(`第 ${page?.pageNumber ?? 1} 页的已选区域`); setAnnotationMessage("已选择区域。选择一个操作以保存。 "); }} />{pendingAnchor && <div className="selection-action-bar"><span>已选中区域</span><button type="button" onClick={() => saveAnnotation("note")}>批注</button><button type="button" onClick={() => saveAnnotation("question")}>询问</button><button type="button" onClick={() => saveAnnotation("doubt")}>存疑</button><button type="button" onClick={() => saveAnnotation("bookmark")}>书签</button><button type="button" className="cancel" onClick={() => setPendingAnchor(null)}>取消</button></div>}</> : <section className="raw-pdf-shell"><div className="quick-reader-tools"><span>快速阅读</span><button type="button" onClick={() => setQuickZoom("page-width")}>适合宽度</button><button type="button" onClick={() => setQuickZoom("page-fit")}>适合整页</button><select value={quickZoom} onChange={(event) => setQuickZoom(event.target.value)} aria-label="PDF 缩放"><option value="75">75%</option><option value="100">100%</option><option value="125">125%</option><option value="150">150%</option><option value="200">200%</option><option value="page-width">适合宽度</option></select></div><iframe key={`${activeDocument.id}-${page?.pageNumber}-${quickZoom}`} title={`${activeDocument.title} 原始 PDF`} src={`/api/documents/${activeDocument.id}/file#page=${page?.pageNumber ?? 1}&zoom=${quickZoom}`} /><p>Ctrl + F 可搜索原文；使用浏览器阅读器的目录、缩略图与缩放控件。</p></section> : <section className="reader-body"><h2>{activeDocument.isRemote ? "原始文本" : "阅读示例"}{uploadState === "extracting" && <LoaderCircle className="inline-loader" size={17} />}</h2>{paragraphs.map((paragraph, index) => <p className={selection === paragraph ? "chosen" : ""} onClick={() => { setSelectedText(paragraph); setQuestion(""); }} key={`${page?.pageNumber}-${index}`}>{selection === paragraph ? <mark>{paragraph}</mark> : paragraph}</p>)}<blockquote><Quote size={18} /> 点击一段文字，即可把右侧回答固定到这一页的原文证据。</blockquote></section>}
              {showDebug && activeDocument.isRemote && <section className="debug-panel"><div><span>后台解析 Debug</span><small>普通模式 · 第 {page?.pageNumber ?? 1} 页 · 已识别文字页 {extractedPages}/{activeDocument.pages.length}</small></div><pre>{page?.content || "此页没有可提取的文字层。原始 PDF 仍保持完整；可在后续使用增强识别。"}</pre></section>}
              <div className="page-nav"><button type="button" disabled={activePage === 0} onClick={() => { setActivePage((value) => value - 1); setSelectedText(""); }}><ChevronLeft size={16} /> 上一页</button><span>{activePage + 1} / {activeDocument.pages.length || 1}</span><button type="button" disabled={activePage >= activeDocument.pages.length - 1} onClick={() => { setActivePage((value) => value + 1); setSelectedText(""); }}>下一页 <ChevronRight size={16} /></button></div>
            </div>
          </article>

          <aside className="insight-panel">
            <div className="insight-head"><div><p>{isOriginalPdf ? "后台文本索引" : "选中片段"}</p><strong>用证据回答</strong></div><span className="source-pill">p. {page?.pageNumber ?? 1}</span></div>
            <blockquote className="selection-quote">“{selection}”</blockquote>
            {isOriginalPdf && <section className="mark-summary"><div className="mark-summary-head"><strong>存疑队列</strong><span>{openDoubts.length} 条未解决</span></div>{openDoubts.length ? <div className="doubt-list">{openDoubts.map((item) => <div className="doubt-item" key={item.id}><button type="button" onClick={() => jumpTo(item)}>p. {item.page_number} · {item.note || "未写说明的存疑点"}</button><button type="button" onClick={() => setDoubtStatus(item)}>解决</button></div>)}</div> : <p className="empty-marks">框选原文后点“存疑”，它会出现在这里。</p>}<div className="mark-summary-head page-marks"><strong>本页标记</strong><span>{pageAnnotations.length} 个</span></div>{pageAnnotations.map((item) => <div className="page-mark" key={item.id}><span className={`mark-dot ${item.kind}`} /> <button type="button" onClick={() => jumpTo(item)}><b>{item.kind === "note" ? "批注" : item.kind === "question" ? "询问" : item.kind === "doubt" ? "存疑" : "书签"}</b><em>{item.note || "无文字说明"}</em></button><span className="mark-row-actions"><button type="button" onClick={() => editAnnotation(item)}>改</button><button type="button" onClick={() => deleteAnnotation(item)}>删</button></span></div>)}</section>}
            <div className="tool-row">{tools.map((item) => <button type="button" onClick={() => { setTool(item.id); setQuestion(""); }} className={tool === item.id && !question ? "selected" : ""} key={item.id}>{item.label}</button>)}</div>
            <section className="answer-card"><div className="answer-label"><Sparkles size={14} /> 阅读助手 <span>依据当前片段</span></div><p>{response}</p><button type="button" className="source-link" onClick={() => document.querySelector(".chosen")?.scrollIntoView({ behavior: "smooth", block: "center" })}><Highlighter size={14} /> 定位到原文第 {page?.pageNumber ?? 1} 页</button></section>
            <div className="ask-box"><MessageCircleQuestion size={17} /><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="围绕这段继续提问…" aria-label="对当前片段提问" /><button type="button" onClick={() => setQuestion((value) => value || "这段论证还缺少什么证据？")} aria-label="发送问题"><Send size={15} /></button></div>
            <p className="evidence-note">{annotationMessage || uploadMessage}</p>
          </aside>
        </div>
      </section>
    </main>
  );
}
