import type { Metadata, Viewport } from "next";
import "./globals.css";
import TabBar from "@/components/TabBar";
import HeaderMenu from "@/components/HeaderMenu";
import AnalysisQueueRunner from "@/components/AnalysisQueueRunner";
import CelebrationHost from "@/components/CelebrationHost";
import Onboarding from "@/components/Onboarding";
import DemoAnalysisRunner from "@/components/DemoAnalysisRunner";

export const metadata: Metadata = {
  title: "Trace",
  description: "日記の継続を通じて、感情・行動・目標の推移を可視化する。",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Trace", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#FAF9F6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh">
        {/* 起動直後に入力へ到達できるよう、ヘッダーは1行に抑える。 */}
        <header className="rule-b sticky top-0 z-10 bg-paper">
          <div className="mx-auto flex max-w-app items-center justify-between px-4 py-2">
            <span className="text-[15px] font-bold tracking-[0.2em]">TRACE</span>
            <HeaderMenu />
          </div>
        </header>

        <main className="mx-auto max-w-app px-4 pb-28 pt-4">{children}</main>

        <TabBar />
        <AnalysisQueueRunner />
        <CelebrationHost />
        <Onboarding />
        <DemoAnalysisRunner />
      </body>
    </html>
  );
}
