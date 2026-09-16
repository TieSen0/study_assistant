"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  Bookmark,
  ChevronDown,
  FileText,
  FolderOpen,
  Highlighter,
  LibraryBig,
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

type ReadingDocument = {
  id: string;
  type: "论文" | "书籍" | "笔记";
  title: string;
  source: string;
  tag: string;
  heading: string;
  paragraphs: string[];
  selected: string;
};

const documents: ReadingDocument[] = [
  {
    id: "retrieval",
    type: "论文",
    title: "Retrieval as a Reading Practice",
    source: "Reading systems · 18 页",
    tag: "正在阅读",
    heading: "1. Reading is not storage",
    paragraphs: [
      "A reading system should lower the cost of returning to evidence, rather than merely increase the amount of notes a reader produces.",
      "The useful unit is not a document-sized summary. It is a claim, the passage that supports it, and the question that caused the reader to care.",
      "When a later question arrives, retrieval should surface the smallest sufficient context and preserve the path back to the original page."
    ],
    selected: "The useful unit is not a document-sized summary. It is a claim, the passage that supports it, and the question that caused the reader to care."
  },
  {
    id: "algorithm",
    type: "书籍",
    title: "算法导论 · 动态规划",
    source: "第 15 章 · 42 分钟前",
    tag: "继续阅读",
    heading: "15.3 最优子结构",
    paragraphs: [
      "动态规划并不是记住更多状态，而是先证明一个最优解能由更小的最优解组成。",
      "若某个子问题的选择会改变后续子问题的定义，就需要谨慎检查是否真的存在最优子结构。",
      "推导状态转移式之前，先写清状态究竟承诺了什么信息。"
    ],
    selected: "推导状态转移式之前，先写清状态究竟承诺了什么信息。"
  },
  {
    id: "methods",
    type: "笔记",
    title: "论文方法论 · 可信证据",
    source: "个人摘录 · 6 个片段",
    tag: "我的笔记",
    heading: "证据与结论之间",
    paragraphs: [
      "结论是否成立，取决于证据是否足以排除更简单的解释。",
      "阅读论文时，先分开记录作者的主张、证据和自己尚未接受的推论。",
      "不确定性不应被抹平；它应成为下一次检索或实验的方向。"
    ],
    selected: "阅读论文时，先分开记录作者的主张、证据和自己尚未接受的推论。"
  }
];

const tools = [
  { id: "explain", label: "解释这段" },
  { id: "argument", label: "拆解论证" },
  { id: "terms", label: "标出术语" },
];

