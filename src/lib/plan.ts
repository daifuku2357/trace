"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { getSetting, setSetting } from "./settings";
import { todayKey } from "./date";
import {
  DEFAULT_SLEEP,
  DEFAULT_WAKE,
  PLAN_KINDS,
  normalizePlanKind,
  type DailyHabit,
  type DateKey,
  type PlanBlock,
  type PlanItem,
  type PlanKind,
} from "./types";

/**
 * 「今日の組み立て」のクライアントロジック。
 * AI は下書き（planBlocks）を出すだけで、確定・編集・完了は人間が握る。
 * データはすべて IndexedDB に永続化する（Trace のオフラインファースト原則）。
 */

// ---- 起床 / 就寝（AI の配置範囲。settings に保存する全体設定） ----

export function useWakeSleep(): { wake: string; sleep: string } {
  const wake = useLiveQuery(() => getSetting("planWake"), []);
  const sleep = useLiveQuery(() => getSetting("planSleep"), []);
  return { wake: wake ?? DEFAULT_WAKE, sleep: sleep ?? DEFAULT_SLEEP };
}

export async function setWake(v: string) {
  await setSetting("planWake", v);
}

export async function setSleep(v: string) {
  await setSetting("planSleep", v);
}

// ---- 素材となるタスク（planItems） ----

export function usePlanItems(date: DateKey): PlanItem[] | undefined {
  return useLiveQuery(
    () =>
      db.planItems
        .where("date")
        .equals(date)
        .toArray()
        .then((rows) => rows.map((r) => ({ ...r, kind: normalizePlanKind(r.kind) })))
        .then(sortByOrder),
    [date],
  );
}

export interface NewItem {
  kind: PlanKind;
  title: string;
  estMinutes: number | null;
  fixedTime: string | null;
}

export async function addPlanItem(date: DateKey, input: NewItem): Promise<void> {
  const title = input.title.trim();
  if (!title) return;
  const max = await db.planItems.where("date").equals(date).count();
  await db.planItems.add({
    date,
    kind: input.kind,
    title,
    estMinutes: input.estMinutes,
    fixedTime: input.fixedTime,
    order: max,
    createdAt: Date.now(),
  });
}

export async function removePlanItem(id: number): Promise<void> {
  await db.planItems.delete(id);
}

// ---- 毎日くり返す習慣（全日に自動で効く） ----

export function useDailyHabits(): DailyHabit[] | undefined {
  return useLiveQuery(() => db.dailyHabits.toArray(), []);
}

export async function addDailyHabit(title: string, estMinutes: number | null): Promise<void> {
  const t = title.trim();
  if (!t) return;
  await db.dailyHabits.add({ title: t, estMinutes, createdAt: Date.now() });
}

export async function removeDailyHabit(id: number): Promise<void> {
  await db.dailyHabits.delete(id);
}

export async function updatePlanItem(id: number, patch: Partial<PlanItem>): Promise<void> {
  await db.planItems.update(id, patch);
}

// ---- 生成された時間割（planBlocks） ----

export function usePlanBlocks(date: DateKey): PlanBlock[] | undefined {
  return useLiveQuery(
    () =>
      db.planBlocks
        .where("date")
        .equals(date)
        .toArray()
        .then((rows) => rows.map((r) => ({ ...r, kind: normalizePlanKind(r.kind) })))
        .then(sortByStart),
    [date],
  );
}

/** その日のブロックを丸ごと置き換える（AI 生成の確定 or 再調整の反映）。 */
export async function replacePlanBlocks(
  date: DateKey,
  blocks: Omit<PlanBlock, "id" | "date" | "order">[],
): Promise<void> {
  await db.transaction("rw", db.planBlocks, async () => {
    await db.planBlocks.where("date").equals(date).delete();
    const rows: Omit<PlanBlock, "id">[] = blocks.map((b, i) => ({ ...b, date, order: i }));
    await db.planBlocks.bulkAdd(rows as PlanBlock[]);
  });
}

export async function togglePlanBlock(block: PlanBlock): Promise<void> {
  if (block.id == null) return;
  await db.planBlocks.update(block.id, { done: !block.done });
}

export async function updatePlanBlock(id: number, patch: Partial<PlanBlock>): Promise<void> {
  await db.planBlocks.update(id, patch);
}

export async function removePlanBlock(id: number): Promise<void> {
  await db.planBlocks.delete(id);
}

/** 手動でブロックを1つ足す（末尾）。並び順は start で表示するため order は末尾で十分。 */
export async function addManualBlock(
  date: DateKey,
  block: Pick<PlanBlock, "start" | "end" | "title" | "kind">,
): Promise<void> {
  const max = await db.planBlocks.where("date").equals(date).count();
  await db.planBlocks.add({ ...block, date, done: false, order: max, source: "manual" });
}

