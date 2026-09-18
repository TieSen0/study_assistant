"use client";

import "./codex-shell.css";
import { Bell, BookOpenText, Bot, ChevronDown, ChevronRight, Command, FilePlus2, Files, Folder, FolderOpen, GitBranch, LayoutPanelLeft, LibraryBig, MessageSquareText, MoreHorizontal, PanelRight, Search, Send, Settings2, Sparkles, TerminalSquare, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

type Activity = "资料" | "检索" | "阅读" | "笔记";
type Tab = { id: string; label: string; view: "welcome" | "reader" | "notes" };
type ReadingPage = { pageNumber: number; content: string };
type StoredDocument = { id: string; title: string; mime_type: string; page_count: number; last_page?: number; created_at: string; pages?: ReadingPage[] };

const activityItems: { label: Activity; icon: typeof Files }[] = [{ icon: Files, label: "资料" }, { icon: Search, label: "检索" }, { icon: BookOpenText, label: "阅读" }, { icon: MessageSquareText, label: "笔记" }];
const sourceText = "A useful reading system keeps the reader close to evidence. The point is not to generate more notes, but to make a claim, its source, and the question that prompted it easy to revisit.";

async function extractPages(file: File): Promise<ReadingPage[]> {
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

export default function Home() {
  const [activity, setActivity] = useState<Activity>("资料");
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [tabs, setTabs] = useState<Tab[]>([{ id: "welcome", label: "欢迎使用 Lens", view: "welcome" }]);
  const [activeTab, setActiveTab] = useState("welcome");
  const [commandOpen, setCommandOpen] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState(false);
  const [agentOpen, setAgentOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [activeDocument, setActiveDocument] = useState<StoredDocument | null>(null);
  const [libraryState, setLibraryState] = useState<"loading" | "ready" | "error">("loading");
  const [uploadState, setUploadState] = useState<"idle" | "reading" | "saving">("idle");
  const [libraryMessage, setLibraryMessage] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  useEffect(() => {
    fetch("/api/documents")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => { setDocuments(data.documents ?? []); setLibraryState("ready"); })
      .catch(() => { setLibraryState("error"); setLibraryMessage("资料库暂时不可用。你仍可体验界面原型。"); });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen((open) => !open); }
      if (event.key === "Escape") setCommandOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function openTab(view: Tab["view"], label: string) {
    const existing = tabs.find((tab) => tab.view === view);
    if (existing) { setActiveTab(existing.id); return; }
    const id = `${view}-${Date.now()}`;
    setTabs((items) => [...items, { id, label, view }]);
    setActiveTab(id);
  }

  function openReader(document?: StoredDocument) {
    setSelectedEvidence(false);
    if (document) setActiveDocument(document);
    const id = document ? `reader-${document.id}` : "reader-prototype";
    const label = document?.title ?? "示例资料.pdf";
    const existing = tabs.find((tab) => tab.id === id);
    if (existing) { setActiveTab(existing.id); return; }
    setTabs((items) => [...items, { id, label, view: "reader" }]);
    setActiveTab(id);
  }

  async function openDocument(document: StoredDocument) {
    if (document.pages) { openReader(document); return; }
    setLibraryMessage(`正在打开「${document.title}」…`);
    try {
      const response = await fetch(`/api/documents/${document.id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法打开资料。");
      const opened = { ...data.document, pages: (data.pages ?? []).map((page: { page_number: number; content: string }) => ({ pageNumber: page.page_number, content: page.content })) } as StoredDocument;
      setDocuments((items) => items.map((item) => item.id === opened.id ? opened : item));
      setLibraryMessage("");
      openReader(opened);
    } catch (error) {
      setLibraryMessage(error instanceof Error ? error.message : "无法打开资料。");
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setLibraryMessage("当前支持 20 MB 以内的资料。"); return; }
    try {
      setUploadState("reading");
      setLibraryMessage(`正在读取「${file.name}」…`);
      const pages = await extractPages(file);
      setUploadState("saving");
      const form = new FormData();
      form.append("file", file);
      form.append("pages", JSON.stringify(pages));
      const response = await fetch("/api/documents", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "导入失败。");
      const document = { ...data.document, pages } as StoredDocument;
      setDocuments((items) => [document, ...items]);
      setLibraryMessage(`已导入「${document.title}」。`);
      openReader(document);
    } catch (error) {
      setLibraryMessage(error instanceof Error ? error.message : "导入失败。");
    } finally {
      setUploadState("idle");
    }
  }

  function closeTab(id: string) {
    if (tabs.length === 1) return;
    const index = tabs.findIndex((tab) => tab.id === id);
    const remaining = tabs.filter((tab) => tab.id !== id);
    setTabs(remaining);
    if (activeTab === id) setActiveTab(remaining[Math.max(0, index - 1)].id);
  }

  function selectActivity(next: Activity) {
    setActivity(next);
    if (next === "阅读") openReader();
    if (next === "笔记") openTab("notes", "未整理笔记");
    if (next === "检索") window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!selectedEvidence || !draft.trim()) return;
    setMessages((items) => [...items, draft.trim()]);
    setDraft("");
  }

  const explorerBody = useMemo(() => {
    if (activity === "检索") return <div className="explorer-search"><label><Search size={15} /><input ref={searchRef} placeholder="搜索资料和笔记" /></label><p>输入后将从资料、笔记与批注中检索。</p>{documents.length ? documents.slice(0, 5).map((document) => <button type="button" key={document.id} onClick={() => openDocument(document)}><BookOpenText size={15} /> {document.title}</button>) : <button type="button" onClick={() => openReader()}><BookOpenText size={15} /> 打开阅读原型</button>}</div>;
    if (activity === "阅读") return <div className="explorer-list"><p>最近阅读</p>{documents.length ? documents.map((document) => <button type="button" key={document.id} className={`explorer-file ${activeDocument?.id === document.id ? "selected" : ""}`} onClick={() => openDocument(document)}><BookOpenText size={16} /><span>{document.title}<small>{document.page_count} 页 · 已保存</small></span></button>) : <button type="button" className="explorer-file selected" onClick={() => openReader()}><BookOpenText size={16} /><span>示例资料.pdf<small>阅读原型 · 1 页</small></span></button>}</div>;
    if (activity === "笔记") return <div className="explorer-list"><p>工作笔记</p><button type="button" className="explorer-file" onClick={() => openTab("notes", "未整理笔记")}><MessageSquareText size={16} /><span>未整理笔记<small>0 条内容</small></span></button></div>;
    return <><button type="button" className="codex-workspace-name" onClick={() => setLibraryOpen((open) => !open)}>{libraryOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<strong>我的工作区</strong></button>{libraryOpen && <><div className="codex-tree" aria-label="资料树"><button type="button" className="codex-tree-row open" onClick={() => openReader()}><ChevronDown size={14} /><FolderOpen size={16} /><span>资料库</span></button><button type="button" className="codex-tree-row indent" onClick={() => openReader()}><ChevronRight size={14} /><Folder size={16} /><span>论文</span></button><button type="button" className="codex-tree-row indent" onClick={() => openReader()}><ChevronRight size={14} /><Folder size={16} /><span>书籍</span></button><button type="button" className="codex-tree-row indent" onClick={() => openReader()}><ChevronRight size={14} /><Folder size={16} /><span>课程</span></button><button type="button" className="codex-tree-row"><ChevronRight size={14} /><LibraryBig size={16} /><span>知识库</span></button><button type="button" className="codex-tree-row" onClick={() => openTab("notes", "未整理笔记")}><ChevronRight size={14} /><MessageSquareText size={16} /><span>对话与笔记</span></button></div><div className="explorer-list imported-documents"><p>{libraryState === "loading" ? "正在读取资料库…" : "最近导入"}</p>{documents.map((document) => <button type="button" className={`explorer-file ${activeDocument?.id === document.id ? "selected" : ""}`} key={document.id} onClick={() => openDocument(document)}><BookOpenText size={16} /><span>{document.title}<small>{document.page_count} 页 · 已保存</small></span></button>)}{libraryState === "ready" && !documents.length && <small className="library-empty">还没有资料。可从上方导入 PDF、TXT 或 Markdown。</small>}{libraryMessage && <small className="library-message">{libraryMessage}</small>}</div></>}</>;
  }, [activity, libraryOpen, tabs, documents, activeDocument, libraryState, libraryMessage]);

  return <main className="codex-shell">
    <input ref={uploadRef} className="hidden-upload" type="file" accept="application/pdf,text/plain,text/markdown,.pdf,.txt,.md" onChange={handleUpload} />
    <header className="codex-titlebar"><div className="codex-brand"><span className="codex-brand-mark">L</span><strong>Lens</strong><span className="codex-brand-divider" /><span>个人知识工作台</span></div><button type="button" className="codex-command" onClick={() => setCommandOpen(true)} aria-label="命令面板"><Command size={14} /><span>搜索、打开或执行命令</span><kbd>Ctrl K</kbd></button><div className="codex-title-actions"><button type="button" aria-label="通知"><Bell size={16} /></button><button type="button" aria-label="更多"><MoreHorizontal size={17} /></button></div></header>
    <section className="codex-workbench">
      <nav className="codex-activitybar" aria-label="工作台导航"><div>{activityItems.map(({ icon: Icon, label }) => <button type="button" key={label} className={activity === label ? "active" : ""} title={label} aria-label={label} onClick={() => selectActivity(label)}><Icon size={21} /></button>)}</div><div><button type="button" title="设置" aria-label="设置"><Settings2 size={20} /></button><button type="button" title="账户" aria-label="账户"><span className="codex-avatar">TS</span></button></div></nav>
      <aside className="codex-explorer"><div className="codex-panel-title"><span>{activity === "资料" ? "资源管理器" : activity}</span><button type="button" aria-label="导入资料" onClick={() => uploadRef.current?.click()} disabled={uploadState !== "idle"}><FilePlus2 size={16} /></button><button type="button" aria-label="更多资源操作"><MoreHorizontal size={16} /></button></div>{explorerBody}<div className="codex-explorer-footer"><span className="codex-dot" /> {uploadState === "idle" ? "资料库已连接" : uploadState === "reading" ? "正在读取文件…" : "正在保存资料…"}</div></aside>
      <section className="codex-editor" aria-label="主工作区"><div className="codex-tabs">{tabs.map((tab) => <div className={`codex-tab ${tab.id === activeTab ? "active" : ""}`} key={tab.id} onClick={() => setActiveTab(tab.id)}><LayoutPanelLeft size={15} /><span>{tab.label}</span>{tabs.length > 1 && <button type="button" onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }} aria-label={`关闭 ${tab.label}`}><X size={13} /></button>}</div>)}<button type="button" className="codex-new-tab" onClick={() => openTab("welcome", "新建标签")} aria-label="新建标签">+</button></div><div className="codex-breadcrumb"><span>工作区</span><ChevronRight size={13} /><span>{currentTab.label}</span></div>{currentTab.view === "reader" ? <ReaderPrototype document={activeDocument} selectedEvidence={selectedEvidence} onSelectEvidence={() => setSelectedEvidence((selected) => !selected)} /> : currentTab.view === "notes" ? <NotesPrototype onReturn={() => openTab("welcome", "欢迎使用 Lens")} /> : <Welcome onOpenReader={() => openReader()} onOpenNotes={() => openTab("notes", "未整理笔记")} />}</section>
      {agentOpen ? <aside className="codex-agent" aria-label="Lens Agent"><header className="codex-agent-heading"><div><span className="codex-agent-mark"><Bot size={17} /></span><div><strong>Lens Agent</strong><small><i /> {selectedEvidence ? "已获得选区" : "等待上下文"}</small></div></div><button type="button" onClick={() => setAgentOpen(false)} aria-label="收起 Agent"><PanelRight size={17} /></button></header><div className="codex-agent-session"><span>当前会话</span><strong>{selectedEvidence ? "示例资料.pdf · 选区" : "新建阅读会话"}</strong><small>{selectedEvidence ? "1 段本地证据" : "尚未选择资料"}</small></div><div className="codex-agent-thread">{messages.length ? messages.map((message, index) => <article key={`${message}-${index}`}><p>{message}</p><small>本地草稿 · 未调用模型</small></article>) : <div className="codex-agent-empty"><div><Bot size={23} /></div><h2>从原文开始</h2><p>选择一篇资料或其中的一个区域后，Agent 才会获得明确的上下文。</p><ul><li>原文证据</li><li>页内上下文</li><li>你的批注与问题</li></ul></div>}</div><form className="codex-agent-compose" onSubmit={sendMessage}><textarea rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!selectedEvidence} placeholder={selectedEvidence ? "围绕已选原文写下问题…" : "先选择一份资料或原文区域…"} aria-label="向 Lens Agent 提问" /><button type="submit" disabled={!selectedEvidence || !draft.trim()}><span>保存问题</span><Send size={13} /></button><small>仅本地交互，不会调用模型</small></form></aside> : <button type="button" className="agent-reopen" onClick={() => setAgentOpen(true)}><Bot size={18} /> Agent</button>}
    </section>
    {commandOpen && <div className="command-layer" role="dialog" aria-modal="true" aria-label="命令面板" onMouseDown={() => setCommandOpen(false)}><section className="command-palette" onMouseDown={(event) => event.stopPropagation()}><header><Search size={16} /><input autoFocus placeholder="输入一个命令…" /><kbd>Esc</kbd></header><div><p>常用</p><button type="button" onClick={() => { openReader(); setCommandOpen(false); }}><BookOpenText size={16} /> 打开示例阅读器</button><button type="button" onClick={() => { uploadRef.current?.click(); setCommandOpen(false); }}><FilePlus2 size={16} /> 导入一份资料</button><button type="button" onClick={() => { openTab("notes", "未整理笔记"); setCommandOpen(false); }}><MessageSquareText size={16} /> 打开笔记面板</button><button type="button" onClick={() => { setActivity("检索"); setCommandOpen(false); window.setTimeout(() => searchRef.current?.focus(), 0); }}><Search size={16} /> 聚焦全局检索</button></div></section></div>}
    <footer className="codex-statusbar"><div><span><GitBranch size={13} /> main</span><span>·</span><span>本地交互原型</span></div><div><span>{tabs.length} 个标签</span><span>{selectedEvidence ? "已选择证据" : "无选区"}</span><TerminalSquare size={14} /></div></footer>
  </main>;
}

function Welcome({ onOpenReader, onOpenNotes }: { onOpenReader: () => void; onOpenNotes: () => void }) { return <div className="codex-editor-empty"><div className="codex-empty-logo"><Sparkles size={25} /></div><h1>从一个干净的工作区开始</h1><p>这是可交互的前端原型。先确认布局和操作方式，再接真实资料、阅读器和模型。</p><div className="codex-empty-actions"><button type="button" onClick={onOpenReader}><BookOpenText size={16} /> 打开阅读原型</button><button type="button" onClick={onOpenNotes}><MessageSquareText size={16} /> 打开笔记原型</button></div><span className="codex-shortcut"><Command size={14} /> 命令面板 · Ctrl K</span></div>; }
function ReaderPrototype({ document, selectedEvidence, onSelectEvidence }: { document: StoredDocument | null; selectedEvidence: boolean; onSelectEvidence: () => void }) { const content = document?.pages?.[0]?.content || sourceText; return <article className="reader-prototype"><header><div><span>{document?.mime_type === "application/pdf" ? "PDF" : document ? "已导入资料" : "PDF · 原型资料"}</span><strong>{document?.title ?? "How to keep reading close to evidence"}</strong></div><small>1 / {document?.page_count ?? 1}</small></header><section><p>{document ? "已保存资料" : "INTRODUCTION"}</p><h1>{document?.title ?? "Reading is a path back to evidence."}</h1><button type="button" className={selectedEvidence ? "evidence-selected" : ""} onClick={onSelectEvidence}>{content || "这份资料没有可提取的文字层。原文件已保存，后续可用增强识别处理。"}</button><small>{selectedEvidence ? "已选中：Agent 现在可以使用这段本地证据。" : "点击这段文字，模拟选择原文区域。"}</small></section></article>; }
function NotesPrototype({ onReturn }: { onReturn: () => void }) { return <div className="notes-prototype"><MessageSquareText size={28} /><h1>还没有笔记</h1><p>笔记、批注和 Agent 的结果将会在这里汇合。</p><button type="button" onClick={onReturn}>回到欢迎页</button></div>; }
