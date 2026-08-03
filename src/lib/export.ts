"use client";

import { db } from "./db";
import { formatLong } from "./date";
import { EMOTION_LABEL_JA, EMOTION_LABELS } from "./types";

/** 日記本文のエクスポート（仕様書 §2 データ要件: Markdown / JSON）。 */

function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportMarkdown() {
  const entries = (await db.entries.toArray()).sort((a, b) => a.date.localeCompare(b.date));
  const analyses = new Map((await db.analyses.toArray()).map((a) => [a.date, a]));

  const body = entries
    .map((e) => {
      const lines = [`## ${formatLong(e.date)}`, ""];
      const meta: string[] = [`${e.charCount}字`];
      if (e.moodManual) meta.push(`気分 ${e.moodManual}/5`);
      if (e.tags.length) meta.push(e.tags.map((t) => `#${t}`).join(" "));
      lines.push(`> ${meta.join(" ・ ")}`, "", e.body.trim(), "");

      const a = analyses.get(e.date);
      if (a) {
        const top = EMOTION_LABELS.filter((l) => a.labels[l] >= 0.3)
          .sort((x, y) => a.labels[y] - a.labels[x])
          .map((l) => `${EMOTION_LABEL_JA[l]} ${a.labels[l].toFixed(2)}`);
        lines.push(
          `<!-- 分析: 感情 ${a.sentimentScore.toFixed(2)} / ${top.join(", ") || "該当なし"} / キーワード: ${a.keywords.join("、")} / ${a.model} ${a.promptVersion} -->`,
          "",
        );
      }
      return lines.join("\n");
    })
    .join("\n---\n\n");

  download(`trace-${stamp()}.md`, `# Trace 日記エクスポート\n\n${body}`, "text/markdown");
}

export async function exportJson() {
  const [entries, analyses, tasks, goals, focusSessions, planItems, planBlocks, recurringEvents, dailyHabits, strengths, starEpisodes] =
    await Promise.all([
      db.entries.toArray(),
      db.analyses.toArray(),
      db.tasks.toArray(),
      db.goals.toArray(),
      db.focusSessions.toArray(),
      db.planItems.toArray(),
      db.planBlocks.toArray(),
      db.recurringEvents.toArray(),
      db.dailyHabits.toArray(),
      db.strengths.toArray(),
      db.starEpisodes.toArray(),
    ]);
  const payload = {
    app: "trace",
    schemaVersion: 9,
    exportedAt: new Date().toISOString(),
    // 本文と分析結果は分離したまま出力する（再解析可能性を保つため）。
    entries: entries.sort((a, b) => a.date.localeCompare(b.date)),
    analyses: analyses.sort((a, b) => a.date.localeCompare(b.date)),
    tasks,
    goals,
    focusSessions: focusSessions.sort((a, b) => a.startedAt - b.startedAt),
    // 「今日の組み立て」。日付単位で独立しているため id を落として日付ごとに入れ直す。
    planItems,
    planBlocks,
    // 時間割（毎週の固定予定）と毎日の習慣。
    recurringEvents,
    dailyHabits,
    // 就活: 強み仮説・STARエピソード（根拠は日記の日付なので端末間でそのまま使える）。
    strengths,
    starEpisodes,
    // settings は実行中タイマー等の一時状態のみのためエクスポートしない。
  };
  download(`trace-${stamp()}.json`, JSON.stringify(payload, null, 2), "application/json");
}

export interface ImportResult {
  entries: number;
  analyses: number;
  tasks: number;
  goals: number;
  focus: number;
  plan: number;
  recurring: number;
  habit: number;
  strength: number;
  star: number;
}

/**
 * エクスポートした JSON を読み戻す。同じ日付は上書きする。
 * entryId / goal の parentId・rootId は端末間で不変ではないため、取り込み時に貼り直す。
 */
