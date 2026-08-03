"use client";

import { planStats, toMinutes } from "@/lib/plan";
import { PLAN_KINDS, PLAN_KIND_JA, type PlanBlock, type PlanKind } from "@/lib/types";

/** 性質ごとの色（紫は使わない）。tailwind トークンと同じ実値。 */
const HEX: Record<PlanKind, string> = {
  task: "#1E6E90",
  habit: "#2E8B57",
};

// viewBox 380×300。外側ラベル（最大6文字＝全角なので横幅が要る）が端で切れないよう
// 横に広く取り、中心も中央に置く。
const VBW = 380;
const CX = VBW / 2;
const CY = 150;
const R = 80; // リング中心半径
const SW = 28; // リング幅
const LABEL_R = R + SW / 2 + 11;
const LEAD_R = R + SW / 2 + 2;
const LABEL_MAX = 6; // ラベルの最大文字数（全角）

/** ブロックの長さ（分）。終了が開始以前なら日跨ぎとみなす。 */
function durationOf(b: PlanBlock): number {
  const s = toMinutes(b.start) ?? 0;
  let e = toMinutes(b.end) ?? s;
  if (e <= s) e += 1440;
  return e - s;
}

/** 0:00 を上に、時計回り。分 → 円周上の座標。 */
function polar(mins: number, r: number): [number, number] {
  const a = (mins / 1440) * 2 * Math.PI;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}

function arcPath(startMin: number, spanMin: number): string {
  const span = Math.min(spanMin, 1439.9);
  const [x0, y0] = polar(startMin, R);
  const [x1, y1] = polar(startMin + span, R);
  const large = span > 720 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function fmt(m: number): string {
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  if (h && mm) return `${h}時間${mm}分`;
  if (h) return `${h}時間`;
  return `${mm}分`;
}

/** コードポイント単位で切り詰める（絵文字・日本語対応）。 */
function trunc(s: string, n: number): string {
  const a = [...s];
  return a.length > n ? a.slice(0, n).join("") + "…" : s;
}

/**
 * 「今日の組み立て」を大きめの24時間円時計で見せる。
 * ブロックは弧＋その名前（すること）を円の外に配置。完了は濃く・未完了は淡く。中心に達成率。
 */
export default function PlanDial({ blocks }: { blocks: PlanBlock[] }) {
  const stats = planStats(blocks);
  const pct = Math.round(stats.rate * 100);

  const perKind = Object.fromEntries(PLAN_KINDS.map((k) => [k, 0])) as Record<PlanKind, number>;
  let scheduled = 0;
  for (const b of blocks) {
    const d = durationOf(b);
    perKind[b.kind] += d;
    scheduled += d;
  }

  // ラベルを出すブロック（短すぎる休憩などは省いて混雑を避ける）。
  const labelled = blocks
    .map((b) => ({ b, start: toMinutes(b.start) ?? 0, span: durationOf(b) }))
    .filter((x) => x.span >= 30);

  return (
    <div className="rounded-xl border border-rule bg-paper p-3">
      <svg
        viewBox={`0 0 ${VBW} 300`}
        className="mx-auto block w-full max-w-[400px] overflow-visible"
        role="img"
        aria-label={`達成率 ${pct}%`}
      >
        {/* 空き時間のトラック */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#F3F1EA" strokeWidth={SW} />

        {/* ブロックの弧 */}
        {blocks.map((b) => (
          <path
            key={b.id}
            d={arcPath(toMinutes(b.start) ?? 0, durationOf(b))}
            fill="none"
            stroke={HEX[b.kind]}
            strokeWidth={SW}
            strokeOpacity={b.done ? 1 : 0.45}
          />
        ))}

        {/* 0/6/12/18 時の目盛り（リング内側の薄い数字） */}
        {[0, 6, 12, 18].map((h) => {
          const [x, y] = polar(h * 60, R - SW / 2 - 8);
          return (
            <text key={h} x={x} y={y} textAnchor="middle" dominantBaseline="middle" style={{ fill: "#B7B2A6" }} fontSize="8">
              {h}
            </text>
          );
        })}

        {/* すること（ブロック名）を円の外に配置。引き出し線つき。 */}
        {labelled.map(({ b, start, span }) => {
          const mid = start + span / 2;
          const [lx, ly] = polar(mid, LABEL_R);
          const [ex, ey] = polar(mid, LEAD_R);
          const anchor = lx - CX > 8 ? "start" : lx - CX < -8 ? "end" : "middle";
          const tx = anchor === "start" ? lx + 2 : anchor === "end" ? lx - 2 : lx;
          return (
            <g key={`l-${b.id}`}>
              <line x1={ex} y1={ey} x2={lx} y2={ly} stroke="#D9D4C8" strokeWidth={1} />
              <circle cx={ex} cy={ey} r={1.6} fill={HEX[b.kind]} />
              <text
                x={tx}
                y={ly}
                textAnchor={anchor}
                dominantBaseline="middle"
                style={{ fill: b.done ? "#8C887E" : "#22201C" }}
                fontSize="10"
                fontWeight={600}
              >
                {trunc(b.title, LABEL_MAX)}
              </text>
            </g>
          );
        })}

        {/* 中心の達成率 */}
        <text x={CX} y={CY - 4} textAnchor="middle" style={{ fill: "#22201C" }} fontSize="38" fontWeight={700}>
          {pct}%
        </text>
        <text x={CX} y={CY + 20} textAnchor="middle" style={{ fill: "#8C887E" }} fontSize="12">
          達成 {stats.done}/{stats.total}
        </text>
      </svg>

      {/* 性質ごとの時間内訳（＝内訳の円グラフ相当） */}
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 border-t border-rule pt-2 text-[12px]">
        <span className="text-ink-3">計 {fmt(scheduled)}：</span>
        {PLAN_KINDS.filter((k) => perKind[k] > 0).map((k) => (
          <span key={k} className="flex items-center gap-1 text-ink-2">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: HEX[k] }} />
            {PLAN_KIND_JA[k]}
            <span className="num text-ink-3">{fmt(perKind[k])}</span>
          </span>
        ))}
      </div>
      <p className="mt-1 text-center text-[10px] text-ink-3">濃い弧＝完了ぶん。中心は達成率。</p>
    </div>
  );
}
