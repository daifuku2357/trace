"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { addManualTask, classifyDate, correctTaskCategory, deleteTask } from "@/lib/tasks";
import { TASK_CATEGORIES, TASK_CATEGORY_JA, type DateKey, type Task, type TaskCategory } from "@/lib/types";
import CategoryTag from "./CategoryTag";

/**
 * メインタスク分類の表示・編集（仕様書 §3.7）。
 * 本文からの自動抽出（auto）とユーザーの追加（manual）を一覧し、カテゴリ修正・削除ができる。
 */
export default function TaskPanel({
  date,
  canClassify,
  onBeforeClassify,
}: {
  date: DateKey;
  canClassify: boolean;
  onBeforeClassify: () => Promise<void>;
}) {
  const tasks = useLiveQuery(
    () => db.tasks.where("date").equals(date).sortBy("order"),
    [date],
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await onBeforeClassify();
      const r = await classifyDate(date, (tasks?.length ?? 0) > 0);
      if (r === "failed") setError("分類できませんでした。オフラインか、APIキーが未設定の可能性があります。");
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="rule-t py-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-wider text-ink-2">今日の主活動</h2>
        <div className="flex gap-1">
          <button
            type="button"
            className="btn !px-2 !py-1 !text-xs"
            disabled={!canClassify || running}
            onClick={() => void run()}
          >
            {running ? "分類中…" : tasks?.length ? "再分類" : "自動分類"}
          </button>
          <button
            type="button"
            className="btn !px-2 !py-1 !text-xs"
            disabled={!canClassify}
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? "閉じる" : "追加"}
          </button>
        </div>
      </div>

      {error && <p className="mt-2 border-l-2 border-ai pl-2 text-xs text-ink-2">{error}</p>}

      {adding && <AddTaskForm date={date} onDone={() => setAdding(false)} />}

      {tasks && tasks.length > 0 ? (
        <ul className="mt-2 divide-y divide-rule">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      ) : (
        !adding && (
          <p className="mt-2 text-xs text-ink-3">
            {canClassify
              ? "入力が落ち着くと、その日の主な活動を自動で1〜3件に分類します。"
              : "本文が10字以上になると分類できます。"}
          </p>
        )
      )}
    </section>
  );
}

function TaskRow({ task }: { task: Task }) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="flex items-center gap-2 py-1.5">
      {editing ? (
        <select
          autoFocus
          value={task.category}
          onChange={(e) => {
            void correctTaskCategory(task, e.target.value as TaskCategory);
            setEditing(false);
          }}
          onBlur={() => setEditing(false)}
          className="border border-ai bg-paper px-1 py-0.5 text-xs"
          aria-label="カテゴリを変更"
        >
          {TASK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {TASK_CATEGORY_JA[c]}
            </option>
          ))}
        </select>
      ) : (
        <button type="button" onClick={() => setEditing(true)} title="カテゴリを修正" className="shrink-0">
          <CategoryTag category={task.category} />
        </button>
      )}

      <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>

      {task.source === "auto" && <span className="shrink-0 text-[10px] text-ink-3">AI</span>}

      <button
        type="button"
        onClick={() => task.id != null && void deleteTask(task.id)}
        aria-label="削除"
        className="shrink-0 px-1 text-xs text-ink-3 hover:text-ink"
      >
        ×
      </button>
    </li>
  );
}

function AddTaskForm({ date, onDone }: { date: DateKey; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>("study");

  const submit = () => {
    if (!title.trim()) return;
    void addManualTask(date, title, category).then(onDone);
  };

  return (
    <div className="mt-2 flex gap-1 border border-rule p-2">
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as TaskCategory)}
        className="shrink-0 border border-rule bg-paper px-1 text-xs"
        aria-label="カテゴリ"
      >
        {TASK_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {TASK_CATEGORY_JA[c]}
          </option>
        ))}
      </select>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
        placeholder="活動を追加"
        className="min-w-0 flex-1 border border-rule bg-paper px-2 py-1 text-sm outline-none focus:border-ai"
      />
      <button type="button" className="btn btn-primary !px-2 !py-1 !text-xs" onClick={submit}>
        追加
      </button>
    </div>
  );
}
