"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * ヘッダー右のハンバーガーメニュー。
 * 下部タブから外した「集中」「設定」など二次的な導線をここにまとめる。
 */
const LINKS = [
  { href: "/jobhunt", label: "就活の自己分析", mark: "★" },
  { href: "/focus", label: "集中", mark: "◉" },
  { href: "/settings", label: "設定", mark: "⚙" },
] as const;

export default function HeaderMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="メニュー"
        aria-expanded={open}
        className="flex flex-col items-center justify-center gap-[3px] rounded-lg p-2 hover:bg-paper-2 active:scale-95"
      >
        <span className="h-0.5 w-4 rounded bg-ink-2" />
        <span className="h-0.5 w-4 rounded bg-ink-2" />
        <span className="h-0.5 w-4 rounded bg-ink-2" />
      </button>

      {open && (
        <>
          {/* 外側クリックで閉じる透明レイヤー */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <nav className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-rule bg-paper shadow-lift">
            {LINKS.map((l, i) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-paper-2 ${
                  i > 0 ? "border-t border-rule" : ""
                }`}
              >
                <span aria-hidden className="text-base leading-none text-ink-2">
                  {l.mark}
                </span>
                {l.label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
