"use client";

import "./codex-shell.css";
import { Bell, BookOpenText, Bot, ChevronDown, ChevronRight, Command, FilePlus2, Files, Folder, FolderOpen, GitBranch, LayoutPanelLeft, LibraryBig, MessageSquareText, MoreHorizontal, PanelRight, Search, Send, Settings2, Sparkles, TerminalSquare, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Activity = "资料" | "检索" | "阅读" | "笔记";
type Tab = { id: string; label: string; view: "welcome" | "reader" | "notes" };

const activityItems: { label: Activity; icon: typeof Files }[] = [{ icon: Files, label: "资料" }, { icon: Search, label: "检索" }, { icon: BookOpenText, label: "阅读" }, { icon: MessageSquareText, label: "笔记" }];
const sourceText = "A useful reading system keeps the reader close to evidence. The point is not to generate more notes, but to make a claim, its source, and the question that prompted it easy to revisit.";

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
  const searchRef = useRef<HTMLInputElement>(null);
  const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

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

  function closeTab(id: string) {
    if (tabs.length === 1) return;
    const index = tabs.findIndex((tab) => tab.id === id);
    const remaining = tabs.filter((tab) => tab.id !== id);
    setTabs(remaining);
    if (activeTab === id) setActiveTab(remaining[Math.max(0, index - 1)].id);
  }

  function selectActivity(next: Activity) {
    setActivity(next);
    if (next === "阅读") openTab("reader", "示例资料.pdf");
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
    if (activity === "检索") return <div className="explorer-search"><label><Search size={15} /><input ref={searchRef} placeholder="搜索资料和笔记" /></label><p>输入后将从资料、笔记与批注中检索。</p><button type="button" onClick={() => openTab("reader", "示例资料.pdf")}><BookOpenText size={15} /> 示例资料.pdf</button></div>;
    if (activity === "阅读") return <div className="explorer-list"><p>最近阅读</p><button type="button" className="explorer-file selected" onClick={() => openTab("reader", "示例资料.pdf")}><BookOpenText size={16} /><span>示例资料.pdf<small>阅读原型 · 1 页</small></span></button></div>;
    if (activity === "笔记") return <div className="explorer-list"><p>工作笔记</p><button type="button" className="explorer-file" onClick={() => openTab("notes", "未整理笔记")}><MessageSquareText size={16} /><span>未整理笔记<small>0 条内容</small></span></button></div>;
    return <><button type="button" className="codex-workspace-name" onClick={() => setLibraryOpen((open) => !open)}>{libraryOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<strong>我的工作区</strong></button>{libraryOpen && <div className="codex-tree" aria-label="资料树"><button type="button" className="codex-tree-row open" onClick={() => openTab("reader", "示例资料.pdf")}><ChevronDown size={14} /><FolderOpen size={16} /><span>资料库</span></button><button type="button" className="codex-tree-row indent" onClick={() => openTab("reader", "示例资料.pdf")}><ChevronRight size={14} /><Folder size={16} /><span>论文</span></button><button type="button" className="codex-tree-row indent" onClick={() => openTab("reader", "示例资料.pdf")}><ChevronRight size={14} /><Folder size={16} /><span>书籍</span></button><button type="button" className="codex-tree-row indent" onClick={() => openTab("reader", "示例资料.pdf")}><ChevronRight size={14} /><Folder size={16} /><span>课程</span></button><button type="button" className="codex-tree-row"><ChevronRight size={14} /><LibraryBig size={16} /><span>知识库</span></button><button type="button" className="codex-tree-row" onClick={() => openTab("notes", "未整理笔记")}><ChevronRight size={14} /><MessageSquareText size={16} /><span>对话与笔记</span></button></div>}</>;
  }, [activity, libraryOpen, tabs]);

  return <main className="codex-shell">
    <header className="codex-titlebar"><div className="codex-brand"><span className="codex-brand-mark">L</span><strong>Lens</strong><span className="codex-brand-divider" /><span>个人知识工作台</span></div><button type="button" className="codex-command" onClick={() => setCommandOpen(true)} aria-label="命令面板"><Command size={14} /><span>搜索、打开或执行命令</span><kbd>Ctrl K</kbd></button><div className="codex-title-actions"><button type="button" aria-label="通知"><Bell size={16} /></button><button type="button" aria-label="更多"><MoreHorizontal size={17} /></button></div></header>
    <section className="codex-workbench">
      <nav className="codex-activitybar" aria-label="工作台导航"><div>{activityItems.map(({ icon: Icon, label }) => <button type="button" key={label} className={activity === label ? "active" : ""} title={label} aria-label={label} onClick={() => selectActivity(label)}><Icon size={21} /></button>)}</div><div><button type="button" title="设置" aria-label="设置"><Settings2 size={20} /></button><button type="button" title="账户" aria-label="账户"><span className="codex-avatar">TS</span></button></div></nav>
      <aside className="codex-explorer"><div className="codex-panel-title"><span>{activity === "资料" ? "资源管理器" : activity}</span><button type="button" aria-label="新建资料" onClick={() => openTab("welcome", "新建资料")}><FilePlus2 size={16} /></button><button type="button" aria-label="更多资源操作"><MoreHorizontal size={16} /></button></div>{explorerBody}<div className="codex-explorer-footer"><span className="codex-dot" /> 本地交互原型</div></aside>
      <section className="codex-editor" aria-label="主工作区"><div className="codex-tabs">{tabs.map((tab) => <div className={`codex-tab ${tab.id === activeTab ? "active" : ""}`} key={tab.id} onClick={() => setActiveTab(tab.id)}><LayoutPanelLeft size={15} /><span>{tab.label}</span>{tabs.length > 1 && <button type="button" onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }} aria-label={`关闭 ${tab.label}`}><X size={13} /></button>}</div>)}<button type="button" className="codex-new-tab" onClick={() => openTab("welcome", "新建标签")} aria-label="新建标签">+</button></div><div className="codex-breadcrumb"><span>工作区</span><ChevronRight size={13} /><span>{currentTab.label}</span></div>{currentTab.view === "reader" ? <ReaderPrototype selectedEvidence={selectedEvidence} onSelectEvidence={() => setSelectedEvidence((selected) => !selected)} /> : currentTab.view === "notes" ? <NotesPrototype onReturn={() => openTab("welcome", "欢迎使用 Lens")} /> : <Welcome onOpenReader={() => openTab("reader", "示例资料.pdf")} onOpenNotes={() => openTab("notes", "未整理笔记")} />}</section>
      {agentOpen ? <aside className="codex-agent" aria-label="Lens Agent"><header className="codex-agent-heading"><div><span className="codex-agent-mark"><Bot size={17} /></span><div><strong>Lens Agent</strong><small><i /> {selectedEvidence ? "已获得选区" : "等待上下文"}</small></div></div><button type="button" onClick={() => setAgentOpen(false)} aria-label="收起 Agent"><PanelRight size={17} /></button></header><div className="codex-agent-session"><span>当前会话</span><strong>{selectedEvidence ? "示例资料.pdf · 选区" : "新建阅读会话"}</strong><small>{selectedEvidence ? "1 段本地证据" : "尚未选择资料"}</small></div><div className="codex-agent-thread">{messages.length ? messages.map((message, index) => <article key={`${message}-${index}`}><p>{message}</p><small>本地草稿 · 未调用模型</small></article>) : <div className="codex-agent-empty"><div><Bot size={23} /></div><h2>从原文开始</h2><p>选择一篇资料或其中的一个区域后，Agent 才会获得明确的上下文。</p><ul><li>原文证据</li><li>页内上下文</li><li>你的批注与问题</li></ul></div>}</div><form className="codex-agent-compose" onSubmit={sendMessage}><textarea rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!selectedEvidence} placeholder={selectedEvidence ? "围绕已选原文写下问题…" : "先选择一份资料或原文区域…"} aria-label="向 Lens Agent 提问" /><button type="submit" disabled={!selectedEvidence || !draft.trim()}><span>保存问题</span><Send size={13} /></button><small>仅本地交互，不会调用模型</small></form></aside> : <button type="button" className="agent-reopen" onClick={() => setAgentOpen(true)}><Bot size={18} /> Agent</button>}
    </section>
    {commandOpen && <div className="command-layer" role="dialog" aria-modal="true" aria-label="命令面板" onMouseDown={() => setCommandOpen(false)}><section className="command-palette" onMouseDown={(event) => event.stopPropagation()}><header><Search size={16} /><input autoFocus placeholder="输入一个命令…" /><kbd>Esc</kbd></header><div><p>常用</p><button type="button" onClick={() => { openTab("reader", "示例资料.pdf"); setCommandOpen(false); }}><BookOpenText size={16} /> 打开示例阅读器</button><button type="button" onClick={() => { openTab("notes", "未整理笔记"); setCommandOpen(false); }}><MessageSquareText size={16} /> 打开笔记面板</button><button type="button" onClick={() => { setActivity("检索"); setCommandOpen(false); window.setTimeout(() => searchRef.current?.focus(), 0); }}><Search size={16} /> 聚焦全局检索</button></div></section></div>}
    <footer className="codex-statusbar"><div><span><GitBranch size={13} /> main</span><span>·</span><span>本地交互原型</span></div><div><span>{tabs.length} 个标签</span><span>{selectedEvidence ? "已选择证据" : "无选区"}</span><TerminalSquare size={14} /></div></footer>
  </main>;
}

