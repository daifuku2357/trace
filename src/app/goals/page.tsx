"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { createRootGoal } from "@/lib/goals";
import type { Goal } from "@/lib/types";
import GoalTree from "@/components/GoalTree";

/**
 * 目標タブ（仕様書 §3.6）。分解は人間が行う。
 * 大きな目標を書く → 「3ヶ月」「今週」「今日15分」と問いに答えながら、
 * 抽象から具体へ自分の言葉で落とし込んでいく設計。
 */
export default function GoalsPage() {
  // order は未インデックスのため取得後に JS でソートする。
  const goals = useLiveQuery(
    () => db.goals.toArray().then((g) => g.sort((a, b) => a.order - b.order)),
    [],
  );
  const [input, setInput] = useState("");

  const roots = (goals ?? []).filter((g) => g.level === 1);
  const treeFor = (rootId: number) => (goals ?? []).filter((g) => g.rootId === rootId);

  const add = async () => {
    if (!input.trim()) return;
    await createRootGoal(input);
    setInput("");
  };

  return (
    <div className="space-y-5">
      <section>
        <h1 className="rule-b pb-2 text-sm font-bold tracking-wider">大きな目標を書く</h1>
        <div className="pt-3">
          <Ladder />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="まずは漠然とした願いで構いません（例: エンジニアとして納得のいく就職をする）"
            rows={2}
            className="mt-3 w-full resize-y border border-rule bg-paper p-2 text-sm outline-none placeholder:text-ink-3 focus:border-ai"
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[11px] text-ink-3">書いてから、少しずつ具体にしていきます。</p>
            <button className="btn btn-primary" disabled={!input.trim()} onClick={() => void add()}>
              追加する
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="rule-b pb-2 text-sm font-bold tracking-wider">目標</h2>
        <div className="space-y-4 pt-3">
          {!goals ? (
            <div className="h-24 animate-pulse bg-ai-weak" />
          ) : roots.length === 0 ? (
            <p className="text-sm text-ink-3">
              まだ目標がありません。上の欄に大きな目標を書くところから始めましょう。
            </p>
          ) : (
            roots.map((root: Goal) => <GoalTree key={root.id} goals={treeFor(root.id!)} />)
          )}
        </div>
      </section>
    </div>
  );
}

/** 抽象→具体の4段を示す道しるべ。 */
function Ladder() {
  const steps = ["大目標", "中目標(3ヶ月)", "週次"];
  return (
    <div className="flex items-center gap-1 text-[10px] text-ink-3">
      <span className="shrink-0">抽象</span>
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-1">
          <span className="border border-rule px-1 py-0.5">{s}</span>
          {i < steps.length - 1 && <span aria-hidden>›</span>}
        </span>
      ))}
      <span className="shrink-0">具体</span>
    </div>
  );
}
