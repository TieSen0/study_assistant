"use client";

import { useState } from "react";
import { Activity, ArrowRight, BookOpen, BrainCircuit, Check, ChevronDown, CircleHelp, Clock3, Command, Flame, Grid2X2, Layers3, LineChart, LockKeyhole, Network, Play, Sparkles, Target } from "lucide-react";

const modules = [
  { icon: Grid2X2, label: "概览", active: true },
  { icon: BrainCircuit, label: "诊断练习" },
  { icon: Network, label: "知识图谱" },
  { icon: BookOpen, label: "错题与笔记" },
  { icon: LineChart, label: "学习报告" },
];
const roadmap = [
  { label: "数据结构", value: 82, color: "var(--sky)" },
  { label: "计算机组成", value: 57, color: "var(--amber)" },
  { label: "操作系统", value: 63, color: "var(--violet)" },
  { label: "计算机网络", value: 71, color: "var(--mint)" },
];

export default function Home() {
  const [choice, setChoice] = useState<string | null>(null);
  const [diagnosed, setDiagnosed] = useState(false);
  function diagnose(answer: string) { setChoice(answer); setDiagnosed(true); }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand-mark" aria-label="408 Lens"><span>4</span><i>0</i><b>8</b></div>
      <nav aria-label="主导航">{modules.map(({ icon: Icon, label, active }) => <button className={`nav-item ${active ? "active" : ""}`} key={label} type="button"><Icon size={19} strokeWidth={active ? 2.4 : 1.8} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="sync-state"><span /> 本地学习库</div><button className="profile" type="button"><span>Y</span><strong>Yuki</strong><ChevronDown size={15} /></button></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div className="crumb"><span>11408</span><ArrowRight size={14} /><strong>学习驾驶舱</strong></div><div className="top-actions"><button className="icon-button" aria-label="帮助" type="button"><CircleHelp size={18} /></button><button className="new-session" type="button"><Sparkles size={16} /> 开始诊断</button></div></header>
      <div className="content">
        <section className="welcome-row"><div><p className="eyebrow"><span className="pulse" /> MONDAY · SEP 14</p><h1>让每一次卡住，都变成<br /><em>下一步的线索。</em></h1></div><div className="streak-card"><div className="flame"><Flame size={20} fill="currentColor" /></div><div><strong>12 天</strong><span>连续学习</span></div><div className="streak-bars">{[1,2,3,4,5,6,7].map(day => <i key={day} className={day === 6 ? "today" : ""} />)}</div></div></section>
        <section className="stats-grid" aria-label="学习概况">
          <article className="metric-card dark-card"><div className="metric-head"><span>本周专注</span><Clock3 size={17} /></div><div className="metric-value">12<span>h</span> 40<span>m</span></div><div className="metric-foot"><span className="up">↑ 18%</span> 比上周多 1h 56m</div><div className="focus-bars">{[28,42,33,57,45,72,64,82,39,60,76,46].map((height, i) => <i key={i} style={{ height: `${height}%` }} />)}</div></article>
          <article className="metric-card mastery-card"><div className="metric-head"><span>整体掌握度</span><Target size={17} /></div><div className="mastery-main"><div className="ring"><strong>68</strong><small>%</small></div><p>距离你的<br /><b>75%</b> 目标还差 <b>7%</b></p></div><div className="skill-strip"><span>薄弱区</span><b>计组 · OS</b></div></article>
          <article className="metric-card review-card"><div className="metric-head"><span>待复习</span><Layers3 size={17} /></div><div className="review-number">18 <small>个知识点</small></div><p>今天优先处理 3 个<br />高遗忘风险节点</p><button type="button">查看队列 <ArrowRight size={14} /></button></article>
        </section>
        <section className="two-column">
          <article className="panel diagnostic-panel"><div className="panel-head"><div><p className="eyebrow">ACTIVE DIAGNOSIS</p><h2>今日诊断练习</h2></div><span className="step-pill">01 / 03</span></div><div className="topic-line"><span>操作系统</span><i /> <b>进程同步</b><i /> <strong>信号量</strong></div><h3>若信号量 S 的初值为 3，当前值为 −2，以下判断正确的是？</h3><div className="answers">{[["A", "有 2 个进程正在等待该资源"],["B", "有 3 个进程正在等待该资源"],["C", "有 2 个进程正在使用该资源"],["D", "有 5 个进程正在使用该资源"]].map(([key, text]) => <button key={key} onClick={() => diagnose(key)} type="button" className={`${choice === key ? "selected" : ""} ${diagnosed && key === "A" ? "correct" : ""}`}><span>{key}</span>{text}{diagnosed && key === "A" && <Check size={17} />}</button>)}</div>{!diagnosed ? <p className="hint"><Command size={14} /> 选择答案后，系统会判断你的错因并安排下一步。</p> : <div className={`diagnosis ${choice === "A" ? "success" : ""}`}><div className="diagnosis-icon">{choice === "A" ? <Check size={18} /> : <Activity size={18} />}</div><div><strong>{choice === "A" ? "判断正确：你理解了等待队列的含义。" : "发现关键误区：把资源数量与等待数量混在了一起。"}</strong><p>当 S &lt; 0 时，|S| 表示等待该资源的进程数。下一题将验证你对 P/V 操作的理解。</p></div><button type="button" aria-label="继续"><ArrowRight size={18} /></button></div>}</article>
          <article className="panel graph-panel"><div className="panel-head"><div><p className="eyebrow">KNOWLEDGE MAP</p><h2>你的 OS 知识网络</h2></div><button className="text-button" type="button">打开图谱 <ArrowRight size={15} /></button></div><div className="constellation" aria-label="操作系统知识点关系图"><div className="line line-one" /><div className="line line-two" /><div className="line line-three" /><div className="line line-four" /><div className="node core"><span>进程同步</span><small>63%</small></div><div className="node node-one"><span>信号量</span><small>已练习</small></div><div className="node node-two"><span>死锁</span><small>待复习</small></div><div className="node node-three"><span>管程</span><small>新知识</small></div><div className="node node-four"><span>P / V 操作</span><small>薄弱</small></div></div><div className="graph-legend"><span><i className="dot-violet" /> 已掌握</span><span><i className="dot-amber" /> 建议加强</span><span><i className="dot-mist" /> 未覆盖</span></div></article>
        </section>
        <section className="lower-grid"><article className="panel roadmap-panel"><div className="panel-head"><div><p className="eyebrow">LEARNING MODEL</p><h2>四科掌握度</h2></div><button className="period" type="button">近 30 天 <ChevronDown size={14} /></button></div><div className="roadmap-list">{roadmap.map(item => <div className="roadmap-row" key={item.label}><span>{item.label}</span><div className="bar"><i style={{ width: `${item.value}%`, background: item.color }} /></div><b>{item.value}%</b></div>)}</div></article><article className="panel next-panel"><div className="panel-head"><div><p className="eyebrow">RECOMMENDED NEXT</p><h2>接下来 25 分钟</h2></div><span className="ai-tag"><Sparkles size={13} /> 自适应推荐</span></div><div className="next-content"><div className="next-icon"><LockKeyhole size={22} /></div><div><strong>死锁安全性判断</strong><p>基于今天的同步练习，为你补齐资源分配图这一步。</p><span><Clock3 size={14} /> 25 分钟 · 6 题</span></div><button className="play" type="button" onClick={() => setDiagnosed(false)}><Play size={16} fill="currentColor" /></button></div></article></section>
      </div>
    </section>
  </main>;
}
