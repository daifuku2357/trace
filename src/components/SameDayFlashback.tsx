"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getAnalysis, getEntry } from "@/lib/db";
import { formatShort, fromKey, toKey } from "@/lib/date";
import type { DateKey } from "@/lib/types";

/** 先月の同じ日・1年前の同じ日の記録を小さく振り返る。 */
export default function SameDayFlashback({ date }: { date: DateKey }) {
  const rows = useLiveQuery(async () => {
    const targets: { label: string; key: DateKey }[] = [
      { label: "先月の今日", key: shift(date, "month") },
      { label: "1年前の今日", key: shift(date, "year") },
    ];
    const out: { label: string; key: DateKey; sentiment: number | null }[] = [];
    for (const t of targets) {
      const e = await getEntry(t.key);
      if (!e || e.charCount === 0) continue;
      const a = await getAnalysis(t.key);
      out.push({ label: t.label, key: t.key, sentiment: a?.sentimentScore ?? null });
    }
    return out;
  }, [date]);

  // 依存の空実行（entries/analyses の変化で更新）。
  void useLiveQuery(() => db.entries.count(), []);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-rule px-4 py-2">
      <span className="text-[10px] font-bold tracking-wider text-ink-3">ふりかえり</span>
      {rows.map((r) => (
        <Link
          key={r.key}
          href={`/entry/${r.key}`}
          className="flex items-center gap-1 rounded-full border border-rule bg-paper-2/60 px-2 py-0.5 text-[11px] hover:bg-paper-2"
        >
          <span className="text-ink-2">{r.label}</span>
          <span className="num text-ink-3">{formatShort(r.key)}</span>
          {r.sentiment !== null && (
            <span className="num text-ink-3">
              {r.sentiment > 0 ? "+" : ""}
              {r.sentiment.toFixed(1)}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

/** 同じ日付の1ヶ月前 / 1年前のキー。月末のずれは JS の挙動に委ねる（稀）。 */
function shift(date: DateKey, unit: "month" | "year"): DateKey {
  const d = fromKey(date);
  if (unit === "month") d.setMonth(d.getMonth() - 1);
  else d.setFullYear(d.getFullYear() - 1);
  return toKey(d);
}
