"use client";

import { FileText, ListTree, Minus, PanelLeft, Plus, Search, StickyNote, X } from "lucide-react";
import type { ReaderNavigation, ReaderView, SearchResult } from "./model";

export function ReaderToolbar({
  title, marking, sidebarOpen, zoom, view, findOpen, findText, results, onExit, onToggleMarking, onToggleSidebar, onZoom, onFit, onViewChange, onToggleFind, onFindChange, onCloseFind, onJump,
}: {
  title: string;
  marking: boolean;
  sidebarOpen: boolean;
  zoom: number;
  view: ReaderView;
  findOpen: boolean;
  findText: string;
  results: SearchResult[];
  onExit: () => void;
  onToggleMarking: () => void;
  onToggleSidebar: () => void;
  onZoom: (delta: number) => void;
  onFit: (kind: "width" | "page") => void;
  onViewChange: (view: ReaderView) => void;
  onToggleFind: () => void;
  onFindChange: (value: string) => void;
  onCloseFind: () => void;
  onJump: (pageNumber: number) => void;
}) {
  return <>
    <header className="office-titlebar"><div className="office-file-name"><FileText size={17} /><strong>{title}</strong><span>· PDF</span></div><button type="button" className="office-exit" onClick={onExit}><X size={16} /> 退出阅读模式</button></header>
    <nav className="office-ribbon" aria-label="阅读工具">
      <div className="office-tabs"><button type="button" className="active">阅读</button><button type="button" onClick={onToggleMarking} className={marking ? "active" : ""}>批注</button><span className="office-find-control"><button type="button" onClick={onToggleFind} className={findOpen ? "active" : ""}>查找</button>{findOpen && <span className="office-find-popover"><Search size={15} /><input value={findText} onChange={(event) => onFindChange(event.target.value)} placeholder="查找" autoFocus /><button type="button" onClick={onCloseFind} aria-label="关闭查找"><X size={14} /></button>{findText.trim() && <span className="office-search-results">{results.length ? results.slice(0, 8).map((result, index) => <button key={`${result.source}-${result.pageNumber}-${index}`} type="button" onClick={() => { onJump(result.pageNumber); onCloseFind(); }}><b>{result.source} · 第 {result.pageNumber} 页</b><span>{result.excerpt}</span></button>) : <p>未找到匹配项</p>}<small>{results.length > 8 ? `显示前 8 条，共 ${results.length} 条` : `${results.length} 条结果`}</small></span>}</span>}</span><button type="button" disabled title="翻译能力将在 AI 层接入">翻译</button></div>
      <div className="office-ribbon-tools"><button type="button" onClick={onToggleSidebar} title={sidebarOpen ? "收起导航" : "显示导航"}><PanelLeft size={17} /></button><span className="office-divider" /><button type="button" onClick={() => onZoom(-0.1)}><Minus size={16} /></button><output>{Math.round(zoom * 100)}%</output><button type="button" onClick={() => onZoom(0.1)}><Plus size={16} /></button><button type="button" onClick={() => onFit("width")}>适合宽度</button><button type="button" onClick={() => onFit("page")}>适合整页</button><span className="office-divider" /><label>视图<select value={view} onChange={(event) => onViewChange(event.target.value as ReaderView)}><option value="single">单页</option><option value="double">双页</option><option value="continuous">连续阅读</option></select></label><button type="button" onClick={onToggleMarking} className={marking ? "marking" : ""}><StickyNote size={16} /> {marking ? "正在批注" : "批注工具"}</button></div>
    </nav>
  </>;
}

export function ReaderSidebar({ navigation, onNavigationChange, children }: { navigation: ReaderNavigation; onNavigationChange: (navigation: ReaderNavigation) => void; children: React.ReactNode }) {
  return <aside className="office-navigation"><div className="office-nav-tabs"><button type="button" className={navigation === "pages" ? "active" : ""} onClick={() => onNavigationChange("pages")}><FileText size={15} /> 页面</button><button type="button" className={navigation === "outline" ? "active" : ""} onClick={() => onNavigationChange("outline")}><ListTree size={15} /> 目录</button><button type="button" className={navigation === "bookmarks" ? "active" : ""} onClick={() => onNavigationChange("bookmarks")}>书签</button><button type="button" className={navigation === "annotations" ? "active" : ""} onClick={() => onNavigationChange("annotations")}><StickyNote size={15} /> 批注</button></div>{children}</aside>;
}
