"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 画面移動はタブのみ（仕様書 §2 導線）。
 * アイコンには必ずラベルを併記する規定のため、記号 + テキストの2要素で構成する。
 */
// 下部タブは4つに集約。集中は今日タブ内のCTAとヘッダーメニューから、
// 分析は記録タブ内の切替から、設定はヘッダーのハンバーガーから開く。
const TABS = [
  { href: "/", label: "今日", mark: "▤" },
  { href: "/plan", label: "組立", mark: "▥" },
  { href: "/goals", label: "目標", mark: "▸" },
  { href: "/record", label: "記録", mark: "▦" },
] as const;

export default function TabBar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname.startsWith("/entry");
    // 記録タブは分析（/insights）も含めてアクティブにする。
    if (href === "/record") return pathname.startsWith("/record") || pathname.startsWith("/insights");
    return pathname.startsWith(href);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-rule bg-paper" aria-label="メイン">
      <ul className="mx-auto flex max-w-app">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex flex-col items-center gap-0.5 border-t-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-[11px]",
                  active
                    ? "border-ai font-bold text-ai"
                    : "border-transparent text-ink-2 hover:bg-ai-weak",
                ].join(" ")}
              >
                <span aria-hidden className="text-base leading-none">
                  {tab.mark}
                </span>
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
