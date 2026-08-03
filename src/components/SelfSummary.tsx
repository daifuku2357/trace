"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { addDays, todayKey } from "@/lib/date";
import {
  EMOTION_LABELS,
  EMOTION_LABEL_JA,
  TASK_CATEGORY_JA,
  type EmotionLabel,
  type TaskCategory,
} from "@/lib/types";

/** 就活の材料になる「あなたの傾向」を決定的に集計（AIなし）。強み/STAR の背景に置く。 */
export default function SelfSummary() {
  const s = useLiveQuery(async () => {
    const today = todayKey();
    const from = addDays(today, -179);
    const [analyses, tasks] = await Promise.all([
      db.analyses.where("date").between(from, today, true, true).toArray(),
      db.tasks.where("date").between(from, today, true, true).toArray(),
    ]);
    if (analyses.length === 0) return { empty: true as const };

    const kw = new Map<string, number>();
    let sentSum = 0;
    const labelSum = Object.fromEntries(EMOTION_LABELS.map((l) => [l, 0])) as Record<EmotionLabel, number>;
    for (const a of analyses) {
      sentSum += a.sentimentScore;
      for (const w of a.keywords) kw.set(w, (kw.get(w) ?? 0) + 1);
      for (const l of EMOTION_LABELS) labelSum[l] += a.labels[l] ?? 0;
    }
    const cat = new Map<TaskCategory, number>();
    for (const t of tasks) cat.set(t.category, (cat.get(t.category) ?? 0) + 1);

    const topKeywords = [...kw.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
    const topCats = [...cat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => TASK_CATEGORY_JA[c]);
    const topLabels = EMOTION_LABELS.filter((l) => labelSum[l] > 0)
      .sort((a, b) => labelSum[b] - labelSum[a])
      .slice(0, 3)
      .map((l) => EMOTION_LABEL_JA[l]);

    return {
      empty: false as const,
      days: analyses.length,
      sentiment: sentSum / analyses.length,
      topKeywords,
      topCats,
      topLabels,
    };
  }, []);

  if (!s) return <div className="h-16 animate-pulse rounded-xl bg-ai-weak" />;
  if (s.empty) return null;

  return (
    <section className="rounded-xl border border-rule bg-paper-2/40 p-3">
      <div className="mb-1.5 text-[12px] font-bold text-ink-2">
        あなたの傾向 <span className="num font-normal text-ink-3">（分析済み {s.days} 日ぶん）</span>
      </div>
      <dl className="space-y-1 text-[12px]">
        <Row label="感情">
          <span className="num">
            平均 {s.sentiment > 0 ? "+" : ""}
            {s.sentiment.toFixed(2)}
          </span>
          {s.topLabels.length > 0 && <span className="text-ink-3"> / {s.topLabels.join("・")}</span>}
        </Row>
        {s.topCats.length > 0 && (
          <Row label="活動">
            <span className="text-ink-2">{s.topCats.join("・")}</span>
          </Row>
        )}
        {s.topKeywords.length > 0 && (
          <Row label="語">
            <span className="flex flex-wrap gap-1">
              {s.topKeywords.map((w) => (
                <span key={w} className="rounded-full bg-paper px-1.5 py-0.5 text-[11px] text-ink-2">
                  {w}
                </span>
              ))}
            </span>
          </Row>
        )}
      </dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-8 shrink-0 text-ink-3">{label}</dt>
      <dd className="flex-1">{children}</dd>
    </div>
  );
}
