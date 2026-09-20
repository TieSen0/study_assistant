"use client";

import "./codex-shell.css";
import { Bell, BookOpenText, Bot, ChevronDown, ChevronRight, Command, FilePlus2, FileText, Files, Folder, FolderOpen, GitBranch, LibraryBig, ListTree, MessageSquareText, MoreHorizontal, PanelRight, Search, Send, Settings2, TerminalSquare, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

type Activity = "explorer" | "search" | "notes" | "extensions";
type PanelTab = "PROBLEMS" | "OUTPUT" | "TERMINAL";
type ReadingPage = { pageNumber: number; content: string };
type StoredDocument = { id: string; title: string; mime_type: string; page_count: number; last_page?: number; created_at: string; pages?: ReadingPage[] };
type AgentMessage = { id: string; document_id: string; role: "user" | "assistant" | "system"; content: string; context_page: number | null; context_kind: "document" | "selection"; created_at: string };

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
  const [activity, setActivity] = useState<Activity>("explorer");
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [openEditors, setOpenEditors] = useState<StoredDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [libraryState, setLibraryState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [agentOpen, setAgentOpen] = useState(true);
  const [agentDraft, setAgentDraft] = useState("");
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentState, setAgentState] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>("OUTPUT");
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const activeDocument = openEditors.find((document) => document.id === activeDocumentId) ?? null;
  const filteredDocuments = useMemo(() => documents.filter((document) => document.title.toLowerCase().includes(query.trim().toLowerCase())), [documents, query]);

  useEffect(() => {
    fetch("/api/documents")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => { setDocuments(data.documents ?? []); setLibraryState("ready"); })
      .catch(() => { setLibraryState("error"); setMessage("资料库暂时不可用。请稍后重试。"); });
  }, []);

  useEffect(() => {
    if (!activeDocumentId) {
      setAgentMessages([]);
      setAgentState("idle");
      return;
    }
    let cancelled = false;
    setAgentState("loading");
    fetch(`/api/documents/${activeDocumentId}/agent`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => {
        if (!cancelled) {
          setAgentMessages(data.messages ?? []);
          setAgentState("idle");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgentMessages([]);
          setAgentState("error");
        }
      });
    return () => { cancelled = true; };
  }, [activeDocumentId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen((open) => !open); }
      if (event.key === "Escape") { setCommandOpen(false); setFileMenuOpen(false); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function openDocument(document: StoredDocument) {
    setMessage("");
    let opened = document;
    if (!document.pages) {
      try {
        setMessage(`正在打开「${document.title}」…`);
        const response = await fetch(`/api/documents/${document.id}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "无法打开资料。");
        opened = { ...data.document, pages: (data.pages ?? []).map((page: { page_number: number; content: string }) => ({ pageNumber: page.page_number, content: page.content })) } as StoredDocument;
        setDocuments((items) => items.map((item) => item.id === opened.id ? opened : item));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "无法打开资料。");
        return;
      }
    }
    setOpenEditors((items) => items.some((item) => item.id === opened.id) ? items : [...items, opened]);
    setActiveDocumentId(opened.id);
    setMessage("");
  }

  function closeEditor(id: string) {
    const index = openEditors.findIndex((document) => document.id === id);
    const remaining = openEditors.filter((document) => document.id !== id);
    setOpenEditors(remaining);
    if (activeDocumentId === id) setActiveDocumentId(remaining[Math.max(0, index - 1)]?.id ?? null);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setMessage("当前支持 20 MB 以内的资料。"); return; }
    try {
      setUploading(true);
      setMessage(`正在解析「${file.name}」…`);
      const pages = await extractPages(file);
      const form = new FormData();
      form.append("file", file);
      form.append("pages", JSON.stringify(pages));
      const response = await fetch("/api/documents", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "导入失败。");
      const document = { ...data.document, pages } as StoredDocument;
      setDocuments((items) => [document, ...items]);
      await openDocument(document);
      setMessage(`已导入「${document.title}」。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败。");
    } finally {
      setUploading(false);
    }
  }

  async function saveAgentNote(event: FormEvent) {
    event.preventDefault();
    if (!activeDocument || !agentDraft.trim()) return;
    const content = agentDraft.trim();
    try {
      setAgentState("saving");
      const response = await fetch(`/api/documents/${activeDocument.id}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, contextPage: activeDocument.last_page ?? 1, contextKind: "document" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法保存问题。");
      setAgentMessages((items) => [...items, data.message]);
      setAgentDraft("");
      setAgentState("idle");
    } catch (error) {
      setAgentState("error");
      setMessage(error instanceof Error ? error.message : "无法保存问题。");
    }
  }

  return <main className="vscode-shell">
    <input ref={uploadRef} className="hidden-upload" type="file" accept="application/pdf,text/plain,text/markdown,.pdf,.txt,.md" onChange={handleUpload} />
    <header className="vscode-menubar"><div className="vscode-brand"><span>Lens</span><small>个人论文工作台</small></div><nav aria-label="应用菜单"><button type="button" onClick={() => setFileMenuOpen((open) => !open)}>文件</button><button type="button">编辑</button><button type="button">选择</button><button type="button">视图</button><button type="button">转到</button><button type="button">运行</button><button type="button">终端</button><button type="button">帮助</button></nav><button type="button" className="vscode-command-center" onClick={() => setCommandOpen(true)}><Command size={14} /> 搜索 <kbd>Ctrl K</kbd></button><div className="vscode-window-actions"><button type="button" aria-label="通知"><Bell size={15} /></button><button type="button" aria-label="更多"><MoreHorizontal size={16} /></button></div>{fileMenuOpen && <div className="vscode-file-menu"><button type="button" onClick={() => { uploadRef.current?.click(); setFileMenuOpen(false); }}><FilePlus2 size={15} /> 导入资料…</button><button type="button" onClick={() => { setActivity("explorer"); setFileMenuOpen(false); }}>打开资源管理器</button></div>}</header>
    <section className="vscode-workbench">
      <nav className="vscode-activitybar" aria-label="主侧栏"><div><ActivityButton active={activity === "explorer"} icon={Files} label="资源管理器" onClick={() => setActivity("explorer")} /><ActivityButton active={activity === "search"} icon={Search} label="搜索" onClick={() => setActivity("search")} /><ActivityButton active={activity === "notes"} icon={MessageSquareText} label="笔记" onClick={() => setActivity("notes")} /><ActivityButton active={activity === "extensions"} icon={LibraryBig} label="扩展" onClick={() => setActivity("extensions")} /></div><div><ActivityButton icon={Settings2} label="管理" onClick={() => undefined} /></div></nav>
      <aside className="vscode-sidebar">{activity === "explorer" ? <Explorer documents={documents} openEditors={openEditors} activeId={activeDocumentId} loading={libraryState === "loading"} onImport={() => uploadRef.current?.click()} onOpen={openDocument} onClose={closeEditor} /> : activity === "search" ? <SearchSidebar query={query} onQuery={setQuery} documents={filteredDocuments} onOpen={openDocument} /> : activity === "notes" ? <NotesSidebar messages={agentMessages} document={activeDocument} /> : <ExtensionsSidebar />}</aside>
      <section className="vscode-editor-area" aria-label="编辑器组"><div className="vscode-editor-tabs">{openEditors.map((document) => <button type="button" key={document.id} className={document.id === activeDocumentId ? "active" : ""} onClick={() => setActiveDocumentId(document.id)}><FileText size={15} /><span>{document.title}{document.mime_type === "application/pdf" ? ".pdf" : ""}</span><i onClick={(event) => { event.stopPropagation(); closeEditor(document.id); }}><X size={13} /></i></button>)}</div>{activeDocument ? <DocumentEditor document={activeDocument} /> : <WelcomeEditor onImport={() => uploadRef.current?.click()} />}{panelOpen && <BottomPanel active={panelTab} onSelect={setPanelTab} onClose={() => setPanelOpen(false)} documents={documents.length} message={message} />}</section>
      {agentOpen ? <AgentSidebar document={activeDocument} draft={agentDraft} messages={agentMessages} state={agentState} onDraft={setAgentDraft} onSave={saveAgentNote} onClose={() => setAgentOpen(false)} /> : <button type="button" className="vscode-reopen-secondary" onClick={() => setAgentOpen(true)}><Bot size={18} /> Agent</button>}
    </section>
    <footer className="vscode-statusbar"><div><span><GitBranch size={12} /> main</span><span>资料库 {libraryState === "ready" ? "已连接" : "连接中"}</span></div><div><button type="button" onClick={() => setPanelOpen((open) => !open)}>{panelOpen ? "收起面板" : "打开面板"}</button><span>{activeDocument ? `${activeDocument.page_count} 页` : "无编辑器"}</span><TerminalSquare size={13} /></div></footer>
    {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)} onImport={() => { uploadRef.current?.click(); setCommandOpen(false); }} onExplorer={() => { setActivity("explorer"); setCommandOpen(false); }} />}
  </main>;
}

function ActivityButton({ active, icon: Icon, label, onClick }: { active?: boolean; icon: typeof Files; label: string; onClick: () => void }) { return <button type="button" className={active ? "active" : ""} title={label} aria-label={label} onClick={onClick}><Icon size={21} /></button>; }
function Explorer({ documents, openEditors, activeId, loading, onImport, onOpen, onClose }: { documents: StoredDocument[]; openEditors: StoredDocument[]; activeId: string | null; loading: boolean; onImport: () => void; onOpen: (document: StoredDocument) => void; onClose: (id: string) => void }) { return <><header className="vscode-sidebar-title"><strong>EXPLORER</strong><button type="button" title="导入资料" onClick={onImport}><FilePlus2 size={16} /></button><button type="button" title="更多"><MoreHorizontal size={16} /></button></header><section className="vscode-side-section"><h2><ChevronDown size={14} /> OPEN EDITORS</h2>{openEditors.length ? openEditors.map((document) => <button type="button" className={`vscode-file-row ${activeId === document.id ? "selected" : ""}`} key={document.id} onClick={() => onOpen(document)}><FileText size={15} /><span>{document.title}{document.mime_type === "application/pdf" ? ".pdf" : ""}</span><i onClick={(event) => { event.stopPropagation(); onClose(document.id); }}><X size={12} /></i></button>) : <p className="vscode-empty-line">没有已打开的编辑器</p>}</section><section className="vscode-side-section workspace"><h2><ChevronDown size={14} /> LENS</h2><button type="button" className="vscode-tree-root" onClick={onImport}><ChevronDown size={14} /><FolderOpen size={16} /> 资料库</button><div className="vscode-tree-indent"><button type="button" className="vscode-tree-folder"><ChevronRight size={14} /><Folder size={16} /> papers</button><button type="button" className="vscode-tree-folder"><ChevronRight size={14} /><Folder size={16} /> books</button>{loading ? <p className="vscode-empty-line">正在读取资料库…</p> : documents.map((document) => <button type="button" className={`vscode-file-row ${activeId === document.id ? "selected" : ""}`} key={document.id} onClick={() => onOpen(document)}><FileText size={15} /><span>{document.title}{document.mime_type === "application/pdf" ? ".pdf" : ""}</span></button>)}{!loading && !documents.length && <p className="vscode-empty-line">导入第一篇论文开始</p>}</div></section></>; }
function SearchSidebar({ query, onQuery, documents, onOpen }: { query: string; onQuery: (value: string) => void; documents: StoredDocument[]; onOpen: (document: StoredDocument) => void }) { return <><header className="vscode-sidebar-title"><strong>SEARCH</strong></header><div className="vscode-search-box"><Search size={15} /><input autoFocus value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search" /></div><section className="vscode-search-results">{query.trim() ? documents.map((document) => <button type="button" key={document.id} onClick={() => onOpen(document)}><FileText size={15} />{document.title}</button>) : <p>输入文件名以搜索资料库。</p>}{query.trim() && !documents.length && <p>没有结果。</p>}</section></>; }
function NotesSidebar({ messages, document }: { messages: AgentMessage[]; document: StoredDocument | null }) { return <><header className="vscode-sidebar-title"><strong>NOTES</strong></header><section className="vscode-search-results">{document ? messages.length ? messages.map((message) => <article key={message.id}><b>{message.context_page ? `第 ${message.context_page} 页 · 问题` : "文档问题"}</b><p>{message.content}</p></article>) : <p>当前文档还没有保存的问题。</p> : <p>打开一份资料后，这里会显示它的问题线程。</p>}</section></>; }
function ExtensionsSidebar() { return <><header className="vscode-sidebar-title"><strong>EXTENSIONS</strong></header><section className="vscode-search-results"><p>这里以后放论文解析器、OCR、引用管理和模型连接器。</p></section></>; }
function WelcomeEditor({ onImport }: { onImport: () => void }) { return <div className="vscode-welcome"><span className="vscode-welcome-mark">L</span><h1>Lens</h1><p>以 VSCode 的工作方式处理论文与资料。</p><button type="button" onClick={onImport}><FilePlus2 size={16} /> 导入一份资料</button><small>导入后会作为一个文件出现在资源管理器，并在编辑器标签中打开。</small></div>; }
function DocumentEditor({ document }: { document: StoredDocument }) { if (document.mime_type === "application/pdf") return <div className="vscode-pdf-editor"><header><span><FileText size={15} /> {document.title}.pdf</span><small>原始 PDF 预览</small></header><iframe title={`${document.title} 原始 PDF`} src={`/api/documents/${document.id}/file#page=${document.last_page ?? 1}&zoom=page-width`} /></div>; return <article className="vscode-text-editor"><header><FileText size={15} /> {document.title}</header><pre>{document.pages?.[0]?.content || "这份资料没有可读取的文字层。"}</pre></article>; }
function BottomPanel({ active, onSelect, onClose, documents, message }: { active: PanelTab; onSelect: (tab: PanelTab) => void; onClose: () => void; documents: number; message: string }) { return <section className="vscode-bottom-panel"><header>{(["PROBLEMS", "OUTPUT", "TERMINAL"] as PanelTab[]).map((tab) => <button type="button" key={tab} className={tab === active ? "active" : ""} onClick={() => onSelect(tab)}>{tab}</button>)}<i /><button type="button" onClick={onClose} aria-label="关闭面板"><X size={15} /></button></header><div>{active === "PROBLEMS" ? <p>0 problems</p> : active === "OUTPUT" ? <p>{message || `资料库中有 ${documents} 份资料。`}</p> : <p>终端尚未接入。这里将用于显示本地解析、OCR 与索引任务。</p>}</div></section>; }
function AgentSidebar({ document, draft, messages, state, onDraft, onSave, onClose }: { document: StoredDocument | null; draft: string; messages: AgentMessage[]; state: "idle" | "loading" | "saving" | "error"; onDraft: (value: string) => void; onSave: (event: FormEvent) => void; onClose: () => void }) { return <aside className="vscode-secondary"><header className="vscode-sidebar-title"><strong>LENS AGENT</strong><button type="button" onClick={onClose} aria-label="关闭次级侧栏"><PanelRight size={16} /></button></header><div className="vscode-agent-context"><Bot size={19} /><div><b>{document ? document.title : "未选择文件"}</b><small>{document ? `文档线程 · ${document.page_count} 页 · 上下文已绑定` : "打开一份资料后即可提问"}</small></div></div><section className="vscode-agent-thread">{state === "loading" ? <p>正在读取这篇论文的问题线程…</p> : messages.length ? messages.map((message) => <article key={message.id}><p>{message.content}</p><small>{message.context_page ? `第 ${message.context_page} 页 · ` : "文档级 · "}{message.role === "user" ? "待模型处理" : "模型消息"}</small></article>) : <p>先把你想弄懂的点记录下来。每条问题会随当前文档与页码保存，之后模型接入时可以直接使用。</p>}</section><form className="vscode-agent-compose" onSubmit={onSave}><textarea value={draft} onChange={(event) => onDraft(event.target.value)} disabled={!document || state === "saving"} placeholder={document ? "针对当前文档提问…" : "先从资源管理器打开一份资料"} rows={3} /><button type="submit" disabled={!document || !draft.trim() || state === "saving"}>{state === "saving" ? "正在保存…" : "保存问题"} <Send size={13} /></button><small>{state === "error" ? "保存失败，请重试。" : "不会发送给外部模型；刷新后仍会保留。"}</small></form></aside>; }
function CommandPalette({ onClose, onImport, onExplorer }: { onClose: () => void; onImport: () => void; onExplorer: () => void }) { return <div className="vscode-command-layer" onMouseDown={onClose}><section onMouseDown={(event) => event.stopPropagation()}><header><Command size={16} /><input autoFocus placeholder="输入命令" /><kbd>Esc</kbd></header><button type="button" onClick={onImport}><FilePlus2 size={16} /> Lens: 导入资料</button><button type="button" onClick={onExplorer}><Files size={16} /> View: Show Explorer</button></section></div>; }
