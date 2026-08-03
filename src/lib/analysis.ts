"use client";

import { db, getAnalysis, getEntry, hashBody } from "./db";
import { MIN_CHARS, type DateKey, type EmotionScores } from "./types";

/**
 * 感情分析の実行とキュー管理（仕様書 §3.3 / §2 オフライン要件）。
 *
 * 分析はネットワークを要するため、失敗しても日記の保存は絶対に妨げない。
 * 失敗分は analysisJobs に積み、オンライン復帰時・次回起動時に再試行する。
 */

interface AnalyzeResponse {
  sentimentScore: number;
  labels: EmotionScores;
  keywords: string[];
  model: string;
  promptVersion: string;
}

/**
 * 指定日を分析して保存する。
 * @param force true なら本文が変わっていなくても再解析する（モデル更新後の再解析用）。
 */
export async function analyzeDate(date: DateKey, force = false): Promise<"done" | "skipped" | "failed"> {
  const entry = await getEntry(date);
  if (!entry?.id || entry.charCount < MIN_CHARS) return "skipped";

  const bodyHash = hashBody(entry.body);
  const existing = await getAnalysis(date);
  if (!force && existing && existing.bodyHash === bodyHash) return "skipped";

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: entry.body }),
    });

    if (!res.ok) {
      const { error } = (await res.json().catch(() => ({ error: null }))) as { error?: string };
      await queueJob(date, bodyHash, error ?? `HTTP ${res.status}`);
      return "failed";
    }

    const r = (await res.json()) as AnalyzeResponse;

    await db.transaction("rw", db.analyses, db.analysisJobs, async () => {
      // 1日1件。再解析時は差し替える。
      await db.analyses.where("date").equals(date).delete();
      await db.analyses.add({
        entryId: entry.id!,
        date,
        sentimentScore: r.sentimentScore,
        labels: r.labels,
        keywords: r.keywords,
        model: r.model,
        promptVersion: r.promptVersion,
        bodyHash,
        analyzedAt: Date.now(),
      });
      await db.analysisJobs.delete(date);
    });

    return "done";
  } catch (e) {
    await queueJob(date, bodyHash, e instanceof Error ? e.message : "不明なエラー");
    return "failed";
  }
}

async function queueJob(date: DateKey, bodyHash: string, message: string) {
  const prev = await db.analysisJobs.get(date);
  await db.analysisJobs.put({
    date,
    status: navigator.onLine ? "error" : "pending",
    bodyHash,
    lastError: message,
    attempts: (prev?.attempts ?? 0) + 1,
    updatedAt: Date.now(),
  });
}

/** 未分析・失敗分をまとめて再試行する。起動時とオンライン復帰時に呼ぶ。 */
export async function drainQueue(limit = 5): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;

  const jobs = await db.analysisJobs.toArray();
  let done = 0;
  for (const job of jobs.slice(0, limit)) {
    // 試行を重ねた分は間隔を空ける（1分 × 試行回数、最大30分）。
    const backoff = Math.min(job.attempts, 30) * 60_000;
    if (Date.now() - job.updatedAt < backoff) continue;
    if ((await analyzeDate(job.date)) === "done") done++;
  }
  return done;
}

/** 本文はあるが分析がまだ無い日を拾ってキューに積む（分析機能を後から有効化した場合の遡り適用）。 */
export async function backfillMissing(limit = 20): Promise<number> {
  const entries = await db.entries.toArray();
  const analyzed = new Set((await db.analyses.toArray()).map((a) => a.date));
  const targets = entries
    .filter((e) => e.charCount >= MIN_CHARS && !analyzed.has(e.date))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);

  let done = 0;
  for (const e of targets) {
    if ((await analyzeDate(e.date)) === "done") done++;
  }
  return done;
}
