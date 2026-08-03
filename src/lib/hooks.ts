"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { rangeKeys } from "./date";
import { buildDayPoints, type DayPoint } from "./stats";
import type { Analysis, DateKey, Entry, Task } from "./types";

export interface RangeData {
  points: DayPoint[];
  entries: Map<DateKey, Entry>;
  analyses: Map<DateKey, Analysis>;
  /** 期間内で分析済みのものだけ。ラベル集計・キーワード集計に使う。 */
  analysisList: Analysis[];
  /** 期間内のタスク（§3.7 の分類結果）。カテゴリ内訳の集計に使う。 */
  tasks: Task[];
}

/**
 * from〜to の日次データをまとめて取得する。
 * IndexedDB の変更を購読しているため、日記を保存すればグラフも自動で追従する。
 * 読み込み中は undefined を返す。
 */
export function useRange(from: DateKey, to: DateKey): RangeData | undefined {
  return useLiveQuery(async () => {
    const [entryRows, analysisRows, taskRows] = await Promise.all([
      db.entries.where("date").between(from, to, true, true).toArray(),
      db.analyses.where("date").between(from, to, true, true).toArray(),
      db.tasks.where("date").between(from, to, true, true).toArray(),
    ]);

    const entries = new Map(entryRows.map((e) => [e.date, e]));
    const analyses = new Map(analysisRows.map((a) => [a.date, a]));

    return {
      points: buildDayPoints(rangeKeys(from, to), entries, analyses),
      entries,
      analyses,
      analysisList: analysisRows.sort((a, b) => a.date.localeCompare(b.date)),
      tasks: taskRows,
    };
  }, [from, to]);
}

export interface Streaks {
  current: number;
  longest: number;
  total: number;
}

/** 連続記録日数。今日がまだ未記入でも、昨日まで続いていれば継続中として数える。 */
export function useStreaks(): Streaks | undefined {
  return useLiveQuery(async () => {
    const all = (await db.entries.orderBy("date").toArray()).map((e) => e.date);
    const set = new Set(all);
    let longest = 0;
    let run = 0;
    let prev: string | null = null;

    for (const d of all) {
      run = prev && dayDiff(prev, d) === 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = d;
    }

    const today = new Date();
    let cursor = new Date(today);
    if (!set.has(fmt(cursor))) cursor.setDate(cursor.getDate() - 1);
    let current = 0;
    while (set.has(fmt(cursor))) {
      current++;
      cursor.setDate(cursor.getDate() - 1);
    }

    return { current, longest, total: all.length };
  }, []);
}

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000,
  );
}
