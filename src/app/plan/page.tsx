"use client";

import { useEffect, useState } from "react";
import PlanScreen from "@/components/PlanScreen";

/** 組み立てタブ: タスク素材 → AIの下書き → 編集できる時間割。 */
export default function PlanPage() {
  // todayKey() はローカル時刻依存のため、マウント後に描画してハイドレーション差異を避ける。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-64 animate-pulse rounded-xl bg-ai-weak" />;
  return <PlanScreen />;
}
