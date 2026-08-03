"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Heatmap from "@/components/Heatmap";
import RecordNav from "@/components/RecordNav";
import WeeklyReview from "@/components/WeeklyReview";
import StatusChip, { statusOf } from "@/components/StatusChip";
import { addDays, formatShort, todayKey } from "@/lib/date";
import { useRange, useStreaks } from "@/lib/hooks";

/** 記録タブ: 年間ヒートマップ + 直近の記入一覧（仕様書 §3.2）。分析とは上部の切替で分岐。 */
export default function RecordPage() {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayKey()), []);

  return (
    <>
      <RecordNav />
      {!today ? <div className="h-48 animate-pulse border border-rule" /> : <RecordView today={today} />}
    </>
  );
}

function RecordView({ today }: { today: string }) {
  const from = addDays(today, -364);
  const data = useRange(from, today);
  const streaks = useStreaks();

  const written = data?.points.filter((p) => p.written) ?? [];
  const totalChars = written.reduce((s, p) => s + p.charCount, 0);

  return (
    <div className="space-y-5">
      <WeeklyReview />

      <section>
        <h1 className="rule-b pb-2 text-sm font-bold tracking-wider">この1年</h1>
        <dl className="grid grid-cols-4 divide-x divide-rule border-b border-rule">
          <Stat label="記入日数" value={written.length} unit="日" />
          <Stat label="連続記録" value={streaks?.current ?? 0} unit="日" />
          <Stat label="最長連続" value={streaks?.longest ?? 0} unit="日" />
          <Stat label="総文字数" value={totalChars} unit="字" />
        </dl>
      </section>

      <section>
        <h2 className="rule-b pb-2 text-sm font-bold tracking-wider">コントリビューション</h2>
        <div className="pt-3">
          {data ? <Heatmap days={data.points} /> : <div className="h-24 animate-pulse bg-ai-weak" />}
        </div>
      </section>

      <section>
        <h2 className="rule-b pb-2 text-sm font-bold tracking-wider">最近の記入</h2>
        {written.length === 0 ? (
          <p className="py-4 text-sm text-ink-3">
            まだ記録がありません。
            <Link href="/" className="ml-1 text-ai underline">
              今日の日記を書く
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {[...written]
              .reverse()
              .slice(0, 30)
              .map((p) => {
                const entry = data!.entries.get(p.date)!;
                return (
                  <li key={p.date}>
                    <Link href={`/entry/${p.date}`} className="flex gap-3 py-2.5 hover:bg-ai-weak">
                      <div className="w-20 shrink-0">
                        <div className="num text-xs text-ink-2">{formatShort(p.date)}</div>
                        <StatusChip status={statusOf(true, p.analyzed)} className="mt-1" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{entry.body.trim().split("\n")[0]}</p>
                        <p className="mt-0.5 text-[11px] text-ink-3">
                          <span className="num">{p.charCount}</span>字
                          {p.moodManual != null && (
                            <>
                              {" ・ 気分 "}
                              <span className="num">{p.moodManual}</span>/5
                            </>
                          )}
                          {p.sentiment != null && (
                            <>
                              {" ・ 感情 "}
                              <span className="num">
                                {p.sentiment > 0 ? "+" : ""}
                                {p.sentiment.toFixed(2)}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="px-2 py-2 text-center first:pl-0 last:pr-0">
      <dt className="text-[10px] text-ink-3">{label}</dt>
      <dd className="mt-0.5">
        <span className="num text-lg font-bold">{value.toLocaleString("ja-JP")}</span>
        <span className="ml-0.5 text-[10px] text-ink-2">{unit}</span>
      </dd>
    </div>
  );
}
