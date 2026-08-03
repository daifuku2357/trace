"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { getSetting, setSetting } from "./settings";
import { todayKey } from "./date";
import { computeStreak } from "./stats";
import type { Analysis, DateKey, Entry, FocusSession, Goal, PlanBlock } from "./types";

/**
 * 成長システム（ドーパミンの背骨）。
 * 書く・集中する・今日の一手を完了する—すべてが経験値(XP)になり、レベルが上がる。
 * XP は既存データから毎回導出する（専用テーブルを持たず二重計上の心配をなくす）。
 */

/** 1エントリの XP。長いほど増えるが上限あり。2分ルールの軽い記入は控えめ。 */
export function entryXp(e: Pick<Entry, "charCount" | "isLightMode">): number {
  if (e.charCount <= 0) return 0;
  if (e.isLightMode) return 6;
  return 12 + Math.min(Math.floor(e.charCount / 40) * 2, 18); // 12〜30
}

/** 集中セッションの XP。1分あたり 0.6。 */
export function focusXp(minutes: number): number {
  return Math.round(minutes * 0.6);
}

const GOAL_DONE_XP = 8; // Lv3（週次タスク＝最小段）を完了
const ANALYSIS_XP = 3; // 感情分析が付いた日
const PLAN_BLOCK_XP = 4; // 「今日の組み立て」のブロックを1つ完了

/** レベル n→n+1 に必要な XP。40, 60, 80, … と緩やかに増える。 */
function xpForLevel(level: number): number {
  return 40 + (level - 1) * 20;
}

export interface LevelInfo {
  level: number;
  intoLevel: number;
  needForNext: number;
  progress: number;
  totalXp: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  let rem = Math.max(0, Math.floor(totalXp));
  while (rem >= xpForLevel(level)) {
    rem -= xpForLevel(level);
    level++;
  }
  const need = xpForLevel(level);
  return { level, intoLevel: rem, needForNext: need, progress: rem / need, totalXp: Math.floor(totalXp) };
}

export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 300, 365];

export interface Growth {
  xp: number;
  level: LevelInfo;
  todayXp: number;
  streak: number;
  /** 次のストリーク節目（超えたら祝う）。null なら当面なし。 */
  nextStreakMilestone: number | null;
  breakdown: { write: number; focus: number; goals: number; analysis: number; plan: number };
}

export function computeGrowth(
  entries: Entry[],
  focus: FocusSession[],
  goals: Goal[],
  analyses: Analysis[],
  plans: PlanBlock[],
  refDate: DateKey,
): Growth {
  const write = entries.reduce((s, e) => s + entryXp(e), 0);
  const focusX = focus.reduce((s, f) => s + focusXp(f.minutes), 0);
  const goalsX = goals.filter((g) => g.level === 3 && g.status === "done").length * GOAL_DONE_XP;
  const analysisX = analyses.length * ANALYSIS_XP;
  const planX = plans.filter((b) => b.done).length * PLAN_BLOCK_XP;
  const xp = write + focusX + goalsX + analysisX + planX;

  // 今日獲得した XP（記入 + 集中 + 組み立ての完了）。祝いのトースト用。
  const todayWrite = entries.filter((e) => e.date === refDate).reduce((s, e) => s + entryXp(e), 0);
  const todayFocus = focus.filter((f) => f.date === refDate).reduce((s, f) => s + focusXp(f.minutes), 0);
  const todayPlan = plans.filter((b) => b.date === refDate && b.done).length * PLAN_BLOCK_XP;

  // 連続記録（保険つき）。共通の computeStreak を使う。
  const entryDates = new Set(entries.filter((e) => e.charCount > 0).map((e) => e.date));
  const streak = computeStreak(entryDates, refDate);

  return {
    xp,
    level: levelFromXp(xp),
    todayXp: todayWrite + todayFocus + todayPlan,
    streak,
    nextStreakMilestone: STREAK_MILESTONES.find((m) => m > streak) ?? null,
    breakdown: { write, focus: focusX, goals: goalsX, analysis: analysisX, plan: planX },
  };
}

export function useGrowth(refDate: DateKey = todayKey()): Growth | undefined {
  return useLiveQuery(async () => {
    const [entries, focus, goals, analyses, plans] = await Promise.all([
      db.entries.toArray(),
      db.focusSessions.toArray(),
      db.goals.toArray(),
      db.analyses.toArray(),
      db.planBlocks.toArray(),
    ]);
    return computeGrowth(entries, focus, goals, analyses, plans, refDate);
  }, [refDate]);
}

/**
 * レベル・ストリークの節目を検出する。settings に「見せ済み」の値を持ち、
 * 初回は静かに現在値へ合わせる（既存データでいきなり祝わない）。超えたぶんだけ祝う。
 */
export interface Milestone {
  kind: "level" | "streak";
  value: number;
}

export async function detectMilestones(growth: Growth): Promise<Milestone[]> {
  const out: Milestone[] = [];

  const seenLevelRaw = await getSetting("seenLevel");
  if (seenLevelRaw === undefined) {
    await setSetting("seenLevel", String(growth.level.level));
  } else if (growth.level.level > Number(seenLevelRaw)) {
    out.push({ kind: "level", value: growth.level.level });
    await setSetting("seenLevel", String(growth.level.level));
  }

  const seenStreakRaw = await getSetting("seenStreakMilestone");
  const reached = [...STREAK_MILESTONES].reverse().find((m) => growth.streak >= m) ?? 0;
  if (seenStreakRaw === undefined) {
    await setSetting("seenStreakMilestone", String(reached));
  } else if (reached > Number(seenStreakRaw)) {
    out.push({ kind: "streak", value: reached });
    await setSetting("seenStreakMilestone", String(reached));
  }

  return out;
}
