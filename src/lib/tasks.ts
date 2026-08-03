"use client";

import { db, getEntry } from "./db";
import { MIN_CHARS, type DateKey, type Task, type TaskCategory } from "./types";

/**
 * メインタスク分類（仕様書 §3.7）のクライアント側。
 * - auto タスクは分類のたびに差し替える。manual タスク（ユーザー追加・修正）は保持する。
 * - カテゴリ修正は categoryCorrections に記録し、次回以降の分類プロンプトに渡す。
 */

/** 分類プロンプトに渡す修正履歴。新しい順。 */
async function recentCorrections() {
  const rows = await db.categoryCorrections.orderBy("correctedAt").reverse().limit(12).toArray();
  return rows.map((c) => ({ title: c.title, from: c.from, to: c.to }));
}

/**
 * 指定日を分類する。
 * @param force true なら既存タスクがあっても再分類する（auto のみ置換）。
 */
export async function classifyDate(date: DateKey, force = false): Promise<"done" | "skipped" | "failed"> {
  const entry = await getEntry(date);
  if (!entry?.id || entry.charCount < MIN_CHARS) return "skipped";

  const existing = await db.tasks.where("date").equals(date).count();
  if (!force && existing > 0) return "skipped";

  try {
    const res = await fetch("/api/classify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: entry.body, corrections: await recentCorrections() }),
    });
    if (!res.ok) return "failed";

    const { tasks } = (await res.json()) as {
      tasks: { title: string; category: TaskCategory }[];
    };

    await db.transaction("rw", db.tasks, async () => {
      // 手動タスクは残し、自動生成分だけ入れ替える。
      const autos = await db.tasks.where("date").equals(date).and((t) => t.source === "auto").primaryKeys();
      await db.tasks.bulkDelete(autos as number[]);
      const manualCount = await db.tasks.where("date").equals(date).count();
      const now = Date.now();
      await db.tasks.bulkAdd(
        tasks.map((t, i) => ({
          entryId: entry.id!,
          date,
          category: t.category,
          title: t.title,
          source: "auto" as const,
          order: manualCount + i,
          createdAt: now,
        })),
      );
    });
    return "done";
  } catch {
    return "failed";
  }
}

export async function addManualTask(date: DateKey, title: string, category: TaskCategory) {
  const entry = await getEntry(date);
  if (!entry?.id || !title.trim()) return;
  const count = await db.tasks.where("date").equals(date).count();
  await db.tasks.add({
    entryId: entry.id,
    date,
    category,
    title: title.trim(),
    source: "manual",
    order: count,
    createdAt: Date.now(),
  });
}

/**
 * カテゴリを修正する。auto だった場合は「以後の分類に反映」するため修正履歴を残す（§3.7）。
 * 修正すると source は manual になり、再分類で消えなくなる。
 */
export async function correctTaskCategory(task: Task, to: TaskCategory) {
  if (task.id == null || task.category === to) return;
  await db.transaction("rw", db.tasks, db.categoryCorrections, async () => {
    await db.tasks.update(task.id!, { category: to, source: "manual" });
    await db.categoryCorrections.add({
      title: task.title,
      from: task.category,
      to,
      correctedAt: Date.now(),
    });
  });
}

export async function deleteTask(id: number) {
  await db.tasks.delete(id);
}
