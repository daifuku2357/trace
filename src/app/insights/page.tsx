"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { MonthlyChart, TrendChart, WeeklyChart } from "@/components/charts";
import RecordNav from "@/components/RecordNav";
import { db } from "@/lib/db";
import { formatMinutes } from "@/lib/focus";
import { addDays, formatMonth, formatShort, todayKey, weekdayJa } from "@/lib/date";
import { useRange } from "@/lib/hooks";
import {
  categoryBreakdown,
  computeInsights,
  detectDips,
  labelAverages,
  monthlyStats,
  movingAverage,
  topKeywords,
  writeRate,
  type DayPoint,
} from "@/lib/stats";
import { EMOTION_LABEL_JA, TASK_CATEGORY_JA, type FocusSession, type TaskCategory } from "@/lib/types";

type Grain = "week" | "month" | "year";

const GRAINS: { id: Grain; label: string; days: number }[] = [
  { id: "week", label: "週", days: 7 },
  { id: "month", label: "月", days: 30 },
  { id: "year", label: "年", days: 365 },
];

/** グラフ / ダッシュボード（仕様書 §3.4）。粒度は週 / 月 / 年の3段。記録とは上部の切替で分岐。 */
export default function InsightsPage() {
  const [today, setToday] = useState<string | null>(null);
  const [grain, setGrain] = useState<Grain>("week");
  useEffect(() => setToday(todayKey()), []);

  return (
    <>
      <RecordNav />
      {!today ? (
        <div className="h-64 animate-pulse border border-rule" />
      ) : (
        <InsightsView today={today} grain={grain} onGrain={setGrain} />
      )}
    </>
  );
}

