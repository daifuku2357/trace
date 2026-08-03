"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { deleteSetting, setSetting } from "./settings";
import { addDays, toKey, todayKey } from "./date";
import { TASK_CATEGORIES, type DateKey, type FocusSession, type TaskCategory } from "./types";

/**
 * 集中セッション（継続を促す「集中で成長」システム）。
 * - 積み上げた集中時間で成長メーターが伸びる（レベル制）。
 * - 実行中のセッションは settings に開始時刻付きで保存し、
 *   リロードやタブ移動をまたいでも経過時間を復元できるようにする。
 */

const ACTIVE_KEY = "activeFocus";

export interface ActiveFocus {
  category: TaskCategory;
  startedAt: number;
  /** 目標分。0 なら上限なし（ストップウォッチ）。 */
  targetMinutes: number;
}

export async function startFocus(category: TaskCategory, targetMinutes: number) {
  const active: ActiveFocus = { category, startedAt: Date.now(), targetMinutes };
  await setSetting(ACTIVE_KEY, JSON.stringify(active));
}

export async function cancelFocus() {
  await deleteSetting(ACTIVE_KEY);
}

/**
 * 実行中セッションを確定する。経過分を記録し、実行中フラグを消す。
 * minutes を渡せばその分で、省略すれば開始時刻からの経過分で記録する。
 * 1分未満は記録しない（誤タップ対策）。
 */
export async function completeFocus(minutes?: number): Promise<FocusSession | null> {
  const active = await getActiveFocus();
  if (!active) return null;

  const now = Date.now();
  const elapsed = minutes ?? Math.round((now - active.startedAt) / 60_000);
  await deleteSetting(ACTIVE_KEY);
  if (elapsed < 1) return null;

  const session: FocusSession = {
    date: toKey(new Date(active.startedAt)),
    category: active.category,
    minutes: elapsed,
    startedAt: active.startedAt,
    endedAt: now,
  };
  const id = await db.focusSessions.add(session);
  return { ...session, id: id as number };
}

/** 手動で過去のセッションを足す（タイマーを使わずに記録したいとき）。 */
export async function addManualSession(category: TaskCategory, minutes: number, date: DateKey = todayKey()) {
  if (minutes < 1) return;
  const end = Date.now();
  await db.focusSessions.add({
    date,
    category,
    minutes,
    startedAt: end - minutes * 60_000,
    endedAt: end,
  });
}

export async function deleteSession(id: number) {
  await db.focusSessions.delete(id);
}

export async function getActiveFocus(): Promise<ActiveFocus | null> {
  const raw = (await db.settings.get(ACTIVE_KEY))?.value;
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as ActiveFocus;
    if (!TASK_CATEGORIES.includes(v.category)) return null;
    return v;
  } catch {
    return null;
  }
}

export function useActiveFocus(): ActiveFocus | null {
  const row = useLiveQuery(() => db.settings.get(ACTIVE_KEY), []);
  if (!row?.value) return null;
  try {
    const v = JSON.parse(row.value) as ActiveFocus;
    return TASK_CATEGORIES.includes(v.category) ? v : null;
  } catch {
    return null;
  }
}

// ---- 成長メーター（レベル制） ----

/**
 * レベル n → n+1 に必要な集中分。level 1 の要求を60分とし、レベルごとに30分ずつ増やす。
 * 60, 90, 120, 150, … と緩やかに増加し、序盤は達成感を、後半は積み上げ感を出す。
 */
function minutesForLevel(level: number): number {
  return 60 + (level - 1) * 30;
}

export interface LevelInfo {
  level: number;
  /** 現在レベル内で貯めた分。 */
  intoLevel: number;
  /** 次のレベルに必要な分。 */
  needForNext: number;
  /** 0〜1。 */
  progress: number;
  totalMinutes: number;
}

export function levelInfo(totalMinutes: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalMinutes));
  while (remaining >= minutesForLevel(level)) {
    remaining -= minutesForLevel(level);
    level++;
  }
  const needForNext = minutesForLevel(level);
  return {
    level,
    intoLevel: remaining,
    needForNext,
    progress: needForNext > 0 ? remaining / needForNext : 0,
    totalMinutes: Math.floor(totalMinutes),
  };
}

export interface FocusStats {
  totalMinutes: number;
  level: LevelInfo;
  todayMinutes: number;
  weekMinutes: number;
  weekSessions: number;
  /** 今週のカテゴリ別集中分（多い順）。 */
  weekByCategory: { category: TaskCategory; minutes: number }[];
  /** 集中した日の連続数（今日未集中でも昨日まで続いていれば継続）。 */
  streak: number;
}

/** 集中の統計。focusSessions の変更で自動更新される。 */
export function useFocusStats(refDate: DateKey = todayKey()): FocusStats | undefined {
  return useLiveQuery(async () => {
    const sessions = await db.focusSessions.toArray();
    return computeFocusStats(sessions, refDate);
  }, [refDate]);
}

export function computeFocusStats(sessions: FocusSession[], refDate: DateKey): FocusStats {
  const totalMinutes = sessions.reduce((s, x) => s + x.minutes, 0);
  const weekStart = addDays(refDate, -6);

  const today = sessions.filter((s) => s.date === refDate);
  const week = sessions.filter((s) => s.date >= weekStart && s.date <= refDate);

  const byCat = new Map<TaskCategory, number>();
  for (const s of week) byCat.set(s.category, (byCat.get(s.category) ?? 0) + s.minutes);

  const focusDates = new Set(sessions.map((s) => s.date));
  let cursor = refDate;
  if (!focusDates.has(cursor)) cursor = addDays(cursor, -1);
  let streak = 0;
  while (focusDates.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  return {
    totalMinutes,
    level: levelInfo(totalMinutes),
    todayMinutes: today.reduce((s, x) => s + x.minutes, 0),
    weekMinutes: week.reduce((s, x) => s + x.minutes, 0),
    weekSessions: week.length,
    weekByCategory: [...byCat.entries()]
      .map(([category, minutes]) => ({ category, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    streak,
  };
}

/** 分を「1時間20分」「45分」の形に。 */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return m > 0 ? `${h}時間${m}分` : `${h}時間`;
  return `${m}分`;
}

/** refDate を渡さない版の toKey ラッパ（開始日算出用）。 */
export function sessionDate(startedAt: number): DateKey {
  return toKey(new Date(startedAt));
}
