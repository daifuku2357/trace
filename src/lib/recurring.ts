"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { addManualBlock, toMinutes } from "./plan";
import { fromKey, todayKey } from "./date";
import type { DateKey, RecurringEvent } from "./types";

/**
 * 毎週の固定予定（時間割）のクライアントロジック。
 * 自然言語 → `/api/timetable` で構造化 → 人が確認して保存 → 該当曜日の予定に自動反映。
 */

export interface ParsedEvent {
  weekday: number;
  start: string;
  end: string;
  title: string;
}

/** 予定の長さ（分）。時間割は日跨ぎ想定なしなので単純差分。 */
export function eventMinutes(e: { start: string; end: string }): number {
  const s = toMinutes(e.start) ?? 0;
  const en = toMinutes(e.end) ?? s;
  return Math.max(0, en - s);
}

export function useRecurring(): RecurringEvent[] | undefined {
  return useLiveQuery(() => db.recurringEvents.toArray().then(sortRecurring), []);
}

function sortRecurring(rs: RecurringEvent[]): RecurringEvent[] {
  return rs.sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
}

/** 自然言語の時間割を AI に構造化してもらう（保存はまだしない）。 */
export async function parseTimetable(
  text: string,
): Promise<{ ok: true; events: ParsedEvent[] } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch("/api/timetable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    return { ok: false, error: "通信に失敗しました。オフラインの可能性があります。" };
  }
  const data = (await res.json().catch(() => ({}))) as { events?: ParsedEvent[]; error?: string };
  if (!res.ok || !Array.isArray(data.events)) {
    return { ok: false, error: data.error ?? "読み取りに失敗しました。" };
  }
  return { ok: true, events: data.events };
}

/** 確認済みの予定を、有効期間つきでまとめて保存する。 */
export async function saveRecurring(
  events: ParsedEvent[],
  fromDate: DateKey,
  untilDate: DateKey,
): Promise<void> {
  const now = Date.now();
  const rows: Omit<RecurringEvent, "id">[] = events.map((e) => ({
    weekday: e.weekday,
    start: e.start,
    end: e.end,
    title: e.title,
    fromDate,
    untilDate,
    createdAt: now,
  }));
  await db.recurringEvents.bulkAdd(rows as RecurringEvent[]);
}

export async function removeRecurring(id: number): Promise<void> {
  await db.recurringEvents.delete(id);
}

/** 末日（untilDate）を過ぎた時間割を削除する。過ぎたものは一覧から自動で消える。 */
export async function purgeExpiredRecurring(): Promise<number> {
  const today = todayKey();
  const expired = (await db.recurringEvents.toArray()).filter((e) => e.untilDate < today);
  if (expired.length === 0) return 0;
  await db.recurringEvents.bulkDelete(
    expired.map((e) => e.id).filter((id): id is number => id != null),
  );
  return expired.length;
}

/** 指定日に有効な固定予定（曜日一致かつ有効期間内）を、開始時刻順で返す。 */
export function recurringForDate(events: RecurringEvent[], date: DateKey): RecurringEvent[] {
  const wd = fromKey(date).getDay();
  return events
    .filter((e) => e.weekday === wd && e.fromDate <= date && date <= e.untilDate)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * その日の固定予定をブロックとしてカレンダーに入れる（AI生成を使わない場合用）。
 * 同じ開始時刻＋名称のブロックが既にあれば重複を避ける。追加した件数を返す。
 */
export async function applyRecurringToDay(date: DateKey): Promise<number> {
  const all = await db.recurringEvents.toArray();
  const todays = recurringForDate(all, date);
  if (todays.length === 0) return 0;
  const existing = await db.planBlocks.where("date").equals(date).toArray();
  let added = 0;
  for (const e of todays) {
    if (existing.some((b) => b.start === e.start && b.title === e.title)) continue;
    await addManualBlock(date, { start: e.start, end: e.end, title: e.title, kind: "task" });
    added++;
  }
  return added;
}
