"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { deleteSession, formatMinutes, useFocusStats } from "@/lib/focus";
import { formatShort, todayKey } from "@/lib/date";
import { TASK_CATEGORY_JA } from "@/lib/types";
import FocusTimer from "@/components/FocusTimer";
import FocusMeter from "@/components/FocusMeter";
import CategoryTag from "@/components/CategoryTag";

/** 集中タブ: タイマー + 成長メーター + セッション履歴。 */
export default function FocusPage() {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayKey()), []);

  if (!today) return <div className="h-64 animate-pulse border border-rule" />;
  return <FocusView today={today} />;
}

function FocusView({ today }: { today: string }) {
  const stats = useFocusStats(today);
  const sessions = useLiveQuery(
    () => db.focusSessions.orderBy("startedAt").reverse().limit(30).toArray(),
    [],
  );

  return (
    <div className="space-y-5">
      <FocusTimer />

      <section>
        <h2 className="rule-b pb-2 text-sm font-bold tracking-wider">成長</h2>
        <div className="pt-3">
          {stats ? <FocusMeter stats={stats} variant="full" /> : <div className="h-24 animate-pulse bg-ai-weak" />}
        </div>
      </section>

      <section>
        <h2 className="rule-b pb-2 text-sm font-bold tracking-wider">最近のセッション</h2>
        {!sessions ? (
          <div className="h-16 animate-pulse bg-ai-weak" />
        ) : sessions.length === 0 ? (
          <p className="py-4 text-sm text-ink-3">まだ集中セッションがありません。上のタイマーから始めましょう。</p>
        ) : (
          <ul className="divide-y divide-rule">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2">
                <CategoryTag category={s.category} />
                <span className="num text-sm">{formatMinutes(s.minutes)}</span>
                <span className="num ml-auto text-[11px] text-ink-3">
                  {formatShort(s.date)} {clock(s.startedAt)}
                </span>
                <button
                  onClick={() => s.id != null && void deleteSession(s.id)}
                  aria-label="削除"
                  className="px-1 text-xs text-ink-3 hover:text-ink"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* カテゴリの説明（ラベルだけで識別する制約のため一覧を添える） */}
      <p className="text-[11px] leading-5 text-ink-3">
        カテゴリ: {Object.values(TASK_CATEGORY_JA).join(" / ")}
      </p>
    </div>
  );
}

function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
