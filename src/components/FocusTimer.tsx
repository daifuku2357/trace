"use client";

import { useEffect, useState } from "react";
import {
  cancelFocus,
  completeFocus,
  startFocus,
  useActiveFocus,
} from "@/lib/focus";
import { focusXp } from "@/lib/growth";
import { celebrate } from "@/lib/celebrate";
import { FOCUS_PRESETS, TASK_CATEGORIES, TASK_CATEGORY_JA, type TaskCategory } from "@/lib/types";

async function finishFocus() {
  const s = await completeFocus();
  if (s) {
    celebrate({
      kind: "focus",
      title: `集中 ${s.minutes}分を記録`,
      detail: `+${focusXp(s.minutes)} XP`,
      big: s.minutes >= 25,
    });
  }
}

/**
 * 集中タイマー。開始時刻を settings に保存するため、
 * リロードやタブ移動をまたいでも経過時間が復元される。
 */
export default function FocusTimer() {
  const active = useActiveFocus();
  const [category, setCategory] = useState<TaskCategory>("study");
  const [target, setTarget] = useState<number>(FOCUS_PRESETS[0]);
  const [now, setNow] = useState(() => Date.now());

  // 実行中は1秒ごとに現在時刻を更新して経過を表示する。
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  if (active) {
    const elapsedSec = Math.max(0, Math.floor((now - active.startedAt) / 1000));
    const elapsedMin = Math.floor(elapsedSec / 60);
    const reached = active.targetMinutes > 0 && elapsedMin >= active.targetMinutes;
    const remainSec =
      active.targetMinutes > 0 ? Math.max(0, active.targetMinutes * 60 - elapsedSec) : null;

    return (
      <div className="border border-ai">
        <div className="rule-b flex items-center gap-2 bg-ai-weak px-3 py-2">
          <span className="text-[10px] font-bold tracking-wider text-ai">集中中</span>
          <span className="text-sm">{TASK_CATEGORY_JA[active.category]}</span>
          {active.targetMinutes > 0 && (
            <span className="num ml-auto text-[11px] text-ink-2">目標 {active.targetMinutes}分</span>
          )}
        </div>

        <div className="px-3 py-5 text-center">
          <div className="num text-4xl font-bold tabular-nums">
            {reached
              ? `${active.targetMinutes}:00`
              : remainSec !== null
                ? fmtClock(remainSec)
                : fmtClock(elapsedSec)}
          </div>
          <div className="mt-1 text-[11px] text-ink-3">
            {reached
              ? "目標達成。区切りのいいところで完了しましょう。"
              : remainSec !== null
                ? `経過 ${elapsedMin}分 / 残り`
                : "経過時間（ストップウォッチ）"}
          </div>
        </div>

        <div className="rule-t flex divide-x divide-rule">
          <button
            onClick={() => void finishFocus()}
            className="flex-1 bg-grow py-2.5 text-sm font-bold text-paper hover:bg-grow-ink active:scale-[0.99]"
          >
            完了して記録（{elapsedMin}分）
          </button>
          <button
            onClick={() => void cancelFocus()}
            className="shrink-0 px-4 py-2.5 text-sm text-ink-2 hover:bg-ai-weak"
          >
            中止
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-rule">
      <div className="rule-b px-3 py-2">
        <span className="text-xs font-bold tracking-wider text-ink-2">集中を始める</span>
      </div>

      <div className="space-y-3 px-3 py-3">
        <div>
          <div className="mb-1 text-[11px] text-ink-3">カテゴリ</div>
          <div className="flex flex-wrap gap-1">
            {TASK_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`border px-2 py-1 text-xs ${
                  category === c ? "border-ai bg-ai text-paper" : "border-rule hover:bg-ai-weak"
                }`}
              >
                {TASK_CATEGORY_JA[c]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[11px] text-ink-3">時間</div>
          <div className="flex flex-wrap items-center gap-1">
            {FOCUS_PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => setTarget(m)}
                aria-pressed={target === m}
                className={`num border px-2.5 py-1 text-xs ${
                  target === m ? "border-ai bg-ai text-paper" : "border-rule hover:bg-ai-weak"
                }`}
              >
                {m}分
              </button>
            ))}
            <button
              onClick={() => setTarget(0)}
              aria-pressed={target === 0}
              className={`border px-2.5 py-1 text-xs ${
                target === 0 ? "border-ai bg-ai text-paper" : "border-rule hover:bg-ai-weak"
              }`}
            >
              無制限
            </button>
          </div>
        </div>

        <button
          onClick={() => void startFocus(category, target)}
          className="btn btn-primary w-full !py-2"
        >
          {TASK_CATEGORY_JA[category]}で{target > 0 ? `${target}分` : ""}集中する
        </button>
      </div>
    </div>
  );
}

function fmtClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
