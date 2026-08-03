"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { todayKey } from "./date";
import { gatherCandidates, MIN_CANDIDATES } from "./strengths";
import type { DateKey, StarEpisode } from "./types";

/**
 * 就活: STARエピソードのクライアントロジック。
 * 強みと同じ候補（分析済みの日記）を使い、AI に STAR の下書きを作らせ、
 * 根拠（実在の日記日付）つきで保存する。すべて人間が編集できる。
 */

export function useStarEpisodes(): StarEpisode[] | undefined {
  return useLiveQuery(() => db.starEpisodes.orderBy("id").reverse().toArray(), []);
}

export type StarResult = { ok: true; added: number } | { ok: false; error: string };

export async function generateStar(refDate: DateKey = todayKey()): Promise<StarResult> {
  const candidates = await gatherCandidates(refDate);
  if (candidates.length < MIN_CANDIDATES) {
    return { ok: false, error: "エピソードを出すには記録がまだ足りません。分析済みの日記を貯めましょう。" };
  }

  let res: Response;
  try {
    res = await fetch("/api/star", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: candidates }),
    });
  } catch {
    return { ok: false, error: "通信に失敗しました。オフラインの可能性があります。" };
  }
  const data = (await res.json().catch(() => ({}))) as {
    episodes?: Omit<StarEpisode, "id" | "source" | "createdAt" | "updatedAt">[];
    error?: string;
  };
  if (!res.ok || !Array.isArray(data.episodes)) {
    return { ok: false, error: data.error ?? "作成に失敗しました。" };
  }

  const existing = new Set((await db.starEpisodes.toArray()).map((s) => s.title));
  const now = Date.now();
  let added = 0;
  for (const ep of data.episodes) {
    if (existing.has(ep.title)) continue;
    await db.starEpisodes.add({ ...ep, source: "ai", createdAt: now, updatedAt: now });
    existing.add(ep.title);
    added++;
  }
  return { ok: true, added };
}

export async function addManualStar(): Promise<number> {
  const now = Date.now();
  return (await db.starEpisodes.add({
    title: "新しいエピソード",
    situation: "",
    task: "",
    action: "",
    result: "",
    dates: [],
    source: "manual",
    createdAt: now,
    updatedAt: now,
  })) as number;
}

export async function updateStar(id: number, patch: Partial<StarEpisode>): Promise<void> {
  await db.starEpisodes.update(id, { ...patch, updatedAt: Date.now() });
}

export async function removeStar(id: number): Promise<void> {
  await db.starEpisodes.delete(id);
}

export async function removeStarDate(ep: StarEpisode, date: DateKey): Promise<void> {
  if (ep.id == null) return;
  await db.starEpisodes.update(ep.id, { dates: ep.dates.filter((d) => d !== date), updatedAt: Date.now() });
}
