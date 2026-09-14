import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "研 Lens · 考研全科智能诊断",
  description: "政治、英语一、数学一与 11408 的智能学习诊断演示。",
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
