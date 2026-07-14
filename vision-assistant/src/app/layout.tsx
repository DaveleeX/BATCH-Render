import type { Metadata, Viewport } from "next";
import { Noto_Sans_SC, Syne } from "next/font/google";
import "./globals.css";

const display = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const sans = Noto_Sans_SC({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

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
  themeColor: "#0b1210",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${display.variable} ${sans.variable} h-full`}>
      <body className="min-h-full bg-[#0b1210] font-[family-name:var(--font-sans)] text-[#f3f7f4] antialiased">
        {children}
      </body>
    </html>
  );
}
