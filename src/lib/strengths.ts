"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { addDays, todayKey } from "./date";
import {
  EMOTION_LABELS,
  EMOTION_LABEL_JA,
  TASK_CATEGORY_JA,
  type DateKey,
  type Strength,
  type TaskCategory,
} from "./types";

/**
 * 就活の自己分析（強み仮説）のクライアントロジック。
 * 蓄積した日記＋感情分析＋活動分類から候補を作り、AI に強みを抽出させ、
 * 根拠（実在の日記日付）つきで保存する。すべて人間が編集できる。
 */

const WINDOW_DAYS = 180; // 直近この日数の記録を材料にする
const MAX_ITEMS = 40; // AI に渡す最大件数（トークン抑制）
export const MIN_CANDIDATES = 3; // これ未満だと抽出しない

export function useStrengths(): Strength[] | undefined {
  return useLiveQuery(() => db.strengths.orderBy("id").reverse().toArray(), []);
}

interface Candidate {
  date: DateKey;
  text: string;
  meta: string;
}

/** 分析済みの日記を新しい順に集め、AI に渡す要約群を作る。 */
export async function gatherCandidates(refDate: DateKey = todayKey()): Promise<Candidate[]> {
  const from = addDays(refDate, -(WINDOW_DAYS - 1));
  const [entries, analyses, tasks] = await Promise.all([
    db.entries.where("date").between(from, refDate, true, true).toArray(),
    db.analyses.where("date").between(from, refDate, true, true).toArray(),
    db.tasks.where("date").between(from, refDate, true, true).toArray(),
  ]);

  const analysisByDate = new Map(analyses.map((a) => [a.date, a]));
  const catsByDate = new Map<string, Set<TaskCategory>>();
  for (const t of tasks) {
    if (!catsByDate.has(t.date)) catsByDate.set(t.date, new Set());
    catsByDate.get(t.date)!.add(t.category);
  }

  return entries
    .filter((e) => e.charCount > 0 && analysisByDate.has(e.date))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_ITEMS)
    .map((e) => {
      const a = analysisByDate.get(e.date)!;
      const labels = EMOTION_LABELS.filter((l) => a.labels[l] >= 0.3)
        .sort((x, y) => a.labels[y] - a.labels[x])
        .map((l) => EMOTION_LABEL_JA[l]);
      const cats = [...(catsByDate.get(e.date) ?? [])].map((c) => TASK_CATEGORY_JA[c]);
      const metaParts = [
        `感情${a.sentimentScore >= 0 ? "+" : ""}${a.sentimentScore.toFixed(1)}`,
        labels.length ? labels.join("・") : "",
        cats.length ? cats.join("・") : "",
      ].filter(Boolean);
      return {
        date: e.date,
        text: e.body.replace(/\s+/g, " ").trim().slice(0, 140),
        meta: metaParts.join(" / "),
      };
    });
}

export type StrengthsResult = { ok: true; added: number } | { ok: false; error: string };

/** 候補を集めて AI に強みを抽出させ、既存にない題名のものを保存する。 */
export async function generateStrengths(refDate: DateKey = todayKey()): Promise<StrengthsResult> {
  const candidates = await gatherCandidates(refDate);
  if (candidates.length < MIN_CANDIDATES) {
    return { ok: false, error: "強みを出すには記録がまだ足りません。分析済みの日記をもう少し貯めましょう。" };
  }

  let res: Response;
  try {
    res = await fetch("/api/strengths", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: candidates }),
    });
  } catch {
    return { ok: false, error: "通信に失敗しました。オフラインの可能性があります。" };
  }
  const data = (await res.json().catch(() => ({}))) as {
    strengths?: { title: string; summary: string; evidence: string[] }[];
    error?: string;
  };
  if (!res.ok || !Array.isArray(data.strengths)) {
    return { ok: false, error: data.error ?? "抽出に失敗しました。" };
  }

  const existing = new Set((await db.strengths.toArray()).map((s) => s.title));
  const now = Date.now();
  let added = 0;
  for (const s of data.strengths) {
    if (existing.has(s.title)) continue;
    await db.strengths.add({
      title: s.title,
      summary: s.summary,
      evidence: s.evidence,
      source: "ai",
      createdAt: now,
      updatedAt: now,
    });
    existing.add(s.title);
    added++;
  }
  return { ok: true, added };
}

export async function addManualStrength(title: string, summary: string): Promise<void> {
  const t = title.trim();
  if (!t) return;
  const now = Date.now();
  await db.strengths.add({ title: t, summary: summary.trim(), evidence: [], source: "manual", createdAt: now, updatedAt: now });
}

export async function updateStrength(id: number, patch: Partial<Strength>): Promise<void> {
  await db.strengths.update(id, { ...patch, updatedAt: Date.now() });
}

export async function removeStrength(id: number): Promise<void> {
  await db.strengths.delete(id);
}

/** 根拠の日付を1つ外す（誤った裏付けを人が消せる）。 */
export async function removeEvidence(s: Strength, date: DateKey): Promise<void> {
  if (s.id == null) return;
  await db.strengths.update(s.id, {
    evidence: s.evidence.filter((d) => d !== date),
    updatedAt: Date.now(),
  });
}
