"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { addDays } from "./date";
import { computeStreak } from "./stats";
import { MIN_CHARS, type DateKey } from "./types";

/**
 * ホームの決定的サマリ（AI 不要・即時）。
 * 秘書のAIコメントは廃止し、状況の数値と導線だけをここで組み立てる。
 */

export type Slot = "morning" | "day" | "evening" | "night";

export function timeSlot(d = new Date()): Slot {
  const h = d.getHours();
  if (h < 5) return "night";
  if (h < 11) return "morning";
  if (h < 17) return "day";
  if (h < 22) return "evening";
  return "night";
}

const SLOT_GREETING: Record<Slot, string> = {
  morning: "おはようございます",
  day: "こんにちは",
  evening: "お疲れさまです",
  night: "こんばんは",
};

export function greeting(d = new Date()): string {
  return SLOT_GREETING[timeSlot(d)];
}

export interface HomeSummary {
  streak: number;
  writeRate30: number;
  moodAvg7: number | null;
  moodTrend: "up" | "down" | "flat" | null;
  pending: { analyze: number; classify: number; dueSoon: number };
  writtenToday: boolean;
}

export async function buildHomeSummary(date: DateKey): Promise<HomeSummary> {
  const from30 = addDays(date, -29);
  const from14 = addDays(date, 13);

  const [entries, analyses, goals] = await Promise.all([
    db.entries.where("date").between(addDays(date, -60), date, true, true).toArray(),
    db.analyses.where("date").between(addDays(date, -13), date, true, true).toArray(),
    db.goals.toArray(),
  ]);

  const entryDates = new Set(entries.map((e) => e.date));

  // 連続記録（保険つき）。growth と同じ computeStreak を使う。
  const streak = computeStreak(entryDates, date);

  const in30 = entries.filter((e) => e.date >= from30 && e.date <= date);
  const writeRate30 = in30.length / 30;

  const recentAll = analyses.filter((a) => a.date >= addDays(date, -6)).map((a) => a.sentimentScore);
  const moodAvg7 = recentAll.length ? avg(recentAll) : null;

  const recent = analyses.filter((a) => a.date >= addDays(date, -2)).map((a) => a.sentimentScore);
  const prior = analyses
    .filter((a) => a.date >= addDays(date, -6) && a.date < addDays(date, -2))
    .map((a) => a.sentimentScore);
  let moodTrend: HomeSummary["moodTrend"] = null;
  if (recent.length && prior.length) {
    const diff = avg(recent) - avg(prior);
    moodTrend = diff > 0.1 ? "up" : diff < -0.1 ? "down" : "flat";
  }

  // 未処理: 本文はあるが未分析／未分類の直近件数。
  let analyzePending = 0;
  let classifyPending = 0;
  const analyzedDates = new Set((await db.analyses.toArray()).map((a) => a.date));
  const classifiedDates = new Set((await db.tasks.toArray()).map((t) => t.date));
  for (const e of entries) {
    if (e.charCount < MIN_CHARS) continue;
    if (!analyzedDates.has(e.date)) analyzePending++;
    if (!classifiedDates.has(e.date)) classifyPending++;
  }

  const dueSoon = goals.filter(
    (g) => g.level === 2 && g.status !== "done" && g.dueDate && g.dueDate <= from14.slice(0, 7),
  ).length;

  const todayEntry = entries.find((e) => e.date === date);

  return {
    streak,
    writeRate30,
    moodAvg7,
    moodTrend,
    pending: { analyze: analyzePending, classify: classifyPending, dueSoon },
    writtenToday: (todayEntry?.charCount ?? 0) >= MIN_CHARS,
  };
}

/** ホームサマリを購読する。entries/analyses/goals/tasks の変更で再計算される。 */
export function useHomeSummary(date: DateKey): HomeSummary | undefined {
  return useLiveQuery(async () => {
    await Promise.all([db.entries.count(), db.analyses.count(), db.goals.count(), db.tasks.count()]);
    return buildHomeSummary(date);
  }, [date]);
}

function avg(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}
