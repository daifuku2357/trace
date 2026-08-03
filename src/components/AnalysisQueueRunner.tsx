"use client";

import { useEffect } from "react";
import { drainQueue } from "@/lib/analysis";

/**
 * 未送信の分析ジョブを、起動時とオンライン復帰時に流す。
 * 表示は持たない（オフラインでも日記の入力・保存は完全に動くため、UI を出す必要がない）。
 */
export default function AnalysisQueueRunner() {
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void drainQueue().catch(() => {});
    };

    run();
    window.addEventListener("online", run);
    return () => {
      cancelled = true;
      window.removeEventListener("online", run);
    };
  }, []);

  return null;
}
