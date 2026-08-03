"use client";

import { db } from "./db";
import type { Goal, GoalLevel } from "./types";

/**
 * 目標（仕様書 §3.6）のクライアント側。分解は AI ではなく人間が行う。
 * 木構造は goals テーブルに parentId / rootId で持ち、上（抽象）から下（具体）へ
 * 自分の言葉で落とし込んでいく。Lv4 の完了で上位ノードの進捗率が自動更新される。
 */

/** 大目標（Lv1）を作る。以降は addGoalChild で人間が具体化していく。 */
export async function createRootGoal(title: string): Promise<number> {
  const t = title.trim();
  if (!t) return -1;
  const now = Date.now();
  return db.transaction("rw", db.goals, async () => {
    const rootId = (await db.goals.add({
      parentId: null,
      rootId: null,
      level: 1,
      title: t.slice(0, 200),
      status: "todo",
      dueDate: null,
      progress: 0,
      order: await db.goals.where("level").equals(1).count(),
      source: "manual",
      createdAt: now,
      updatedAt: now,
    })) as number;
    await db.goals.update(rootId, { rootId });
    return rootId;
  });
}

/** 葉（Lv3）の完了状態を切り替え、祖先の進捗を再計算する。 */
export async function toggleGoal(goal: Goal) {
  if (goal.id == null) return;
  const status = goal.status === "done" ? "todo" : "done";
  await db.transaction("rw", db.goals, async () => {
    await db.goals.update(goal.id!, { status, progress: status === "done" ? 1 : 0, updatedAt: Date.now() });
    if (goal.rootId != null) await recomputeTree(goal.rootId);
  });
}

/**
 * 木全体の進捗を葉から積み上げて再計算する。
 * 葉（子を持たないノード）は status から、枝は子の progress 平均から決める。
 */
async function recomputeTree(rootId: number) {
  const nodes = await db.goals.where("rootId").equals(rootId).toArray();
  const byParent = new Map<number | null, Goal[]>();
  for (const n of nodes) {
    const key = n.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(n);
  }

  const compute = (node: Goal): number => {
    const children = byParent.get(node.id ?? null) ?? [];
    const progress = children.length
      ? children.reduce((s, c) => s + compute(c), 0) / children.length
      : node.status === "done"
        ? 1
        : 0;
    node.progress = progress;
    return progress;
  };

  const root = nodes.find((n) => n.id === rootId);
  if (root) compute(root);

  await Promise.all(
    nodes.map((n) =>
      db.goals.update(n.id!, {
        progress: n.progress,
        // 葉は完了で done。枝は進捗100%で done 扱いにして表示を揃える。
        status: n.progress >= 1 ? "done" : "todo",
      }),
    ),
  );
}

export async function updateGoalTitle(id: number, title: string) {
  const t = title.trim();
  if (!t) return;
  await db.goals.update(id, { title: t.slice(0, 60), source: "manual", updatedAt: Date.now() });
}

/** ノードとその子孫をまとめて削除する。 */
export async function deleteGoalSubtree(goal: Goal) {
  if (goal.id == null) return;
  await db.transaction("rw", db.goals, async () => {
    const all = goal.rootId != null ? await db.goals.where("rootId").equals(goal.rootId).toArray() : [goal];
    const toDelete = new Set<number>();
    const collect = (id: number) => {
      toDelete.add(id);
      for (const c of all.filter((n) => n.parentId === id)) if (c.id != null) collect(c.id);
    };
    collect(goal.id!);
    await db.goals.bulkDelete([...toDelete]);
    if (goal.rootId != null && !toDelete.has(goal.rootId)) await recomputeTree(goal.rootId);
  });
}

/** 手動で子タスクを追加する。 */
export async function addGoalChild(parent: Goal, title: string) {
  const t = title.trim();
  if (!t || parent.id == null || parent.level >= 3) return;
  const now = Date.now();
  const siblings = await db.goals.where("parentId").equals(parent.id).count();
  await db.transaction("rw", db.goals, async () => {
    await db.goals.add({
      parentId: parent.id!,
      rootId: parent.rootId ?? parent.id!,
      level: (parent.level + 1) as GoalLevel,
      title: t.slice(0, 60),
      status: "todo",
      dueDate: null,
      progress: 0,
      order: siblings,
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });
    if (parent.rootId != null) await recomputeTree(parent.rootId);
  });
}