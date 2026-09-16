import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lens · 个人阅读工作台",
  description: "让论文、书籍与笔记变成可追溯、可提问的个人资料库。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
