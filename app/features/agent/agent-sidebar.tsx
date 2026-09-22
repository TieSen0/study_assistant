"use client";

import { Bot, Check, ChevronRight, Copy, FileText, PanelRight, Pencil, RotateCcw, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { MAX_QUESTION, MAX_QUOTE, questionContext, type AgentDocument, type AgentMessage } from "./model";
import type { DocumentThread } from "./use-document-thread";
import "./agent.css";

function SourceLabel({ message }: { message: AgentMessage }) {
  if (message.context_page === null) return <>整篇文档</>;
  return <>第 {message.context_page} 页{message.context_kind === "document" ? " · 旧版记录，待核对" : ""}</>;
}

function QuestionCard({ message, document, thread, onJump }: { message: AgentMessage; document: AgentDocument; thread: DocumentThread; onJump: (page: number) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copyState, setCopyState] = useState("");
  const context = questionContext(document, message);
  async function copy() {
    try { await navigator.clipboard.writeText(JSON.stringify(context, null, 2)); setCopyState("已复制"); }
    catch { setCopyState("复制失败，可选中下方内容复制"); }
  }
  return <article className="agent-question">
    <div className="agent-question-source"><FileText size={13} /><span><SourceLabel message={message} /></span><span>已保存</span></div>
    {message.source_quote && <blockquote>{message.source_quote}</blockquote>}
    <p>{message.content}</p>
    <div className="agent-question-actions">
      {message.context_page !== null && <button type="button" onClick={() => onJump(message.context_page!)}>查看原文 <ChevronRight size={13} /></button>}
      {message.role === "user" && <><button type="button" disabled={thread.busy || thread.loading} onClick={() => thread.edit(message)}><Pencil size={12} />编辑</button><button type="button" disabled={thread.busy || thread.loading} onClick={() => setConfirmDelete(true)}><Trash2 size={12} />删除</button></>}
    </div>
    {confirmDelete && <div className="agent-delete-confirm"><span>删除这条问题？</span><button type="button" disabled={thread.busy} onClick={async () => { await thread.remove(message.id); setConfirmDelete(false); }}>确认删除</button><button type="button" disabled={thread.busy} onClick={() => setConfirmDelete(false)}>取消</button></div>}
    <details className="agent-debug"><summary>引用内容 · Debug</summary><p>摘录由你提供；页面文字来自导入时提取，尚未发送给模型。</p><button type="button" onClick={copy}>{copyState === "已复制" ? <Check size={12} /> : <Copy size={12} />}{copyState || "复制问题与上下文"}</button><pre>{JSON.stringify(context, null, 2)}</pre></details>
  </article>;
}

export function AgentSidebar({ document, thread, onJump, onClose }: { document: AgentDocument | null; thread: DocumentThread; onJump: (page: number) => void; onClose: () => void }) {
  const draft = thread.currentDraft;
  const disabled = !document || thread.busy;
  return <aside className="vscode-secondary" aria-label="文档问题">
    <header className="vscode-sidebar-title"><strong>LENS AGENT</strong><button type="button" onClick={onClose} aria-label="关闭次级侧栏"><PanelRight size={16} /></button></header>
    <div className="vscode-agent-context"><Bot size={19} /><div><b>{document?.title ?? "未选择文件"}</b><small>{document ? `${document.page_count} 页 · ${thread.messages.length} 条问题` : "打开资料后记录问题"}</small></div></div>
    <section className="vscode-agent-thread" aria-label="已保存的问题" aria-busy={thread.loading}>
      {thread.loading && <p role="status">正在读取问题…</p>}
      {thread.loadError && <div className="agent-error" role="alert"><p>{thread.loadError}</p><button type="button" onClick={thread.retry}><RotateCcw size={13} />重新加载</button></div>}
      {!thread.loading && document && thread.messages.map((message) => <QuestionCard key={message.id} message={message} document={document} thread={thread} onJump={onJump} />)}
      {!thread.loading && !thread.loadError && !thread.messages.length && <p>{document ? "遇到不理解的地方，记下问题并附上原文。" : "你的问题和引用会按文档保存在这里。"}</p>}
    </section>
    <form className="vscode-agent-compose" onSubmit={(event) => { event.preventDefault(); void thread.save(); }}>
      <div className="agent-compose-title"><b>{thread.editing ? "编辑问题" : "记录问题"}</b>{thread.editing && <button type="button" disabled={thread.busy} onClick={thread.cancelEdit}>取消编辑</button>}</div>
      <label className="agent-page-field">引用页码<input aria-label="引用页码" type="number" min={1} max={document?.page_count ?? 1} step={1} value={draft.page} onChange={(event) => thread.setDraft({ page: event.target.value })} disabled={disabled} placeholder="可选" /><span>/ {document?.page_count ?? "—"}</span></label>
      <details className="agent-excerpt" open={draft.quote ? true : undefined}><summary>附上摘录{draft.quote ? ` · ${draft.quote.length} 字` : "（可选）"}</summary><textarea aria-label="原文摘录" value={draft.quote} onChange={(event) => thread.setDraft({ quote: event.target.value })} disabled={disabled} maxLength={MAX_QUOTE} placeholder="复制原文后粘贴到这里，并填写 PDF 页序号。" rows={2} /></details>
      <textarea aria-label="问题内容" value={draft.content} onChange={(event) => thread.setDraft({ content: event.target.value })} disabled={disabled} maxLength={MAX_QUESTION} placeholder={document ? "这段内容哪里没理解？" : "先打开一份资料"} rows={3} />
      {thread.error && <p className="agent-error" role="alert">{thread.error}</p>}
      <button className="agent-submit" type="submit" disabled={disabled || !draft.content.trim() || thread.loading || !thread.loaded || !!thread.loadError}>{thread.busy ? "正在保存…" : thread.editing ? "保存修改" : "保存问题"}<Send size={13} /></button>
      <small>模型尚未连接 · 已保存的问题刷新后仍在</small>
    </form>
  </aside>;
}

export function NotesSidebar({ document, thread, onJump, onOpenAgent }: { document: AgentDocument | null; thread: DocumentThread; onJump: (page: number) => void; onOpenAgent: () => void }) {
  return <><header className="vscode-sidebar-title"><strong>NOTES</strong></header><section className="vscode-search-results agent-notes">
    {!document ? <p>先打开一份资料。</p> : thread.loading ? <p>正在读取问题…</p> : thread.loadError ? <button type="button" onClick={thread.retry}>读取失败，点击重试</button> : thread.messages.length ? thread.messages.map((message) => <button type="button" key={message.id} onClick={() => { onOpenAgent(); if (message.context_page !== null) onJump(message.context_page); }}><b><SourceLabel message={message} /></b><span>{message.content}</span></button>) : <p>这篇资料还没有问题。</p>}
  </section></>;
}
