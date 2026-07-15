import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "览界 · 视觉语音助手 Demo",
  description:
    "手机摄像头 + 实时对话。为智能眼镜场景验证：识物、识人、高德附近推荐。",
  applicationName: "览界",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0e0f0c",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="lanjie-body min-h-full bg-[var(--ink)] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