function Welcome({ onOpenReader, onOpenNotes }: { onOpenReader: () => void; onOpenNotes: () => void }) { return <div className="codex-editor-empty"><div className="codex-empty-logo"><Sparkles size={25} /></div><h1>从一个干净的工作区开始</h1><p>这是可交互的前端原型。先确认布局和操作方式，再接真实资料、阅读器和模型。</p><div className="codex-empty-actions"><button type="button" onClick={onOpenReader}><BookOpenText size={16} /> 打开阅读原型</button><button type="button" onClick={onOpenNotes}><MessageSquareText size={16} /> 打开笔记原型</button></div><span className="codex-shortcut"><Command size={14} /> 命令面板 · Ctrl K</span></div>; }
function ReaderPrototype({ selectedEvidence, onSelectEvidence }: { selectedEvidence: boolean; onSelectEvidence: () => void }) { return <article className="reader-prototype"><header><div><span>PDF · 原型资料</span><strong>How to keep reading close to evidence</strong></div><small>1 / 1</small></header><section><p>INTRODUCTION</p><h1>Reading is a path back to evidence.</h1><button type="button" className={selectedEvidence ? "evidence-selected" : ""} onClick={onSelectEvidence}>{sourceText}</button><small>{selectedEvidence ? "已选中：Agent 现在可以使用这段本地证据。" : "点击这段文字，模拟选择原文区域。"}</small></section></article>; }
function NotesPrototype({ onReturn }: { onReturn: () => void }) { return <div className="notes-prototype"><MessageSquareText size={28} /><h1>还没有笔记</h1><p>笔记、批注和 Agent 的结果将会在这里汇合。</p><button type="button" onClick={onReturn}>回到欢迎页</button></div>; }
