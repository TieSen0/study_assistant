"use client";

import { Command, FilePlus2, FileText, Files, X } from "lucide-react";
import type { ReadingDocument } from "../../domain/reading";
import { WorkbenchPdf } from "../reader/workbench-pdf";
import type { SourceTarget, WorkbenchPanelTab } from "./model";
import "./editor-group.css";

export function EditorGroup({ document, target, onQuote, onImport }: { document: ReadingDocument | null; target: SourceTarget | null; onQuote: (citation: { page: number; text: string }) => void; onImport: () => void }) {
  if (!document) return <WelcomeEditor onImport={onImport} />;
  if (document.mime_type === "application/pdf") return <div className="vscode-pdf-editor"><header><span><FileText size={15} /> {document.title}.pdf</span><small>原始 PDF · 连续阅读</small></header><WorkbenchPdf key={document.id} documentId={document.id} initialPage={document.last_page ?? 1} target={target} onQuote={onQuote} /></div>;
  return <article className="vscode-text-editor"><header><FileText size={15} /> {document.title}</header><pre>{document.pages?.[0]?.content || "这份资料没有可读取的文字层。"}</pre></article>;
}

export function WelcomeEditor({ onImport }: { onImport?: () => void }) {
  return <div className="vscode-welcome"><span className="vscode-welcome-mark">L</span><h1>Lens</h1><p>以原文为证据的 Agent 阅读工作台。</p><button type="button" onClick={onImport}><FilePlus2 size={16} /> 导入一份资料</button><small>导入后会作为一个文件出现在资源管理器，并在编辑器标签中打开。</small></div>;
}

export function BottomPanel({ active, onSelect, onClose, documents, message }: { active: WorkbenchPanelTab; onSelect: (tab: WorkbenchPanelTab) => void; onClose: () => void; documents: number; message: string }) {
  return <section className="vscode-bottom-panel"><header>{(["PROBLEMS", "OUTPUT", "TERMINAL"] as WorkbenchPanelTab[]).map((tab) => <button type="button" key={tab} className={tab === active ? "active" : ""} onClick={() => onSelect(tab)}>{tab}</button>)}<i /><button type="button" onClick={onClose} aria-label="关闭面板"><X size={15} /></button></header><div>{active === "PROBLEMS" ? <p>0 problems</p> : active === "OUTPUT" ? <p>{message || `资料库中有 ${documents} 份资料。`}</p> : <p>终端尚未接入。这里将用于显示本地解析、OCR 与索引任务。</p>}</div></section>;
}

export function CommandPalette({ onClose, onImport, onExplorer }: { onClose: () => void; onImport: () => void; onExplorer: () => void }) {
  return <div className="vscode-command-layer" onMouseDown={onClose}><section onMouseDown={(event) => event.stopPropagation()}><header><Command size={16} /><input autoFocus placeholder="输入命令" /><kbd>Esc</kbd></header><button type="button" onClick={onImport}><FilePlus2 size={16} /> Lens: 导入资料</button><button type="button" onClick={onExplorer}><Files size={16} /> View: Show Explorer</button></section></div>;
}
