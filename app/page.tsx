"use client";

import "./codex-shell.css";
import { Bell, Bot, Command, FilePlus2, Files, GitBranch, LibraryBig, MessageSquareText, MoreHorizontal, Search, Settings2, TerminalSquare } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReadingDocument } from "./domain/reading";
import { AgentSidebar, NotesSidebar } from "./features/agent/agent-sidebar";
import { useDocumentThread } from "./features/agent/use-document-thread";
import { extractReadablePages, importDocument } from "./features/library/document-import";
import { ExplorerSidebar, ExtensionsSidebar, LibrarySearch } from "./features/library/library-sidebar";
import { BottomPanel, CommandPalette, EditorGroup } from "./features/workbench/editor-group";
import type { SourceTarget, WorkbenchActivity, WorkbenchPanelTab } from "./features/workbench/model";

export default function Home() {
  const [activity, setActivity] = useState<WorkbenchActivity>("explorer");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [documents, setDocuments] = useState<ReadingDocument[]>([]);
  const [openEditors, setOpenEditors] = useState<ReadingDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [libraryState, setLibraryState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [agentOpen, setAgentOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<WorkbenchPanelTab>("OUTPUT");
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sourceTarget, setSourceTarget] = useState<SourceTarget | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const activeDocument = openEditors.find((document) => document.id === activeDocumentId) ?? null;
  const thread = useDocumentThread(activeDocument);
  const filteredDocuments = useMemo(() => documents.filter((document) => document.title.toLowerCase().includes(query.trim().toLowerCase())), [documents, query]);

  useEffect(() => {
    fetch("/api/documents")
      .then((response) => response.ok ? response.json() as Promise<{ documents?: ReadingDocument[] }> : Promise.reject())
      .then((data) => { setDocuments(data.documents ?? []); setLibraryState("ready"); })
      .catch(() => { setLibraryState("error"); setMessage("资料库暂时不可用。请稍后重试。"); });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen((open) => !open); }
      if (event.key === "Escape") { setCommandOpen(false); setFileMenuOpen(false); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function openDocument(document: ReadingDocument) {
    setMessage("");
    let opened = document;
    if (!document.pages) {
      try {
        setMessage(`正在打开「${document.title}」…`);
        const response = await fetch(`/api/documents/${document.id}`);
        const data = await response.json() as { error?: string; document: ReadingDocument; pages?: { page_number: number; content: string }[] };
        if (!response.ok) throw new Error(data.error ?? "无法打开资料。");
        opened = { ...data.document, pages: (data.pages ?? []).map((page) => ({ pageNumber: page.page_number, content: page.content })) };
        setDocuments((items) => items.map((item) => item.id === opened.id ? opened : item));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "无法打开资料。");
        return;
      }
    }
    setOpenEditors((items) => items.some((item) => item.id === opened.id) ? items : [...items, opened]);
    setActiveDocumentId(opened.id);
    setNavigationOpen(false);
    setMessage("");
  }

  function closeEditor(id: string) {
    const index = openEditors.findIndex((document) => document.id === id);
    const remaining = openEditors.filter((document) => document.id !== id);
    setOpenEditors(remaining);
    if (activeDocumentId === id) setActiveDocumentId(remaining[Math.max(0, index - 1)]?.id ?? null);
  }

  function jumpToSource(page: number) {
    if (!activeDocument || page < 1 || page > activeDocument.page_count) return;
    setSourceTarget((previous) => ({ documentId: activeDocument.id, page, revision: (previous?.revision ?? 0) + 1 }));
  }

  function quoteSource(citation: { page: number; text: string }) {
    if (thread.busy) { setMessage("问题正在保存，请稍后添加引用。"); return; }
    thread.setDraft({ page: String(citation.page), quote: citation.text });
    setAgentOpen(true);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setMessage("当前支持 20 MB 以内的资料。"); return; }
    try {
      setUploading(true);
      setMessage(`正在解析「${file.name}」…`);
      const pages = await extractReadablePages(file);
      const imported = await importDocument(file, pages) as ReadingDocument;
      const document = { ...imported, pages };
      setDocuments((items) => [document, ...items]);
      await openDocument(document);
      setMessage(`已导入「${document.title}」。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败。");
    } finally {
      setUploading(false);
    }
  }

  function selectActivity(next: WorkbenchActivity) {
    setActivity(next);
    setNavigationOpen((open) => activity !== next || !open);
  }

  return <main className="vscode-shell">
    <input ref={uploadRef} className="hidden-upload" type="file" accept="application/pdf,text/plain,text/markdown,.pdf,.txt,.md" onChange={handleUpload} />
    <header className="vscode-menubar">
      <div className="vscode-brand"><span>Lens</span><small>证据驱动的阅读工作台</small></div>
      <nav aria-label="应用菜单"><button type="button" onClick={() => setFileMenuOpen((open) => !open)}>文件</button><button type="button">编辑</button><button type="button">选择</button><button type="button">视图</button><button type="button">转到</button><button type="button">运行</button><button type="button">终端</button><button type="button">帮助</button></nav>
      <button type="button" className="vscode-command-center" onClick={() => setCommandOpen(true)}><Command size={14} /> 搜索 <kbd>Ctrl K</kbd></button>
      <div className="vscode-window-actions"><button type="button" aria-label="通知"><Bell size={15} /></button><button type="button" aria-label="更多"><MoreHorizontal size={16} /></button></div>
      {fileMenuOpen && <div className="vscode-file-menu"><button type="button" onClick={() => { uploadRef.current?.click(); setFileMenuOpen(false); }}><FilePlus2 size={15} /> 导入资料…</button><button type="button" onClick={() => { setActivity("explorer"); setFileMenuOpen(false); }}>打开资源管理器</button></div>}
    </header>
    <section className="vscode-workbench">
      <nav className="vscode-activitybar" aria-label="主侧栏"><div><ActivityButton active={activity === "explorer"} icon={Files} label="资源管理器" onClick={() => selectActivity("explorer")} /><ActivityButton active={activity === "search"} icon={Search} label="搜索" onClick={() => selectActivity("search")} /><ActivityButton active={activity === "notes"} icon={MessageSquareText} label="笔记" onClick={() => selectActivity("notes")} /><ActivityButton active={activity === "extensions"} icon={LibraryBig} label="扩展" onClick={() => selectActivity("extensions")} /></div><div><ActivityButton icon={Settings2} label="管理" onClick={() => undefined} /></div></nav>
      <aside className={`vscode-sidebar ${navigationOpen ? "mobile-open" : ""}`}>{activity === "explorer" ? <ExplorerSidebar documents={documents} openEditors={openEditors} activeId={activeDocumentId} loading={libraryState === "loading"} onImport={() => uploadRef.current?.click()} onOpen={openDocument} onClose={closeEditor} /> : activity === "search" ? <LibrarySearch query={query} onQuery={setQuery} documents={filteredDocuments} onOpen={openDocument} /> : activity === "notes" ? <NotesSidebar thread={thread} document={activeDocument} onJump={jumpToSource} onOpenAgent={() => setAgentOpen(true)} /> : <ExtensionsSidebar />}</aside>
      <section className="vscode-editor-area" aria-label="编辑器组">
        <div className="vscode-editor-tabs">{openEditors.map((document) => <button type="button" key={document.id} className={document.id === activeDocumentId ? "active" : ""} onClick={() => setActiveDocumentId(document.id)}><span>{document.title}{document.mime_type === "application/pdf" ? ".pdf" : ""}</span><i onClick={(event) => { event.stopPropagation(); closeEditor(document.id); }}>×</i></button>)}</div>
        <EditorGroup document={activeDocument} target={sourceTarget?.documentId === activeDocument?.id ? sourceTarget : null} onQuote={quoteSource} onImport={() => uploadRef.current?.click()} />
        {panelOpen && <BottomPanel active={panelTab} onSelect={setPanelTab} onClose={() => setPanelOpen(false)} documents={documents.length} message={uploading ? "正在导入资料…" : message} />}
      </section>
      {agentOpen ? <AgentSidebar document={activeDocument} thread={thread} onJump={jumpToSource} onClose={() => setAgentOpen(false)} /> : <button type="button" className="vscode-reopen-secondary" onClick={() => setAgentOpen(true)}><Bot size={18} /> Agent</button>}
    </section>
    <footer className="vscode-statusbar"><div><span><GitBranch size={12} /> main</span><span>资料库 {libraryState === "ready" ? "已连接" : "连接中"}</span></div><div><button type="button" onClick={() => setPanelOpen((open) => !open)}>{panelOpen ? "收起面板" : "打开面板"}</button><span>{activeDocument ? `${activeDocument.page_count} 页` : "无编辑器"}</span><TerminalSquare size={13} /></div></footer>
    {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)} onImport={() => { uploadRef.current?.click(); setCommandOpen(false); }} onExplorer={() => { setActivity("explorer"); setCommandOpen(false); }} />}
  </main>;
}

function ActivityButton({ active, icon: Icon, label, onClick }: { active?: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  return <button type="button" className={active ? "active" : ""} title={label} aria-label={label} onClick={onClick}><Icon size={21} /></button>;
}