export async function importJson(file: File): Promise<ImportResult> {
  const raw = JSON.parse(await file.text()) as {
    app?: string;
    entries?: unknown;
    analyses?: unknown;
    tasks?: unknown;
    goals?: unknown;
    focusSessions?: unknown;
    planItems?: unknown;
    planBlocks?: unknown;
    recurringEvents?: unknown;
    dailyHabits?: unknown;
    strengths?: unknown;
    starEpisodes?: unknown;
  };
  if (raw.app !== "trace" || !Array.isArray(raw.entries)) {
    throw new Error("Trace のエクスポートファイルではありません。");
  }

  const result: ImportResult = { entries: 0, analyses: 0, tasks: 0, goals: 0, focus: 0, plan: 0, recurring: 0, habit: 0, strength: 0, star: 0 };

  await db.transaction(
    "rw",
    [db.entries, db.analyses, db.tasks, db.goals, db.focusSessions, db.planItems, db.planBlocks, db.recurringEvents, db.dailyHabits, db.strengths, db.starEpisodes],
    async () => {
    for (const e of raw.entries as Record<string, unknown>[]) {
      if (typeof e.date !== "string" || typeof e.body !== "string") continue;
      const existing = await db.entries.where("date").equals(e.date).first();
      const { id: _id, ...rest } = e as Record<string, unknown> & { id?: number };
      const record = { ...rest, date: e.date, body: e.body } as never;
      if (existing?.id != null) {
        await db.entries.update(existing.id, record);
      } else {
        await db.entries.add(record);
      }
      result.entries++;
    }

    if (Array.isArray(raw.analyses)) {
      for (const a of raw.analyses as Record<string, unknown>[]) {
        if (typeof a.date !== "string") continue;
        const entry = await db.entries.where("date").equals(a.date).first();
        if (!entry?.id) continue;
        await db.analyses.where("date").equals(a.date).delete();
        const { id: _id, ...rest } = a as Record<string, unknown> & { id?: number };
        await db.analyses.add({ ...rest, entryId: entry.id } as never);
        result.analyses++;
      }
    }

    // タスクは date から entryId を貼り直す。取り込む日付の自動タスクは一旦消して重複を防ぐ。
    if (Array.isArray(raw.tasks)) {
      const dates = new Set(
        (raw.tasks as Record<string, unknown>[]).map((t) => t.date).filter((d): d is string => typeof d === "string"),
      );
      for (const d of dates) await db.tasks.where("date").equals(d).delete();
      for (const t of raw.tasks as Record<string, unknown>[]) {
        if (typeof t.date !== "string") continue;
        const entry = await db.entries.where("date").equals(t.date).first();
        if (!entry?.id) continue;
        const { id: _id, ...rest } = t as Record<string, unknown> & { id?: number };
        await db.tasks.add({ ...rest, entryId: entry.id } as never);
        result.tasks++;
      }
    }

    // 目標は木構造。旧id→新idの対応を作りながら、親が先に入るよう level 順で追加する。
    if (Array.isArray(raw.goals)) {
      const goals = (raw.goals as Record<string, unknown>[])
        .filter((g) => typeof g.id === "number")
        .sort((a, b) => (a.level as number) - (b.level as number));
      const idMap = new Map<number, number>();
      for (const g of goals) {
        const oldId = g.id as number;
        const { id: _id, ...rest } = g as Record<string, unknown> & { id?: number };
        const parentId = g.parentId == null ? null : idMap.get(g.parentId as number) ?? null;
        const rootId = g.rootId == null ? null : idMap.get(g.rootId as number) ?? null;
        const newId = (await db.goals.add({ ...rest, parentId, rootId } as never)) as number;
        idMap.set(oldId, newId);
        // Lv1 は rootId が自分自身。追加後に貼り直す。
        if (g.level === 1) await db.goals.update(newId, { rootId: newId } as never);
        result.goals++;
      }
    }

      // 集中セッションは独立レコード。日付の一致だけで重複判定するのは難しいため、
      // startedAt が同じものを重複とみなしてスキップする。
      if (Array.isArray(raw.focusSessions)) {
        const existingStarts = new Set((await db.focusSessions.toArray()).map((s) => s.startedAt));
        for (const s of raw.focusSessions as Record<string, unknown>[]) {
          if (typeof s.date !== "string" || typeof s.minutes !== "number") continue;
          if (typeof s.startedAt === "number" && existingStarts.has(s.startedAt)) continue;
          const { id: _id, ...rest } = s as Record<string, unknown> & { id?: number };
          await db.focusSessions.add(rest as never);
          result.focus++;
        }
      }

      // 「今日の組み立て」は日付単位で独立。取り込む日付のぶんを一旦消してから入れ直す。
      for (const [table, rows] of [
        [db.planItems, raw.planItems],
        [db.planBlocks, raw.planBlocks],
      ] as const) {
        if (!Array.isArray(rows)) continue;
        const records = rows as Record<string, unknown>[];
        const dates = new Set(records.map((r) => r.date).filter((d): d is string => typeof d === "string"));
        for (const d of dates) await table.where("date").equals(d).delete();
        for (const r of records) {
          if (typeof r.date !== "string") continue;
          const { id: _id, ...rest } = r as Record<string, unknown> & { id?: number };
          await table.add(rest as never);
          result.plan++;
        }
      }

      // 時間割（毎週の固定予定）。曜日+時刻+名称+期末が同じものは重複とみなしスキップ。
      if (Array.isArray(raw.recurringEvents)) {
        const existing = await db.recurringEvents.toArray();
        const key = (e: Record<string, unknown>) =>
          `${e.weekday}|${e.start}|${e.end}|${e.title}|${e.untilDate}`;
        const seen = new Set(existing.map((e) => key(e as unknown as Record<string, unknown>)));
        for (const r of raw.recurringEvents as Record<string, unknown>[]) {
          if (typeof r.weekday !== "number" || typeof r.start !== "string") continue;
          if (seen.has(key(r))) continue;
          const { id: _id, ...rest } = r as Record<string, unknown> & { id?: number };
          await db.recurringEvents.add(rest as never);
          seen.add(key(r));
          result.recurring++;
        }
      }

      // 毎日の習慣。同名は重複とみなしスキップ。
      if (Array.isArray(raw.dailyHabits)) {
        const seen = new Set((await db.dailyHabits.toArray()).map((h) => h.title));
        for (const r of raw.dailyHabits as Record<string, unknown>[]) {
          if (typeof r.title !== "string" || seen.has(r.title)) continue;
          const { id: _id, ...rest } = r as Record<string, unknown> & { id?: number };
          await db.dailyHabits.add(rest as never);
          seen.add(r.title);
          result.habit++;
        }
      }

      // 就活の強み仮説。同じ題名は重複とみなしスキップ。
      if (Array.isArray(raw.strengths)) {
        const seen = new Set((await db.strengths.toArray()).map((s) => s.title));
        for (const r of raw.strengths as Record<string, unknown>[]) {
          if (typeof r.title !== "string" || seen.has(r.title)) continue;
          if (!Array.isArray(r.evidence)) r.evidence = [];
          const { id: _id, ...rest } = r as Record<string, unknown> & { id?: number };
          await db.strengths.add(rest as never);
          seen.add(r.title);
          result.strength++;
        }
      }

      // 就活の STAR エピソード。同じ題名は重複とみなしスキップ。
      if (Array.isArray(raw.starEpisodes)) {
        const seen = new Set((await db.starEpisodes.toArray()).map((s) => s.title));
        for (const r of raw.starEpisodes as Record<string, unknown>[]) {
          if (typeof r.title !== "string" || seen.has(r.title)) continue;
          if (!Array.isArray(r.dates)) r.dates = [];
          const { id: _id, ...rest } = r as Record<string, unknown> & { id?: number };
          await db.starEpisodes.add(rest as never);
          seen.add(r.title);
          result.star++;
        }
      }
    },
  );

  return result;
}