// ---- AI 下書きの生成 / 再調整 ----

type ApiBlock = { start: string; end: string; title: string; kind: PlanKind; source: "ai" };

export type PlanResult = { ok: true } | { ok: false; error: string };

/** AI に渡すタスクの最小形。PlanItem も時間割由来の固定予定もこの形で渡す。 */
export type PlanItemInput = {
  title: string;
  kind: PlanKind;
  estMinutes: number | null;
  fixedTime: string | null;
};

/** タスク素材（＋時間割の固定予定）から1日の下書きを生成し、その日のブロックを置き換える。 */
export async function generatePlan(
  date: DateKey,
  wake: string,
  sleep: string,
  items: PlanItemInput[],
): Promise<PlanResult> {
  return callPlan(date, {
    mode: "generate",
    wake,
    sleep,
    items: items.map(toApiItem),
  });
}

/** 完了済みは残し、未完了ぶんを指示に沿って組み直す。 */
export async function reschedulePlan(
  date: DateKey,
  wake: string,
  sleep: string,
  blocks: PlanBlock[],
  instruction: string,
): Promise<PlanResult> {
  const done = blocks.filter((b) => b.done);
  const remaining = blocks.filter((b) => !b.done);
  const res = await callPlan(date, {
    mode: "reschedule",
    wake,
    sleep,
    instruction,
    done: done.map((b) => ({ start: b.start, end: b.end, title: b.title, kind: b.kind })),
    items: remaining.map((b) => ({ title: b.title, kind: b.kind, estMinutes: null, fixedTime: null })),
  });
  return res;
}

function toApiItem(it: PlanItemInput) {
  return { title: it.title, kind: it.kind, estMinutes: it.estMinutes, fixedTime: it.fixedTime };
}

async function callPlan(date: DateKey, payload: Record<string, unknown>): Promise<PlanResult> {
  let res: Response;
  try {
    res = await fetch("/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: "通信に失敗しました。オフラインの可能性があります。" };
  }
  const data = (await res.json().catch(() => ({}))) as { blocks?: ApiBlock[]; error?: string };
  if (!res.ok || !Array.isArray(data.blocks)) {
    return { ok: false, error: data.error ?? "生成に失敗しました。" };
  }
  await replacePlanBlocks(
    date,
    data.blocks.map((b) => ({
      start: b.start,
      end: b.end,
      title: b.title,
      kind: b.kind,
      done: false,
      source: "ai" as const,
    })),
  );
  return { ok: true };
}

// ---- 集計（達成率・カテゴリ別） ----

export interface PlanStats {
  total: number;
  done: number;
  rate: number; // 0〜1
  byKind: Record<PlanKind, { total: number; done: number }>;
}

export function planStats(blocks: PlanBlock[]): PlanStats {
  const byKind = Object.fromEntries(
    PLAN_KINDS.map((k) => [k, { total: 0, done: 0 }]),
  ) as PlanStats["byKind"];
  let done = 0;
  for (const b of blocks) {
    const k = normalizePlanKind(b.kind);
    byKind[k].total++;
    if (b.done) {
      byKind[k].done++;
      done++;
    }
  }
  return { total: blocks.length, done, rate: blocks.length ? done / blocks.length : 0, byKind };
}

// ---- 「いま / 次」の判定（現在時刻ベース） ----

export interface NowNext {
  current: PlanBlock | null;
  next: PlanBlock | null;
}

/** 現在時刻に該当する（進行中の）ブロックと、次に来る未完了ブロックを返す。 */
export function nowNext(blocks: PlanBlock[], now = new Date()): NowNext {
  const mins = now.getHours() * 60 + now.getMinutes();
  const sorted = sortByStart([...blocks]);
  let current: PlanBlock | null = null;
  let next: PlanBlock | null = null;
  for (const b of sorted) {
    const s = toMinutes(b.start);
    const e = toMinutes(b.end);
    if (s == null || e == null) continue;
    if (mins >= s && mins < e && !b.done) current = b;
    if (s > mins && !b.done && next == null) next = b;
  }
  return { current, next };
}

// ---- 内部ユーティリティ ----

function sortByOrder<T extends { order: number }>(rows: T[]): T[] {
  return rows.sort((a, b) => a.order - b.order);
}

/** orderBy は非インデックス列で例外を投げるため、start は必ず JS 側でソートする。 */
function sortByStart(rows: PlanBlock[]): PlanBlock[] {
  return rows.sort((a, b) => (toMinutes(a.start) ?? 0) - (toMinutes(b.start) ?? 0));
}

export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (mm > 59 || h > 24 || (h === 24 && mm !== 0)) return null;
  return h * 60 + mm;
}

export const todayPlanDate = (): DateKey => todayKey();
