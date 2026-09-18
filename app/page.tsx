"use client";

import "./codex-shell.css";
import { Bell, BookOpenText, Bot, ChevronDown, ChevronRight, Command, FilePlus2, Files, Folder, FolderOpen, GitBranch, LayoutPanelLeft, LibraryBig, MessageSquareText, MoreHorizontal, PanelRight, Search, Settings2, Sparkles, TerminalSquare } from "lucide-react";

const activityItems = [
  { icon: Files, label: "资料" },
  { icon: Search, label: "检索" },
  { icon: BookOpenText, label: "阅读" },
  { icon: MessageSquareText, label: "笔记" },
];

export default function Home() {
  return <main className="codex-shell">
    <header className="codex-titlebar">
      <div className="codex-brand"><span className="codex-brand-mark">L</span><strong>Lens</strong><span className="codex-brand-divider" /> <span>个人知识工作台</span></div>
      <button type="button" className="codex-command" aria-label="命令面板"><Command size={14} /><span>搜索、打开或执行命令</span><kbd>Ctrl K</kbd></button>
      <div className="codex-title-actions"><button type="button" aria-label="通知"><Bell size={16} /></button><button type="button" aria-label="更多"><MoreHorizontal size={17} /></button></div>
    </header>

    <section className="codex-workbench">
      <nav className="codex-activitybar" aria-label="工作台导航">
        <div>{activityItems.map(({ icon: Icon, label }, index) => <button type="button" key={label} className={index === 0 ? "active" : ""} title={label} aria-label={label}><Icon size={21} /></button>)}</div>
        <div><button type="button" title="设置" aria-label="设置"><Settings2 size={20} /></button><button type="button" title="账户" aria-label="账户"><span className="codex-avatar">TS</span></button></div>
      </nav>

      <aside className="codex-explorer">
        <div className="codex-panel-title"><span>资源管理器</span><button type="button" aria-label="新建资料"><FilePlus2 size={16} /></button><button type="button" aria-label="更多资源操作"><MoreHorizontal size={16} /></button></div>
        <button type="button" className="codex-workspace-name"><ChevronDown size={15} /><strong>我的工作区</strong></button>
        <div className="codex-tree" aria-label="资料树">
          <button type="button" className="codex-tree-row open"><ChevronDown size={14} /><FolderOpen size={16} /><span>资料库</span></button>
          <button type="button" className="codex-tree-row indent"><ChevronRight size={14} /><Folder size={16} /><span>论文</span></button>
          <button type="button" className="codex-tree-row indent"><ChevronRight size={14} /><Folder size={16} /><span>书籍</span></button>
          <button type="button" className="codex-tree-row indent"><ChevronRight size={14} /><Folder size={16} /><span>课程</span></button>
          <button type="button" className="codex-tree-row"><ChevronRight size={14} /><LibraryBig size={16} /><span>知识库</span></button>
          <button type="button" className="codex-tree-row"><ChevronRight size={14} /><MessageSquareText size={16} /><span>对话与笔记</span></button>
        </div>
        <div className="codex-explorer-footer"><span className="codex-dot" /> 本地工作区</div>
      </aside>

      <section className="codex-editor" aria-label="主工作区">
        <div className="codex-tabs"><div className="codex-tab active"><LayoutPanelLeft size={15} /><span>欢迎使用 Lens</span><button type="button" aria-label="关闭标签"><span>×</span></button></div><button type="button" className="codex-new-tab" aria-label="新建标签">+</button></div>
        <div className="codex-breadcrumb"><span>工作区</span><ChevronRight size={13} /><span>开始</span></div>
        <div className="codex-editor-empty">
          <div className="codex-empty-logo"><Sparkles size={25} /></div>
          <h1>从一个干净的工作区开始</h1>
          <p>这里以后放原文、阅读进度和可追溯的知识结果。现在先把工作台本身定好。</p>
          <div className="codex-empty-actions"><button type="button"><Files size={16} /> 导入资料 <small>尚未接入</small></button><button type="button"><BookOpenText size={16} /> 打开阅读器 <small>尚未接入</small></button></div>
          <span className="codex-shortcut"><Command size={14} /> 命令面板 · Ctrl K</span>
        </div>
      </section>

      <aside className="codex-agent" aria-label="Lens Agent">
        <header className="codex-agent-heading"><div><span className="codex-agent-mark"><Bot size={17} /></span><div><strong>Lens Agent</strong><small><i /> 等待上下文</small></div></div><button type="button" aria-label="收起 Agent"><PanelRight size={17} /></button></header>
        <div className="codex-agent-session"><span>当前会话</span><strong>新建阅读会话</strong><small>尚未选择资料</small></div>
        <div className="codex-agent-empty"><div><Bot size={23} /></div><h2>从原文开始</h2><p>选择一篇资料或其中的一个区域后，Agent 才会获得明确的上下文。</p><ul><li>原文证据</li><li>页内上下文</li><li>你的批注与问题</li></ul></div>
        <form className="codex-agent-compose"><textarea rows={3} disabled placeholder="先选择一份资料…" aria-label="向 Lens Agent 提问" /><button type="button" disabled><span>发送</span><span>↵</span></button><small>未接入模型 · 不会发送任何内容</small></form>
      </aside>
    </section>

    <footer className="codex-statusbar"><div><span><GitBranch size={13} /> main</span><span>·</span><span>工作区外壳</span></div><div><span>无文件打开</span><span>UTF-8</span><span>Ln 1, Col 1</span><TerminalSquare size={14} /></div></footer>
  </main>;
}
