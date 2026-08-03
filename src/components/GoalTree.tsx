"use client";

import { useState } from "react";
import {
  addGoalChild,
  deleteGoalSubtree,
  toggleGoal,
  updateGoalTitle,
} from "@/lib/goals";
import { GOAL_LEVEL_JA, type Goal } from "@/lib/types";

/**
 * 目標分解の木表示（仕様書 §3.6）。最小の段は週次（Lv3）。
 * Lv3 のチェックで上位の進捗が自動更新される。全ノードが手動編集・削除・追加できる。
 */
export default function GoalTree({ goals }: { goals: Goal[] }) {
  const root = goals.find((g) => g.level === 1);
  if (!root) return null;

  const childrenOf = (id: number) =>
    goals.filter((g) => g.parentId === id).sort((a, b) => a.order - b.order);

  return (
    <div className="border border-rule">
      <RootHeader root={root} />
      <ul>
        {childrenOf(root.id!).map((g) => (
          <GoalNode key={g.id} goal={g} childrenOf={childrenOf} depth={0} />
        ))}
      </ul>
      <AddChild parent={root} emphasize={childrenOf(root.id!).length === 0} />
    </div>
  );
}

function RootHeader({ root }: { root: Goal }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="rule-b bg-ai-weak px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 border border-ai px-1 text-[10px] text-ai">{GOAL_LEVEL_JA[1]}</span>
        {editing ? (
          <TitleEditor
            initial={root.title}
            onDone={(t) => {
              if (t) void updateGoalTitle(root.id!, t);
              setEditing(false);
            }}
          />
        ) : (
          <button onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left text-sm font-bold">
            {root.title}
          </button>
        )}
        <button
          onClick={() => confirm("この目標をまとめて削除しますか？") && void deleteGoalSubtree(root)}
          aria-label="目標を削除"
          className="shrink-0 px-1 text-xs text-ink-3 hover:text-ink"
        >
          ×
        </button>
      </div>
      <ProgressBar value={root.progress} />
    </div>
  );
}

function GoalNode({
  goal,
  childrenOf,
  depth,
}: {
  goal: Goal;
  childrenOf: (id: number) => Goal[];
  depth: number;
}) {
  const [editing, setEditing] = useState(false);
  const kids = childrenOf(goal.id!);
  const isLeaf = goal.level === 3;

  return (
    <li className="rule-b last:border-b-0">
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ paddingLeft: `${0.75 + depth * 1}rem` }}>
        {isLeaf ? (
          <input
            type="checkbox"
            checked={goal.status === "done"}
            onChange={() => void toggleGoal(goal)}
            className="h-4 w-4 shrink-0 accent-ai"
            aria-label={goal.title}
          />
        ) : (
          <span className="num shrink-0 text-[10px] text-ink-3">{Math.round(goal.progress * 100)}%</span>
        )}

        {editing ? (
          <TitleEditor
            initial={goal.title}
            onDone={(t) => {
              if (t) void updateGoalTitle(goal.id!, t);
              setEditing(false);
            }}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className={`min-w-0 flex-1 text-left text-sm ${goal.status === "done" ? "text-ink-3 line-through" : ""}`}
          >
            {goal.title}
            {goal.dueDate && <span className="num ml-2 text-[10px] text-ink-3">{goal.dueDate}</span>}
          </button>
        )}

        <button
          onClick={() => void deleteGoalSubtree(goal)}
          aria-label="削除"
          className="shrink-0 px-1 text-xs text-ink-3 hover:text-ink"
        >
          ×
        </button>
      </div>

      {kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <GoalNode key={k.id} goal={k} childrenOf={childrenOf} depth={depth + 1} />
          ))}
        </ul>
      )}

      {goal.level < 3 && (
        <AddChild parent={goal} depth={depth + 1} emphasize={kids.length === 0} />
      )}
    </li>
  );
}

/**
 * 子レベルごとの「問い」と記入例。抽象→具体への落とし込みを言葉で導く（§3.6）。
 * child level = parent.level + 1。
 */
const GUIDE: Record<2 | 3, { question: string; placeholder: string }> = {
  2: { question: "3ヶ月後、どうなっていたい？", placeholder: "例: ポートフォリオを1本完成させる" },
  3: { question: "今週やることは？", placeholder: "例: 設計を固めて画面を1つ作る" },
};

function AddChild({
  parent,
  depth = 0,
  emphasize = false,
}: {
  parent: Goal;
  depth?: number;
  emphasize?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const childLevel = (parent.level + 1) as 2 | 3;
  const guide = GUIDE[childLevel];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`block px-3 py-1 text-left text-[11px] hover:underline ${
          emphasize ? "text-ai" : "text-ai/80"
        }`}
        style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
      >
        ＋ {guide.question}
        <span className="ml-1 text-ink-3">（{GOAL_LEVEL_JA[childLevel]}）</span>
      </button>
    );
  }

  const submit = () => {
    if (title.trim()) void addGoalChild(parent, title);
    setTitle("");
    setOpen(false);
  };

  return (
    <div className="px-3 py-1.5" style={{ paddingLeft: `${0.75 + depth * 1}rem` }}>
      <div className="mb-1 text-[11px] text-ink-2">{guide.question}</div>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={submit}
        placeholder={guide.placeholder}
        className="w-full border border-rule bg-paper px-2 py-1 text-sm outline-none placeholder:text-ink-3 focus:border-ai"
      />
    </div>
  );
}

function TitleEditor({ initial, onDone }: { initial: string; onDone: (t: string | null) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) onDone(value.trim());
        if (e.key === "Escape") onDone(null);
      }}
      onBlur={() => onDone(value.trim())}
      className="min-w-0 flex-1 border border-ai bg-paper px-1 py-0.5 text-sm outline-none"
    />
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className="h-2 flex-1 border border-rule">
        <span className="block h-full bg-ai" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="num shrink-0 text-[11px] text-ink-2">{Math.round(value * 100)}%</span>
    </div>
  );
}
