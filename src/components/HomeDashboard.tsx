"use client";

import { useEffect } from "react";
import Link from "next/link";
import { greeting, useHomeSummary } from "@/lib/home";
import { detectMilestones, useGrowth, type Growth } from "@/lib/growth";
import { useActiveFocus, useFocusStats } from "@/lib/focus";
import { nowNext, usePlanBlocks } from "@/lib/plan";
import { celebrate } from "@/lib/celebrate";
import { type DateKey } from "@/lib/types";
import GrowthTree from "./GrowthTree";
import SameDayFlashback from "./SameDayFlashback";

/**
 * ホーム上部。行動が即座に報酬（XP・木の成長・お祝い）に変わる導線を最上部に置く。
 */
export default function HomeDashboard({ date }: { date: DateKey }) {
  const summary = useHomeSummary(date);
  const growth = useGrowth(date);
  const active = useActiveFocus();
  const focusStats = useFocusStats(date);

  const treeLevel = growth?.level.level ?? 1;
  const treeStreak = growth?.streak ?? 0;
  const treeFocus = focusStats?.totalMinutes ?? 0;

  // レベル/ストリークの節目を監視し、超えたら祝う。
  useEffect(() => {
    if (!growth) return;
    void detectMilestones(growth).then((ms) => {
      for (const m of ms) {
        if (m.kind === "level") {
          celebrate({ kind: "level", title: `レベル ${m.value} に到達`, detail: "木がまた育ちました", big: true });
        } else {
          celebrate({ kind: "streak", title: `${m.value}日 連続達成`, detail: "この調子で続けよう", big: true });
        }
      }
    });
  }, [growth]);

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-rule bg-paper shadow-soft">
      {/* 挨拶 + ストリーク */}
      <div className="flex items-center justify-between px-4 pt-3">
        <h1 className="text-[17px] font-bold">{greeting()}</h1>
        {growth && <StreakBadge growth={growth} />}
      </div>

      {/* 育つ木 */}
      <div className="mt-1 bg-grow-weak/50">
        {growth ? (
          <GrowthTree level={treeLevel} streak={treeStreak} focusMinutes={treeFocus} />
        ) : (
          <div className="h-40" />
        )}
      </div>

      {/* レベル + XP バー */}
      {growth && <XpBar growth={growth} />}

      {/* いま / 次（今日の組み立て） */}
      <PlanCard date={date} />

      {/* クイック行動: 集中への導線 */}
      <div className="px-4 py-3">
        <Link
          href="/focus"
          className="flex items-center justify-center gap-1.5 rounded-xl border border-grow bg-grow-weak py-2.5 text-sm font-bold text-grow-ink transition-transform active:scale-95"
        >
          <span aria-hidden>◉</span>
          {active ? "集中を再開" : "集中する"}
          <span className="text-[11px] font-normal text-grow-ink/70">+XP</span>
        </Link>
      </div>

      <SameDayFlashback date={date} />

      {summary && <Nudges pending={summary.pending} moodAvg7={summary.moodAvg7} />}
    </section>
  );
}

function StreakBadge({ growth }: { growth: Growth }) {
  const remain = growth.nextStreakMilestone ? growth.nextStreakMilestone - growth.streak : 0;
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-flame bg-flame-weak px-2.5 py-1">
      <span aria-hidden className="text-sm">🔥</span>
      <span className="num text-sm font-bold text-flame">{growth.streak}</span>
      <span className="text-[11px] text-ink-2">日連続</span>
      {remain > 0 && remain <= 3 && (
        <span className="ml-1 num text-[10px] text-flame">あと{remain}日で節目</span>
      )}
    </div>
  );
}

function XpBar({ growth }: { growth: Growth }) {
  const pct = Math.round(growth.level.progress * 100);
  return (
    <div className="px-4 pb-1 pt-2">
      <div className="flex items-baseline justify-between">
        <span className="flex items-baseline gap-1.5">
          <span className="rounded-md bg-grow px-1.5 py-0.5 text-[11px] font-bold text-paper">
            Lv.{growth.level.level}
          </span>
          <span className="num text-[11px] text-ink-3">
            {growth.level.intoLevel} / {growth.level.needForNext} XP
          </span>
        </span>
        {growth.todayXp > 0 && (
          <span className="num text-[11px] font-bold text-reward-ink">今日 +{growth.todayXp} XP</span>
        )}
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-paper-2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-grow to-grow-ink transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** いま／次にやること。今日の組み立て(plan)があればその進行を、なければ組み立てへ誘導する。 */
function PlanCard({ date }: { date: DateKey }) {
  const blocks = usePlanBlocks(date);
  if (blocks === undefined) return null;

  // 予定が無い日は何も出さない（「今日を組み立てる」CTA は不要という要望）。
  if (blocks.length === 0) return null;

  const { current, next } = nowNext(blocks);
  const focus = current ?? next;
  const allDone = blocks.every((b) => b.done);

  return (
    <Link
      href="/plan"
      className="mx-4 mt-1 flex items-center gap-2 rounded-xl border border-rule bg-paper-2/60 px-3 py-2 transition-transform active:scale-[0.99]"
    >
      <span className="shrink-0 text-[10px] font-bold tracking-wider text-ai">
        {current ? "いま" : allDone ? "完了" : "次"}
      </span>
      {allDone ? (
        <span className="flex-1 text-[13px] text-grow-ink">今日の予定はすべて完了 🎉</span>
      ) : focus ? (
        <>
          <span className="num shrink-0 text-[11px] text-ink-3">
            {focus.start}–{focus.end}
          </span>
          <span className="flex-1 truncate text-[13px]">{focus.title}</span>
        </>
      ) : (
        <span className="flex-1 text-[13px] text-ink-3">今日の予定</span>
      )}
      <span className="shrink-0 text-[11px] text-ai">組立</span>
    </Link>
  );
}

function Nudges({
  pending,
  moodAvg7,
}: {
  pending: { analyze: number; classify: number; dueSoon: number };
  moodAvg7: number | null;
}) {
  const items: { href: string; label: string }[] = [];
  if (pending.analyze > 0) items.push({ href: "/settings", label: `未分析 ${pending.analyze}` });
  if (pending.dueSoon > 0) items.push({ href: "/goals", label: `締切間近 ${pending.dueSoon}` });
  if (items.length === 0 && moodAvg7 === null) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-rule px-4 py-2">
      {moodAvg7 !== null && (
        <span className="num text-[11px] text-ink-3">
          気分 {moodAvg7 > 0 ? "+" : ""}
          {moodAvg7.toFixed(2)}
        </span>
      )}
      {items.map((it) => (
        <Link
          key={it.label}
          href={it.href}
          className="num rounded-full border border-rule px-2 py-0.5 text-[11px] text-ink-2 hover:bg-paper-2"
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}
