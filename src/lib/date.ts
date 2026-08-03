import type { DateKey } from "./types";

/**
 * 日付はすべてローカルタイムの 'YYYY-MM-DD' 文字列で扱う。
 * Date#toISOString() は UTC に変換され日本時間の early morning が前日にずれるため使わない。
 */

const pad = (n: number) => String(n).padStart(2, "0");

export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): DateKey {
  return toKey(new Date());
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = fromKey(key);
  d.setDate(d.getDate() + days);
  return toKey(d);
}

export function isFuture(key: DateKey): boolean {
  return key > todayKey();
}

/** from〜to（両端含む）の連続した日付キー配列。 */
export function rangeKeys(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** 直近 n 日（今日を含む）。 */
export function lastNDays(n: number, end: DateKey = todayKey()): DateKey[] {
  return rangeKeys(addDays(end, -(n - 1)), end);
}

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

export function weekdayJa(key: DateKey): string {
  return WEEKDAY_JA[fromKey(key).getDay()];
}

/** 「2026年7月22日（水）」 */
export function formatLong(key: DateKey): string {
  const d = fromKey(key);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${weekdayJa(key)}）`;
}

/** 「7/22（水）」 */
export function formatShort(key: DateKey): string {
  const d = fromKey(key);
  return `${d.getMonth() + 1}/${d.getDate()}（${weekdayJa(key)}）`;
}

/** 'YYYY-MM' */
export function monthKey(key: DateKey): string {
  return key.slice(0, 7);
}

export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${y}年${m}月`;
}

/** 相対表現。「今日」「昨日」「3日前」 */
export function relativeLabel(key: DateKey): string {
  const diff = Math.round(
    (fromKey(todayKey()).getTime() - fromKey(key).getTime()) / 86_400_000,
  );
  if (diff === 0) return "今日";
  if (diff === 1) return "昨日";
  if (diff === 2) return "一昨日";
  if (diff > 0) return `${diff}日前`;
  return `${-diff}日後`;
}
