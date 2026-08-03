"use client";

import Link from "next/link";
import { fromKey, toKey } from "@/lib/date";
import { charCountLevel, type DayPoint } from "@/lib/stats";
import type { DateKey } from "@/lib/types";

/**
 * コントリビューショングラフ（仕様書 §3.2）。
 * - 濃淡は文字数ベース、藍の5段階（単色）
 * - 無記入は薄グレーの枠線のみ
 * - 分析済みは右上を欠いた形にして、色以外でも状態が判別できるようにする（§2）
 */
const LEVEL_CLASS = [
  "bg-transparent border-rule", // 0: 無記入
  "bg-s1 border-s1",
  "bg-s2 border-s2",
  "bg-s3 border-s3",
  "bg-s4 border-s4",
  "bg-s5 border-s5",
] as const;

const WEEKDAY_ROWS = ["日", "", "火", "", "木", "", "土"];

export default function Heatmap({ days }: { days: DayPoint[] }) {
  if (days.length === 0) return null;

  const byDate = new Map(days.map((d) => [d.date, d]));

  // 週の列を作る。左端の週は日曜まで遡って空セルで埋める。
  const start = fromKey(days[0].date);
  start.setDate(start.getDate() - start.getDay());
  const end = fromKey(days[days.length - 1].date);

  const weeks: (DayPoint | null)[][] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const week: (DayPoint | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const key = toKey(cursor);
      week.push(byDate.get(key) ?? (key <= toKey(end) && key >= days[0].date ? emptyPoint(key) : null));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  // 月ラベルは、その月の最初の週の列に置く。
  const monthLabels = weeks.map((week, i) => {
    const first = week.find(Boolean);
    if (!first) return null;
    const d = fromKey(first.date);
    const prev = weeks[i - 1]?.find(Boolean);
    if (i !== 0 && prev && fromKey(prev.date).getMonth() === d.getMonth()) return null;
    return `${d.getMonth() + 1}月`;
  });

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-1">
          <div className="mt-[18px] flex w-5 shrink-0 flex-col gap-[3px]">
            {WEEKDAY_ROWS.map((w, i) => (
              <span key={i} className="h-[11px] text-[9px] leading-[11px] text-ink-3">
                {w}
              </span>
            ))}
          </div>

          <div className="flex gap-[3px]">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                <span className="h-[15px] whitespace-nowrap text-[9px] leading-[15px] text-ink-3">
                  {monthLabels[wi] ?? ""}
                </span>
                {week.map((day, di) =>
                  day ? <Cell key={di} day={day} /> : <span key={di} className="h-[11px] w-[11px]" />,
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Legend />
    </div>
  );
}

function Cell({ day }: { day: DayPoint }) {
  const level = charCountLevel(day.charCount);
  const label = `${day.date} ${day.written ? `${day.charCount}字` : "未記入"}${day.analyzed ? "・分析済" : ""}`;

  return (
    <Link
      href={`/entry/${day.date}`}
      title={label}
      aria-label={label}
      className={`relative block h-[11px] w-[11px] border ${LEVEL_CLASS[level]} hover:outline hover:outline-1 hover:outline-ink`}
    >
      {/* 分析済みの形状マーク: 右上を紙色の三角で欠けさせる */}
      {day.analyzed && (
        <span
          aria-hidden
          className="absolute right-0 top-0 border-b-[4px] border-l-[4px] border-b-transparent border-l-paper"
        />
      )}
    </Link>
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-3">
      <span className="flex items-center gap-1">
        少ない
        {[0, 1, 2, 3, 4, 5].map((l) => (
          <span key={l} className={`inline-block h-[10px] w-[10px] border ${LEVEL_CLASS[l]}`} />
        ))}
        多い（文字数）
      </span>
      <span className="flex items-center gap-1">
        <span className="relative inline-block h-[10px] w-[10px] border bg-s4">
          <span
            aria-hidden
            className="absolute right-0 top-0 border-b-[4px] border-l-[4px] border-b-transparent border-l-paper"
          />
        </span>
        右上が欠けたセル = 分析済
      </span>
    </div>
  );
}

function emptyPoint(date: DateKey): DayPoint {
  return { date, charCount: 0, sentiment: null, moodManual: null, written: false, analyzed: false };
}