function InsightsView({
  today,
  grain,
  onGrain,
}: {
  today: string;
  grain: Grain;
  onGrain: (g: Grain) => void;
}) {
  const days = GRAINS.find((g) => g.id === grain)!.days;
  const from = addDays(today, -(days - 1));
  const data = useRange(from, today);
  const focus = useLiveQuery(
    () => db.focusSessions.where("date").between(from, today, true, true).toArray(),
    [from, today],
  );

  return (
    <div className="space-y-5">
      <div className="rule-b flex gap-0" role="tablist" aria-label="表示粒度">
        {GRAINS.map((g) => (
          <button
            key={g.id}
            role="tab"
            aria-selected={grain === g.id}
            onClick={() => onGrain(g.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              grain === g.id ? "border-ai font-bold text-ai" : "border-transparent text-ink-2"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="h-64 animate-pulse bg-ai-weak" />
      ) : data.points.every((p) => !p.written) ? (
        <EmptyState />
      ) : grain === "week" ? (
        <WeekView points={data.points} tasks={data.tasks} focus={focus ?? []} />
      ) : grain === "month" ? (
        <>
          <TrendInsights
            points={data.points}
            tasks={data.tasks}
            focus={focus ?? []}
            analyses={data.analysisList}
          />
          <MonthView points={data.points} analyses={data.analysisList} focus={focus ?? []} />
        </>
      ) : (
        <>
          <TrendInsights
            points={data.points}
            tasks={data.tasks}
            focus={focus ?? []}
            analyses={data.analysisList}
          />
          <YearView points={data.points} analyses={data.analysisList} focus={focus ?? []} />
        </>
      )}
    </div>
  );
}

function WeekView({
  points,
  tasks,
  focus,
}: {
  points: DayPoint[];
  tasks: import("@/lib/types").Task[];
  focus: FocusSession[];
}) {
  const chart = points.map((p) => ({
    label: `${p.date.slice(8)}(${weekdayJa(p.date)})`,
    charCount: p.charCount,
    sentiment: p.sentiment,
  }));
  const analyzed = points.filter((p) => p.sentiment !== null);
  const avg = analyzed.length
    ? analyzed.reduce((s, p) => s + (p.sentiment ?? 0), 0) / analyzed.length
    : null;
  const breakdown = categoryBreakdown(tasks);
  const maxCount = Math.max(1, ...breakdown.map((b) => b.count));

  return (
    <>
      <Section title="感情スコアと文字数">
        <WeeklyChart data={chart} />
      </Section>
      <Section title="今週の要約">
        <StatRow
          items={[
            { label: "記入日数", value: `${points.filter((p) => p.written).length} / 7`, unit: "日" },
            { label: "平均感情", value: avg === null ? "—" : `${avg > 0 ? "+" : ""}${avg.toFixed(2)}`, unit: "" },
            {
              label: "総文字数",
              value: points.reduce((s, p) => s + p.charCount, 0).toLocaleString("ja-JP"),
              unit: "字",
            },
          ]}
        />
      </Section>
      <Section title="タスクカテゴリ内訳">
        {breakdown.length === 0 ? (
          <p className="py-2 text-sm text-ink-3">分類済みの活動がまだありません。</p>
        ) : (
          <ul className="space-y-1.5 pt-1">
            {breakdown.map((b) => (
              <li key={b.category} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-xs text-ink-2">
                  {TASK_CATEGORY_JA[b.category]}
                </span>
                <span className="h-2.5 flex-1 border border-rule">
                  <span className="block h-full bg-ai" style={{ width: `${(b.count / maxCount) * 100}%` }} />
                </span>
                <span className="num w-6 shrink-0 text-right text-[11px] text-ink-3">{b.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <FocusSection focus={focus} />
    </>
  );
}

/** 集中時間の合計とカテゴリ内訳（週月サマリー）。 */
function FocusSection({ focus }: { focus: FocusSession[] }) {
  const total = focus.reduce((s, f) => s + f.minutes, 0);
  const byCat = new Map<TaskCategory, number>();
  for (const f of focus) byCat.set(f.category, (byCat.get(f.category) ?? 0) + f.minutes);
  const rows = [...byCat.entries()]
    .map(([category, minutes]) => ({ category, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
  const max = Math.max(1, ...rows.map((r) => r.minutes));

  return (
    <Section title="集中時間">
      {focus.length === 0 ? (
        <p className="py-2 text-sm text-ink-3">この期間の集中セッションはありません。</p>
      ) : (
        <>
          <StatRow
            items={[
              { label: "合計", value: formatMinutes(total), unit: "" },
              { label: "セッション", value: `${focus.length}`, unit: "回" },
              {
                label: "1回平均",
                value: `${Math.round(total / focus.length)}`,
                unit: "分",
              },
            ]}
          />
          <ul className="mt-3 space-y-1.5">
            {rows.map((r) => (
              <li key={r.category} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-xs text-ink-2">{TASK_CATEGORY_JA[r.category]}</span>
                <span className="h-2.5 flex-1 border border-rule">
                  <span className="block h-full bg-ai" style={{ width: `${(r.minutes / max) * 100}%` }} />
                </span>
                <span className="num w-14 shrink-0 text-right text-[11px] text-ink-3">
                  {formatMinutes(r.minutes)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

function MonthView({
  points,
  analyses,
  focus,
}: {
  points: DayPoint[];
  analyses: import("@/lib/types").Analysis[];
  focus: FocusSession[];
}) {
  const ma = movingAverage(points, 7);
  const chart = points.map((p, i) => ({
    label: `${Number(p.date.slice(5, 7))}/${Number(p.date.slice(8))}`,
    sentiment: p.sentiment,
    average: ma[i],
  }));
  const labels = labelAverages(analyses);
  const max = Math.max(0.001, ...labels.map((l) => l.value));

  return (
    <>
      <Section title="感情スコア（7日移動平均）">
        <TrendChart data={chart} />
      </Section>

      <Section title="記入率">
        <StatRow
          items={[
            { label: "記入率", value: `${Math.round(writeRate(points) * 100)}`, unit: "%" },
            {
              label: "記入日数",
              value: `${points.filter((p) => p.written).length} / ${points.length}`,
              unit: "日",
            },
            { label: "分析済", value: `${analyses.length}`, unit: "日" },
          ]}
        />
      </Section>

      <Section title="感情ラベル構成比">
        {analyses.length === 0 ? (
          <p className="py-2 text-sm text-ink-3">分析済みの日記がまだありません。</p>
        ) : (
          <ul className="space-y-1.5 pt-1">
            {[...labels]
              .sort((a, b) => b.value - a.value)
              .map((l) => (
                <li key={l.label} className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-xs text-ink-2">{EMOTION_LABEL_JA[l.label]}</span>
                  <span className="h-2.5 flex-1 border border-rule">
                    <span
                      className="block h-full bg-ai"
                      style={{ width: `${(l.value / max) * 100}%` }}
                    />
                  </span>
                  <span className="num w-9 shrink-0 text-right text-[11px] text-ink-3">
                    {l.value.toFixed(2)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Section>

      <FocusSection focus={focus} />

      <DipSection points={points} />
    </>
  );
}

function YearView({
  points,
  analyses,
  focus,
}: {
  points: DayPoint[];
  analyses: import("@/lib/types").Analysis[];
  focus: FocusSession[];
}) {
  const months = monthlyStats(points).map((m) => ({
    label: formatMonth(m.month).replace(/^\d+年/, ""),
    avgSentiment: m.avgSentiment,
    writtenDays: m.writtenDays,
  }));
  const keywords = topKeywords(analyses, 15);
  const maxCount = Math.max(1, ...keywords.map((k) => k.count));

  return (
    <>
      <Section title="月別平均感情">
        <MonthlyChart data={months} />
      </Section>

      <Section title="キーワード頻出">
        {keywords.length === 0 ? (
          <p className="py-2 text-sm text-ink-3">分析済みの日記がまだありません。</p>
        ) : (
          <ul className="space-y-1 pt-1">
            {keywords.map((k) => (
              <li key={k.word} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-xs" title={k.word}>
                  {k.word}
                </span>
                <span className="h-2.5 flex-1 border border-rule">
                  <span
                    className="block h-full bg-ai"
                    style={{ width: `${(k.count / maxCount) * 100}%` }}
                  />
                </span>
                <span className="num w-6 shrink-0 text-right text-[11px] text-ink-3">{k.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <FocusSection focus={focus} />

      <Section title="ヒートマップ">
        <p className="py-2 text-sm">
          <Link href="/record" className="text-ai underline">
            記録タブ
          </Link>
          で年間のコントリビューショングラフを表示します。
        </p>
      </Section>

      <DipSection points={points} />
    </>
  );
}

/** 「感情が落ちた期間」の自動ハイライトとその期間の日記へのリンク（§3.4）。 */
function DipSection({ points }: { points: DayPoint[] }) {
  const dips = detectDips(points);
  return (
    <Section title="感情が落ちた期間">
      {dips.length === 0 ? (
        <p className="py-2 text-sm text-ink-3">該当する期間はありません。</p>
      ) : (
        <ul className="divide-y divide-rule">
          {[...dips].reverse().map((d) => (
            <li key={d.from} className="py-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm">
                  {formatShort(d.from)} 〜 {formatShort(d.to)}
                </span>
                <span className="num text-xs text-ink-2">
                  {d.days}日間 / 最低 {d.low.toFixed(2)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {points
                  .filter((p) => p.date >= d.from && p.date <= d.to && p.written)
                  .map((p) => (
                    <Link
                      key={p.date}
                      href={`/entry/${p.date}`}
                      className="num border border-rule px-1.5 py-0.5 text-[11px] text-ai hover:bg-ai-weak"
                    >
                      {p.date.slice(5)}
                    </Link>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/**
 * 傾向インサイト（決定的・AI不使用）。集中×気分、曜日×気分、記録量×気分、
 * カテゴリ×気分、キーワードの増減を「事実」として提示する。
 * しきい値を満たす傾向が無いときは、その旨を正直に出す（ノイズを断定しない）。
 */
function TrendInsights({
  points,
  tasks,
  focus,
  analyses,
}: {
  points: DayPoint[];
  tasks: import("@/lib/types").Task[];
  focus: FocusSession[];
  analyses: import("@/lib/types").Analysis[];
}) {
  const insights = useMemo(
    () => computeInsights(points, tasks, focus, analyses),
    [points, tasks, focus, analyses],
  );
  const analyzedCount = points.filter((p) => p.sentiment !== null).length;

  const tone = {
    up: { icon: "▲", cls: "text-grow-ink" },
    down: { icon: "▼", cls: "text-flame" },
    neutral: { icon: "◆", cls: "text-ai" },
  } as const;

  return (
    <Section title="傾向インサイト">
      {insights.length === 0 ? (
        <p className="py-2 text-sm text-ink-3">
          {analyzedCount < 5
            ? `相関を出すにはもう少しデータが必要です（分析済み ${analyzedCount} / 5日）。日記を書いて分析すると傾向が見えてきます。`
            : "この期間には、はっきりした傾向は見つかりませんでした。"}
        </p>
      ) : (
        <ul className="space-y-2 pt-1">
          {insights.map((it) => (
            <li
              key={it.id}
              className="flex items-start gap-2 rounded-lg border border-rule bg-paper-2/50 px-3 py-2"
            >
              <span aria-hidden className={`mt-0.5 text-xs ${tone[it.tone].cls}`}>
                {tone[it.tone].icon}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-snug">{it.text}</p>
                <p className="num mt-0.5 text-[11px] text-ink-3">{it.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="pt-2 text-[10px] text-ink-3">
        ※ これらはAIではなく記録から機械的に集計した傾向です（相関であって因果ではありません）。
      </p>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="rule-b pb-2 text-sm font-bold tracking-wider">{title}</h2>
      <div className="pt-3">{children}</div>
    </section>
  );
}

function StatRow({ items }: { items: { label: string; value: string; unit: string }[] }) {
  return (
    <dl className="grid grid-cols-3 divide-x divide-rule border-y border-rule">
      {items.map((it) => (
        <div key={it.label} className="px-2 py-2 text-center">
          <dt className="text-[10px] text-ink-3">{it.label}</dt>
          <dd className="mt-0.5">
            <span className="num text-lg font-bold">{it.value}</span>
            <span className="ml-0.5 text-[10px] text-ink-2">{it.unit}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyState() {
  return (
    <div className="border border-rule p-6 text-center">
      <p className="text-sm text-ink-2">この期間にはまだ記録がありません。</p>
      <Link href="/" className="mt-2 inline-block text-sm text-ai underline">
        今日の日記を書く
      </Link>
    </div>
  );
}
