"use client";

import { Bot, ChevronRight, FileText, PanelRightClose, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import type { ReaderSelection } from "./model";

export function ReaderAgentPanel({ selection, onAsk, onCollapse }: { selection: ReaderSelection | null; onAsk: (pageNumber: number, anchor: ReaderSelection["anchor"], question: string) => void; onCollapse: () => void }) {
  const [draft, setDraft] = useState("");
  const [queued, setQueued] = useState<string[]>([]);
  const canAsk = Boolean(selection && draft.trim());
  function queueQuestion(question = draft) {
    if (!selection || !question.trim()) return;
    const clean = question.trim();
    onAsk(selection.pageNumber, selection.anchor, clean);
    setQueued((items) => [...items, clean]);
    setDraft("");
  }
  return <aside className="reader-agent"><header className="reader-agent-heading"><div><span className="reader-agent-icon"><Bot size={17} /></span><div><strong>阅读 Agent</strong><small><i /> 上下文待命</small></div></div><button type="button" onClick={onCollapse} aria-label="收起 Agent"><PanelRightClose size={17} /></button></header><section className="reader-agent-context"><span>当前证据</span>{selection ? <div className="reader-context-selected"><FileText size={15} /><p><b>第 {selection.pageNumber} 页 · 已选区域</b><small>这一区域会和页内文本一起进入上下文。</small></p></div> : <p className="reader-context-empty">选择文字、公式、图表或区域后，Agent 才会带着原文证据工作。</p>}</section><section className="reader-agent-actions"><span>对选区</span><div><button type="button" disabled={!selection} onClick={() => setDraft("请解释这个选区的核心含义，并结合本文上下文说明。")}><Sparkles size={14} /> 解释</button><button type="button" disabled={!selection} onClick={() => setDraft("请翻译这个选区，并保留关键术语。")}>翻译</button><button type="button" disabled={!selection} onClick={() => setDraft("请提炼这个选区中的定义、前提和结论。")}>提炼定义</button><button type="button" disabled={!selection} onClick={() => setDraft("请分析这个图表或区域表达的结论。")}>分析图表</button></div></section><section className="reader-agent-thread"><div className="reader-thread-label"><span>对话</span><small>{queued.length ? `${queued.length} 条待处理` : "尚未提问"}</small></div>{queued.length ? queued.map((question, index) => <article key={`${question}-${index}`}><p>{question}</p><small>已保存为“询问”标记 · 等待模型服务</small></article>) : <div className="reader-thread-empty"><ChevronRight size={17} /><p>这里是 Agent 的工作区，不会伪造回答。接入模型后，它只会拿到当前选区、页内上下文和必要的文档证据。</p></div>}</section><form className="reader-agent-compose" onSubmit={(event) => { event.preventDefault(); queueQuestion(); }}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={selection ? "针对已选原文提问…" : "先在中间原文选择一个区域"} disabled={!selection} rows={3} /><button type="submit" disabled={!canAsk}><Send size={15} /> 发送</button></form></aside>;
}
