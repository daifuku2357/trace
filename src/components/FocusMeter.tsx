"use client";

import { formatMinutes, type FocusStats } from "@/lib/focus";
import { TASK_CATEGORY_JA } from "@/lib/types";

/**
 * 集中の積み上げメーター（成長）。
 * 単色（藍）の塗りで進捗を示し、レベルと次のレベルまでの残りを併記する。
 * variant="full" では今週のセッション数とカテゴリ内訳も出す。
 */
export default function FocusMeter({
  stats,
  variant = "compact",
}: {
  stats: FocusStats;
  variant?: "compact" | "full";
}) {
  const { level } = stats;
  const remain = level.needForNext - level.intoLevel;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-ink-2">
          集中レベル <span className="num text-base font-bold text-ink">Lv.{level.level}</span>
        </span>
        <span className="num text-[11px] text-ink-3">
          総 {formatMinutes(level.totalMinutes)} ・ 連続 {stats.streak}日
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <span className="h-2.5 flex-1 border border-rule">
          <span
            className="block h-full bg-ai transition-[width] duration-500"
            style={{ width: `${Math.round(level.progress * 100)}%` }}
          />
        </span>
        <span className="num shrink-0 text-[11px] text-ink-3">次のLvまで {remain}分</span>
      </div>

      {variant === "full" && (
        <div className="mt-3">
          <dl className="grid grid-cols-3 divide-x divide-rule border-y border-rule">
            <Cell label="今日" value={formatMinutes(stats.todayMinutes)} />
            <Cell label="今週" value={formatMinutes(stats.weekMinutes)} />
            <Cell label="今週のセッション" value={`${stats.weekSessions}`} unit="回" />
          </dl>

          {stats.weekByCategory.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[11px] text-ink-3">今週のカテゴリ内訳</div>
              <ul className="space-y-1">
                {stats.weekByCategory.map((c) => {
                  const max = stats.weekByCategory[0].minutes || 1;
                  return (
                    <li key={c.category} className="flex items-center gap-2">
                      <span className="w-10 shrink-0 text-xs text-ink-2">
                        {TASK_CATEGORY_JA[c.category]}
                      </span>
                      <span className="h-2 flex-1 border border-rule">
                        <span
                          className="block h-full bg-ai"
                          style={{ width: `${(c.minutes / max) * 100}%` }}
                        />
                      </span>
                      <span className="num w-14 shrink-0 text-right text-[11px] text-ink-3">
                        {formatMinutes(c.minutes)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="px-2 py-1.5 text-center">
      <dt className="text-[10px] text-ink-3">{label}</dt>
      <dd className="mt-0.5">
        <span className="num text-sm font-bold">{value}</span>
        {unit && <span className="ml-0.5 text-[10px] text-ai">{unit}</span>}
      </dd>
    </div>
  );
}
