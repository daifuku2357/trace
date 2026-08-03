"use client";

import { useEffect, useState } from "react";
import DiaryScreen from "@/components/DiaryScreen";
import { todayKey } from "@/lib/date";

/**
 * ホーム画面 = 今日の入力画面（仕様書 §2 導線）。
 * 「書く」までのタップ数を 0 にするため、ここに一切の中間画面を挟まない。
 */
export default function TodayPage() {
  // 日付はクライアントのローカル時刻に依存するため、SSR とずれないよう mount 後に確定させる。
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => setDate(todayKey()), []);

  if (!date) {
    return <div className="h-64 animate-pulse border border-rule" aria-label="読み込み中" />;
  }
  return <DiaryScreen date={date} />;
}
