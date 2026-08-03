"use client";

import { use } from "react";
import Link from "next/link";
import DiaryScreen from "@/components/DiaryScreen";
import { isFuture } from "@/lib/date";

/** 過去日の遡り入力（仕様書 §3.1）。ヒートマップのセルからもここへ飛ぶ。 */
export default function EntryPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return <Notice message="日付の形式が不正です。" />;
  }
  if (isFuture(date)) {
    return <Notice message="未来の日付には書けません。" />;
  }
  return <DiaryScreen date={date} />;
}

function Notice({ message }: { message: string }) {
  return (
    <div className="border border-rule p-4">
      <p className="text-sm">{message}</p>
      <Link href="/" className="mt-2 inline-block text-sm text-ai underline">
        今日の日記へ
      </Link>
    </div>
  );
}
