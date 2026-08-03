"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { formatMinutes } from "@/lib/focus";
import { addDays, todayKey } from "@/lib/date";

/** 週次ふりかえり（AIなし・決定的）。直近7日の記入・気分・集中・達成率を一枚で。 */
export default function WeeklyReview() {
  const data = useLiveQuery(async () => {
    const today = todayKey();
    const from = addDays(today, -6);
    const [entries, analyses, focus, blocks] = await Promise.all([
      db.entries.where("date").between(from, today, true, true).toArray(),
      db.analyses.where("date").between(from, today, true, true).toArray(),
      db.focusSessions.where("date").between(from, today, true, true).toArray(),
      db.planBlocks.where("date").between(from, today, true, true).toArray(),
    ]);
    const writtenDays = new Set(entries.filter((e) => e.charCount > 0).map((e) => e.date)).size;
    const moods = analyses.map((a) => a.sentimentScore);
    const moodAvg = moods.length ? moods.reduce((s, v) => s + v, 0) / moods.length : null;
    const focusMin = focus.reduce((s, f) => s + f.minutes, 0);
    const done = blocks.filter((b) => b.done).length;
    const planRate = blocks.length ? Math.round((done / blocks.length) * 100) : null;
    return { writtenDays, moodAvg, focusMin, planRate };
  }, []);

  if (!data) return <div className="h-20 animate-pulse rounded-xl bg-ai-weak" />;

  return (
    <section className="rounded-2xl border border-rule bg-paper p-3 shadow-soft">
      <h2 className="mb-2 text-[13px] font-bold text-ink-2">今週のふりかえり（直近7日）</h2>
      <dl className="grid grid-cols-4 gap-2 text-center">
        <Metric label="記入" value={`${data.writtenDays}`} unit="日" tone="grow" />
        <Metric
          label="気分"
          value={data.moodAvg === null ? "—" : `${data.moodAvg > 0 ? "+" : ""}${data.moodAvg.toFixed(2)}`}
          tone="ai"
        />
        <Metric label="集中" value={data.focusMin > 0 ? formatMinutes(data.focusMin) : "—"} tone="grow" />
        <Metric label="達成" value={data.planRate === null ? "—" : `${data.planRate}`} unit={data.planRate === null ? "" : "%"} tone="reward" />
      </dl>
    </section>
  );
}

function Metric({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone: "grow" | "ai" | "reward";
}) {
  const color = tone === "grow" ? "text-grow-ink" : tone === "ai" ? "text-ai" : "text-reward-ink";
  return (
    <div className="rounded-xl bg-paper-2/50 py-2">
      <div className={`num text-lg font-bold ${color}`}>
        {value}
        {unit && <span className="ml-0.5 text-[11px] font-normal text-ink-3">{unit}</span>}
      </div>
      <div className="text-[10px] text-ink-3">{label}</div>
    </div>
  );
}
