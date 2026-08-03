"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * グラフの見た目は仕様書 §2 の配色方針に従う。
 * グラデーション・ネオン・影は使わず、藍1色 + 罫線グレーのみで構成する。
 */
export const INK = "#22201C";
export const AI = "#1E6E90";
export const RULE = "#E4E0D6";
export const INK3 = "#8C887E";

const axis = {
  stroke: RULE,
  tick: { fill: INK3, fontSize: 10 },
  tickLine: false,
} as const;

const tooltipStyle = {
  contentStyle: {
    background: "#FAF9F6",
    border: `1px solid ${RULE}`,
    borderRadius: 0,
    fontSize: 12,
    color: INK,
  },
  labelStyle: { color: INK3, fontSize: 11 },
  cursor: { fill: "rgba(22,94,131,0.06)" },
} as const;

export interface DailyDatum {
  label: string;
  charCount: number;
  sentiment: number | null;
}

/** 週ビュー: 感情スコア折れ線 + 文字数棒グラフ（§3.4） */
export function WeeklyChart({ data }: { data: DailyDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={RULE} vertical={false} />
        <XAxis dataKey="label" {...axis} />
        <YAxis yAxisId="chars" {...axis} width={40} />
        <YAxis yAxisId="sent" orientation="right" domain={[-1, 1]} ticks={[-1, 0, 1]} {...axis} width={30} />
        <Tooltip
          {...tooltipStyle}
          formatter={(value, name) => [
            typeof value === "number" ? (name === "感情スコア" ? value.toFixed(2) : `${value}字`) : "—",
            name,
          ]}
        />
        <ReferenceLine yAxisId="sent" y={0} stroke={RULE} />
        <Bar yAxisId="chars" dataKey="charCount" name="文字数" fill={RULE} maxBarSize={28} />
        <Line
          yAxisId="sent"
          type="monotone"
          dataKey="sentiment"
          name="感情スコア"
          stroke={AI}
          strokeWidth={2}
          dot={{ r: 3, fill: AI, strokeWidth: 0 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export interface TrendDatum {
  label: string;
  sentiment: number | null;
  average: number | null;
}

/** 月ビュー: 感情スコアの移動平均（§3.4） */
export function TrendChart({ data }: { data: TrendDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={RULE} vertical={false} />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
        <YAxis domain={[-1, 1]} ticks={[-1, -0.5, 0, 0.5, 1]} {...axis} width={40} />
        <Tooltip
          {...tooltipStyle}
          formatter={(value, name) => [typeof value === "number" ? value.toFixed(2) : "—", name]}
        />
        <ReferenceLine y={0} stroke={RULE} />
        <Line
          type="monotone"
          dataKey="sentiment"
          name="日次"
          stroke={INK3}
          strokeWidth={1}
          strokeDasharray="2 2"
          dot={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="average"
          name="7日移動平均"
          stroke={AI}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export interface MonthlyDatum {
  label: string;
  avgSentiment: number | null;
  writtenDays: number;
}

/** 年ビュー: 月別平均感情（§3.4） */
export function MonthlyChart({ data }: { data: MonthlyDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={RULE} vertical={false} />
        <XAxis dataKey="label" {...axis} />
        <YAxis domain={[-1, 1]} ticks={[-1, 0, 1]} {...axis} width={40} />
        <Tooltip
          {...tooltipStyle}
          formatter={(value, name) => [typeof value === "number" ? value.toFixed(2) : "—", name]}
        />
        <ReferenceLine y={0} stroke={RULE} />
        <Bar dataKey="avgSentiment" name="平均感情" fill={AI} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}