export default function Home() {
  const [activeId, setActiveId] = useState("retrieval");
  const [tool, setTool] = useState("explain");
  const [question, setQuestion] = useState("");
  const [saved, setSaved] = useState(false);
  const [importedName, setImportedName] = useState("");
  const document = useMemo(() => documents.find((item) => item.id === activeId) ?? documents[0], [activeId]);

  const response = useMemo(() => {
    if (question.trim()) {
      return "先回到这段原文：它主张阅读系统的价值，在于降低“回到证据”的成本，而不是制造更多笔记。你可以进一步追问：作者如何证明这种成本会影响理解？";
    }
    if (tool === "argument") {
      return "主张：阅读系统应帮助人返回证据。\n依据：文档级摘要会丢失“为什么关心这段”的提问语境。\n隐含前提：读者之后会带着新问题回到材料。";
    }
    if (tool === "terms") {
      return "retrieval：按问题取回必要上下文。\nsmallest sufficient context：只提供能支撑当前判断的最小证据片段。\nevidence path：从回答回到原文位置的可追溯路径。";
    }
    return "这段在反对“读完就做整篇摘要”。作者认为真正有用的知识单元，是一个可核对的主张、它的原文证据，以及你当时提出的问题。";
  }, [question, tool]);

  return (
    <main className="lens-shell">
      <aside className="lens-rail">
        <div className="lens-logo" aria-label="Lens 阅读工作台"><span>l</span>ens<i>·</i></div>
        <nav aria-label="主导航" className="rail-nav">
          <button className="rail-item active" type="button"><BookOpen size={18} /> 阅读中</button>
          <button className="rail-item" type="button"><LibraryBig size={18} /> 我的资料</button>
          <button className="rail-item" type="button"><Highlighter size={18} /> 片段与标注</button>
          <button className="rail-item" type="button"><Network size={18} /> 关联线索</button>
        </nav>
        <div className="rail-foot"><span className="local-dot" /> 本地资料库</div>
      </aside>

      <section className="lens-main">
        <header className="lens-topbar">
          <div className="crumb"><FolderOpen size={15} /> 个人资料库 <span>/</span> 正在阅读</div>
          <label className="import-button"><Upload size={15} /> 导入资料<input type="file" accept=".pdf,.epub,.txt,.md,image/*" onChange={(event) => setImportedName(event.target.files?.[0]?.name ?? "")} /></label>
        </header>

        <div className="lens-workspace">
          <aside className="library-panel">
            <div className="library-head"><div><p>资料库</p><strong>最近打开</strong></div><button type="button" aria-label="收起资料库"><PanelLeftClose size={17} /></button></div>
            <label className="search-box"><Search size={15} /><input placeholder="检索标题或内容" aria-label="检索资料" /></label>
            <div className="document-list">
              {documents.map((item) => (
                <button type="button" key={item.id} onClick={() => { setActiveId(item.id); setQuestion(""); setSaved(false); }} className={`document-item ${item.id === activeId ? "selected" : ""}`}>
                  <FileText size={16} /><span><small>{item.type}</small><strong>{item.title}</strong><em>{item.source}</em></span>
                </button>
              ))}
              {importedName && <div className="imported-file"><Plus size={14} /><span>{importedName}</span><small>待解析</small></div>}
            </div>
            <button type="button" className="new-collection"><Plus size={16} /> 新建资料夹</button>
          </aside>

          <article className="reader-pane">
            <div className="reader-toolbar"><div><span className="doc-kind">{document.type}</span><span className="doc-source">{document.source}</span></div><div className="reader-actions"><button type="button" aria-label="更多操作"><MoreHorizontal size={18} /></button><button className={saved ? "saved" : ""} type="button" onClick={() => setSaved((value) => !value)}><Bookmark size={15} fill={saved ? "currentColor" : "none"} /> {saved ? "已保存片段" : "保存片段"}</button></div></div>
            <div className="reader-paper">
              <div className="reader-title"><p>{document.tag}</p><h1>{document.title}</h1><div><span>阅读视图</span><i /> <span>第 2 页</span><i /> <span>可追溯原文</span></div></div>
              <section className="reader-body"><h2>{document.heading}</h2>{document.paragraphs.map((paragraph, index) => index === 1 ? <p key={paragraph}><mark>{paragraph}</mark></p> : <p key={paragraph}>{paragraph}</p>)}<blockquote><Quote size={18} /> 这不是摘要卡片。它是一个可以回到原文、继续追问的阅读锚点。</blockquote></section>
              <div className="reader-page">2</div>
            </div>
          </article>

          <aside className="insight-panel">
            <div className="insight-head"><div><p>选中片段</p><strong>用证据回答</strong></div><span className="source-pill">p. 2</span></div>
            <blockquote className="selection-quote">“{document.selected}”</blockquote>
            <div className="tool-row">{tools.map((item) => <button type="button" onClick={() => { setTool(item.id); setQuestion(""); }} className={tool === item.id && !question ? "selected" : ""} key={item.id}>{item.label}</button>)}</div>
            <section className="answer-card"><div className="answer-label"><Sparkles size={14} /> 阅读助手 <span>依据当前片段</span></div><p>{response}</p><button type="button" className="source-link"><Highlighter size={14} /> 定位到原文第 2 页</button></section>
            <div className="ask-box"><MessageCircleQuestion size={17} /><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="围绕这段继续提问…" aria-label="对当前片段提问" /><button type="button" onClick={() => setQuestion((value) => value || "这段论证缺少什么证据？")} aria-label="发送问题"><Send size={15} /></button></div>
            <p className="evidence-note">回答固定附着在本段原文；跨文档检索将作为下一步能力接入。</p>
          </aside>
        </div>
      </section>
    </main>
  );
}
