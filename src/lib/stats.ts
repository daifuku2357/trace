import type { Analysis, DateKey, EmotionLabel, Entry, Task, TaskCategory } from "./types";
import { EMOTION_LABELS, TASK_CATEGORIES, TASK_CATEGORY_JA } from "./types";
import { addDays, fromKey, monthKey } from "./date";

/** グラフ／ダッシュボード用の集計（仕様書 §3.4）。純関数のみ。 */

/**
 * 連続記録（ストリーク）。今日未記入でも昨日まで続いていれば継続。
 * さらに「保険」として、1日だけの抜けを一度だけ橋渡しする（その前日が記入済みのときのみ）。
 * 抜けた日は数に含めず、記入した日だけを数える。growth と home で共通利用する。
 */
export function computeStreak(written: Set<DateKey>, refDate: DateKey): number {
  let cursor = refDate;
  if (!written.has(cursor)) cursor = addDays(cursor, -1);
  let streak = 0;
  let insuranceUsed = false;
  while (true) {
    if (written.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    } else if (!insuranceUsed && streak > 0 && written.has(addDays(cursor, -1))) {
      // 1日だけの抜けを保険で飛ばす（前日が記入済みなら継続とみなす）。
      insuranceUsed = true;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
}

export interface DayPoint {
  date: DateKey;
  charCount: number;
  sentiment: number | null;
  moodManual: number | null;
  written: boolean;
  analyzed: boolean;
}

export function buildDayPoints(
  dates: DateKey[],
  entries: Map<DateKey, Entry>,
  analyses: Map<DateKey, Analysis>,
): DayPoint[] {
  return dates.map((date) => {
    const e = entries.get(date);
    const a = analyses.get(date);
    return {
      date,
      charCount: e?.charCount ?? 0,
      sentiment: a ? a.sentimentScore : null,
      moodManual: e?.moodManual ?? null,
      written: !!e,
      analyzed: !!a,
    };
  });
}

/** 中心化しない後方移動平均。分析済みの日だけを母数にする。 */
export function movingAverage(points: DayPoint[], window: number): (number | null)[] {
  return points.map((_, i) => {
    const slice = points.slice(Math.max(0, i - window + 1), i + 1);
    const vals = slice.map((p) => p.sentiment).filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  });
}

/** 記入率 = 記入日 / 対象日数 */
export function writeRate(points: DayPoint[]): number {
  if (points.length === 0) return 0;
  return points.filter((p) => p.written).length / points.length;
}

/** 感情ラベルの平均構成比。 */
export function labelAverages(analyses: Analysis[]): { label: EmotionLabel; value: number }[] {
  if (analyses.length === 0) return EMOTION_LABELS.map((label) => ({ label, value: 0 }));
  return EMOTION_LABELS.map((label) => ({
    label,
    value: analyses.reduce((s, a) => s + (a.labels[label] ?? 0), 0) / analyses.length,
  }));
}

/** キーワード出現頻度の上位。 */
export function topKeywords(analyses: Analysis[], limit: number): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of analyses) {
    for (const k of a.keywords) {
      const w = k.trim();
      if (w) counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

export interface MonthStat {
  month: string;
  avgSentiment: number | null;
  writtenDays: number;
  totalChars: number;
}

export function monthlyStats(points: DayPoint[]): MonthStat[] {
  const buckets = new Map<string, DayPoint[]>();
  for (const p of points) {
    const m = monthKey(p.date);
    if (!buckets.has(m)) buckets.set(m, []);
    buckets.get(m)!.push(p);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, ps]) => {
      const vals = ps.map((p) => p.sentiment).filter((v): v is number => v !== null);
      return {
        month,
        avgSentiment: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null,
        writtenDays: ps.filter((p) => p.written).length,
        totalChars: ps.reduce((s, p) => s + p.charCount, 0),
      };
    });
}

export interface DipPeriod {
  from: DateKey;
  to: DateKey;
  days: number;
  low: number;
}

/**
 * 「感情が落ちた期間」の自動検出（仕様書 §3.4）。
 * 7日移動平均が threshold を下回る状態が minDays 以上続いた区間を返す。
 */
export function detectDips(
  points: DayPoint[],
  { threshold = -0.15, minDays = 3, window = 7 } = {},
): DipPeriod[] {
  const ma = movingAverage(points, window);
  const dips: DipPeriod[] = [];
  let start: number | null = null;

  const close = (endIdx: number) => {
    if (start === null) return;
    const len = endIdx - start;
    if (len >= minDays) {
      const seg = ma.slice(start, endIdx).filter((v): v is number => v !== null);
      dips.push({
        from: points[start].date,
        to: points[endIdx - 1].date,
        days: len,
        low: seg.length ? Math.min(...seg) : threshold,
      });
    }
    start = null;
  };

  ma.forEach((v, i) => {
    if (v !== null && v < threshold) {
      if (start === null) start = i;
    } else {
      close(i);
    }
  });
  close(ma.length);

  return dips;
}

/** タスクカテゴリ内訳（§3.4 週ビュー / §3.7）。件数の多い順、0件は除く。 */
export function categoryBreakdown(tasks: Task[]): { category: TaskCategory; count: number }[] {
  const counts = new Map<TaskCategory, number>();
  for (const t of tasks) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
  return TASK_CATEGORIES.map((category) => ({ category, count: counts.get(category) ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
}

// ---- 傾向インサイト（決定的・AI不使用） ----

export interface Insight {
  id: string;
  /** 上向き（良い相関）/ 下向き（注意）/ 中立（トレンド）。色・アイコンに使う。 */
  tone: "up" | "down" | "neutral";
  text: string;
  detail: string;
  /** 並べ替え用の効果量（大きいほど上位）。 */
  strength: number;
}

const WD_JA = ["日", "月", "火", "水", "木", "金", "土"];
const fmtSigned = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`;

/**
 * 蓄積データから「事実」としての傾向を抽出する（AIを使わない決定的な相関）。
 * 感情スコア（分析済み）を軸に、集中の有無・曜日・記録量・タスクカテゴリ・
 * キーワードの増減を見る。ノイズを断定しないため、各群に最低サンプル数
 * （MIN_GROUP）と最小効果量（MIN_DIFF）のしきい値を課し、満たすものだけ返す。
 */
export function computeInsights(
  points: DayPoint[],
  tasks: Task[],
  focus: { date: DateKey; minutes: number; category: TaskCategory }[],
  analyses: Analysis[] = [],
): Insight[] {
  const MIN_GROUP = 3;
  const MIN_DIFF = 0.12;

  const analyzed = points.filter(
    (p): p is DayPoint & { sentiment: number } => p.sentiment !== null,
  );
  if (analyzed.length < 5) return [];

  const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const overall = avg(analyzed.map((p) => p.sentiment));
  const out: Insight[] = [];

  // (1) 集中の有無 × 気分
  const focusDates = new Set(focus.filter((f) => f.minutes > 0).map((f) => f.date));
  const wf = analyzed.filter((p) => focusDates.has(p.date));
  const nf = analyzed.filter((p) => !focusDates.has(p.date));
  if (wf.length >= MIN_GROUP && nf.length >= MIN_GROUP) {
    const wa = avg(wf.map((p) => p.sentiment));
    const na = avg(nf.map((p) => p.sentiment));
    const d = wa - na;
    if (Math.abs(d) >= MIN_DIFF) {
      out.push({
        id: "focus-mood",
        tone: d > 0 ? "up" : "down",
        text: d > 0 ? "集中した日は気分が高い傾向" : "集中した日は気分が下がりがち",
        detail: `集中あり ${fmtSigned(wa)} / なし ${fmtSigned(na)}（差 ${fmtSigned(d)}）`,
        strength: Math.abs(d),
      });
    }
  }

  // (2) 曜日 × 気分（各曜日2日以上のみ対象）
  const byWd: number[][] = Array.from({ length: 7 }, () => []);
  for (const p of analyzed) byWd[fromKey(p.date).getDay()].push(p.sentiment);
  const wdAvg = byWd
    .map((xs, i) => (xs.length >= 2 ? { i, a: avg(xs) } : null))
    .filter((x): x is { i: number; a: number } => x !== null);
  if (wdAvg.length >= 2) {
    const hi = wdAvg.reduce((m, x) => (x.a > m.a ? x : m));
    const lo = wdAvg.reduce((m, x) => (x.a < m.a ? x : m));
    if (hi.a - lo.a >= 0.2) {
      out.push({
        id: "weekday-mood",
        tone: "down",
        text: `${WD_JA[lo.i]}曜は気分が落ちやすい`,
        detail: `平均 ${fmtSigned(lo.a)}／最も高いのは${WD_JA[hi.i]}曜（${fmtSigned(hi.a)}）`,
        strength: (hi.a - lo.a) * 0.6,
      });
    }
  }

  // (3) 記録量（文字数）× 気分（中央値で二分）
  const charSorted = [...analyzed].sort((a, b) => a.charCount - b.charCount);
  const med = charSorted[Math.floor(charSorted.length / 2)].charCount;
  const longG = analyzed.filter((p) => p.charCount > med);
  const shortG = analyzed.filter((p) => p.charCount < med);
  if (longG.length >= MIN_GROUP && shortG.length >= MIN_GROUP) {
    const la = avg(longG.map((p) => p.sentiment));
    const sa = avg(shortG.map((p) => p.sentiment));
    const d = la - sa;
    if (Math.abs(d) >= MIN_DIFF) {
      out.push({
        id: "volume-mood",
        tone: d > 0 ? "up" : "down",
        text: d > 0 ? "たくさん書いた日ほど気分が高い" : "書く量が多い日は気分が低め",
        detail: `多い日 ${fmtSigned(la)} / 少ない日 ${fmtSigned(sa)}`,
        strength: Math.abs(d) * 0.9,
      });
    }
  }

  // (4) タスクカテゴリ × 気分（全体平均からの偏差）
  const catDays = new Map<TaskCategory, Set<DateKey>>();
  for (const t of tasks) {
    if (!catDays.has(t.category)) catDays.set(t.category, new Set());
    catDays.get(t.category)!.add(t.date);
  }
  const catDev: { cat: TaskCategory; dev: number; a: number }[] = [];
  for (const [cat, dates] of catDays) {
    const g = analyzed.filter((p) => dates.has(p.date));
    if (g.length >= MIN_GROUP) {
      const a = avg(g.map((p) => p.sentiment));
      catDev.push({ cat, dev: a - overall, a });
    }
  }
  if (catDev.length) {
    const pos = catDev.reduce((m, x) => (x.dev > m.dev ? x : m));
    const neg = catDev.reduce((m, x) => (x.dev < m.dev ? x : m));
    if (pos.dev >= MIN_DIFF) {
      out.push({
        id: "cat-pos",
        tone: "up",
        text: `${TASK_CATEGORY_JA[pos.cat]}をした日は気分が高い`,
        detail: `平均 ${fmtSigned(pos.a)}（全体 ${fmtSigned(overall)}）`,
        strength: pos.dev,
      });
    }
    if (neg.dev <= -MIN_DIFF && neg.cat !== pos.cat) {
      out.push({
        id: "cat-neg",
        tone: "down",
        text: `${TASK_CATEGORY_JA[neg.cat]}の日は気分が下がりがち`,
        detail: `平均 ${fmtSigned(neg.a)}（全体 ${fmtSigned(overall)}）`,
        strength: Math.abs(neg.dev),
      });
    }
  }

  // (5) キーワードの増減トレンド（期間の前半 vs 後半）
  if (analyses.length >= 6) {
    const sortedA = [...analyses].sort((a, b) => a.date.localeCompare(b.date));
    const mid = Math.floor(sortedA.length / 2);
    const countKw = (arr: Analysis[]) => {
      const m = new Map<string, number>();
      for (const a of arr)
        for (const k of a.keywords) {
          const w = k.trim();
          if (w) m.set(w, (m.get(w) ?? 0) + 1);
        }
      return m;
    };
    const c1 = countKw(sortedA.slice(0, mid));
    const c2 = countKw(sortedA.slice(mid));
    const rising: { word: string; delta: number; n2: number }[] = [];
    for (const [w, n2] of c2) {
      const delta = n2 - (c1.get(w) ?? 0);
      if (n2 >= 2 && delta >= 2) rising.push({ word: w, delta, n2 });
    }
    rising.sort((a, b) => b.delta - a.delta || b.n2 - a.n2);
    if (rising.length) {
      out.push({
        id: "kw-rising",
        tone: "neutral",
        text: `最近ふえている話題: ${rising.slice(0, 3).map((r) => r.word).join("・")}`,
        detail: `期間の後半${sortedA.length - mid}日で出現が増加`,
        strength: 0.2,
      });
    }
  }

  return out.sort((a, b) => b.strength - a.strength).slice(0, 6);
}

/** ヒートマップの濃淡（文字数ベース・5段階）。0 は「無記入」を意味する。 */
export function charCountLevel(charCount: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (charCount <= 0) return 0;
  if (charCount < 100) return 1;
  if (charCount < 250) return 2;
  if (charCount < 500) return 3;
  if (charCount < 900) return 4;
  return 5;
}
