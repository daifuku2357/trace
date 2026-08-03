"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSetting } from "@/lib/settings";
import { runDemoAnalysis } from "@/lib/demo";

/**
 * デモ投入後、本物の Gemini で日記を順に分析＋分類するバックグラウンドランナー。
 * `demoAnalyze` 設定が立っている間だけ動き、進捗を画面下部に小さく表示する。
 * 30 RPM の間隔制御は runDemoAnalysis 側で行う。二重起動は module 変数で防ぐ。
 */
let started = false;

export default function DemoAnalysisRunner() {
  const active = useSetting("demoAnalyze");

  const progress = useLiveQuery(async () => {
    const [total, done] = await Promise.all([db.entries.count(), db.analyses.count()]);
    return { total, done };
  }, []);

  useEffect(() => {
    if (active !== "1" || started) return;
    started = true;
    void runDemoAnalysis().finally(() => {
      started = false;
    });
  }, [active]);

  if (active !== "1" || !progress || progress.total === 0) return null;

  const { total, done } = progress;
  const pct = Math.min(100, Math.round((done / total) * 100));

  return (
    <div className="fixed bottom-24 left-1/2 z-40 w-[min(92%,44rem)] -translate-x-1/2">
      <div className="rounded-xl border border-ai bg-paper px-4 py-2.5 shadow-lift">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-bold text-ai-ink">Gemini がデモを分析中…</span>
          <span className="num text-ink-3">
            {done} / {total}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper-2">
          <div
            className="h-full rounded-full bg-ai transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-ink-3">
          本物のAI分析です（30 req/分で順に処理）。画面はそのまま使えます。
        </p>
      </div>
    </div>
  );
}
