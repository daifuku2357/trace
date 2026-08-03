/** 仕様書 §6 のデータモデルに対応する型。Phase 1+2 の範囲のみ定義する。 */

/** ローカル日付 'YYYY-MM-DD'。UTC 変換は一切挟まない（§lib/date.ts 参照）。 */
export type DateKey = string;

export interface Entry {
  id?: number;
  date: DateKey;
  body: string;
  charCount: number;
  /** 気分スコア（1〜5の手動入力）。任意。 */
  moodManual: number | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  /** Phase 4「2分ルールモード」用。Phase 1+2 では常に false。 */
  isLightMode: boolean;
}

/** 感情ラベル。API とのやり取りは ASCII キー、表示は日本語。 */
export const EMOTION_LABELS = [
  "joy",
  "anxiety",
  "anger",
  "fatigue",
  "fulfillment",
  "stagnation",
] as const;

export type EmotionLabel = (typeof EMOTION_LABELS)[number];

export const EMOTION_LABEL_JA: Record<EmotionLabel, string> = {
  joy: "喜び",
  anxiety: "不安",
  anger: "怒り",
  fatigue: "疲労",
  fulfillment: "充実",
  stagnation: "停滞",
};

export type EmotionScores = Record<EmotionLabel, number>;

/**
 * 分析結果は本文と分離して保持する（仕様書 §3.3 / §8）。
 * model と promptVersion を必ず記録し、後から再解析できるようにする。
 * bodyHash は「本文が変わっていなければ再解析しない」判定に使う。
 */
export interface Analysis {
  id?: number;
  entryId: number;
  date: DateKey;
  sentimentScore: number; // -1.0 〜 +1.0
  labels: EmotionScores; // 各 0〜1 の多ラベル
  keywords: string[]; // 3〜5語
  model: string;
  promptVersion: string;
  bodyHash: string;
  analyzedAt: number;
}

export type AnalysisJobStatus = "pending" | "error";

/** オフライン時に分析を後回しにするためのキュー（§2 オフライン要件）。 */
export interface AnalysisJob {
  date: DateKey;
  status: AnalysisJobStatus;
  bodyHash: string;
  lastError: string | null;
  attempts: number;
  updatedAt: number;
}

/** 未記入 / 記入済 / 分析済 の3状態（§2 デザイン明示性）。 */
export type DayStatus = "empty" | "written" | "analyzed";

/** key-value のアプリ設定（実行中の集中セッションなど）。 */
export interface Setting {
  key: string;
  value: string;
}

// ---- Phase 3: メインタスク分類（§3.7） ----

/** カテゴリ。API とのやり取りは ASCII、表示は日本語。 */
export const TASK_CATEGORIES = [
  "study",
  "make",
  "jobhunt",
  "research",
  "rest",
  "social",
  "chore",
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_CATEGORY_JA: Record<TaskCategory, string> = {
  study: "学習",
  make: "制作",
  jobhunt: "就活",
  research: "研究",
  rest: "休息",
  social: "対人",
  chore: "雑務",
};

export interface Task {
  id?: number;
  entryId: number;
  date: DateKey;
  category: TaskCategory;
  title: string;
  /** auto = LLM が本文から抽出、manual = ユーザーが追加・修正した。 */
  source: "auto" | "manual";
  order: number;
  createdAt: number;
}

/**
 * ユーザーによるカテゴリ修正の記録（§3.7「修正内容は以後の分類プロンプトに反映」）。
 * 直近のものを分類プロンプトに例示として渡し、同種の誤りを繰り返さないようにする。
 */
export interface CategoryCorrection {
  id?: number;
  title: string;
  from: TaskCategory;
  to: TaskCategory;
  correctedAt: number;
}

// ---- 集中セッション（継続を促す「集中で成長」システム） ----

/**
 * 1回の集中セッション。集中した時間を積み上げて成長メーターを伸ばす。
 * カテゴリはタスク分類と共通で、週月サマリーの集中内訳に使う。
 */
export interface FocusSession {
  id?: number;
  date: DateKey; // 開始日（ローカル）
  category: TaskCategory;
  minutes: number; // 実際に集中した分
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
}

/** よく使う集中時間のプリセット（分）。 */
export const FOCUS_PRESETS = [25, 50, 15] as const;

// ---- Phase 3: 目標分解（§3.6） ----

/** Lv1 大目標 / Lv2 中目標（3ヶ月） / Lv3 週次タスク / Lv4 今日15分の最小行動。 */
export type GoalLevel = 1 | 2 | 3 | 4;

export const GOAL_LEVEL_JA: Record<GoalLevel, string> = {
  1: "大目標",
  2: "中目標",
  3: "週次タスク",
  4: "今日の最小行動",
};

export type GoalStatus = "todo" | "done";

export interface Goal {
  id?: number;
  parentId: number | null;
  rootId: number | null;
  level: GoalLevel;
  title: string;
  status: GoalStatus;
  /** Lv2 は 'YYYY-MM' 相当の目安。任意。 */
  dueDate: string | null;
  /** 0〜1。Lv4 は status から決まり、上位は子の平均で自動更新される。 */
  progress: number;
  order: number;
  /** AI の提案か、ユーザーが手で作った／書き換えたか。 */
  source: "ai" | "manual";
  createdAt: number;
  updatedAt: number;
}

/** 保存が成立する最小文字数（§2 入力負荷）。 */
export const MIN_CHARS = 10;

/**
 * 就活の自己分析: 強み仮説（§5.2）。
 * 捏造防止のため、必ず裏付けとなる実在の日記日付（evidence）を持つ。
 * AI が抽出した下書きだが、人間が編集・追加・削除できる。
 */
export interface Strength {
  id?: number;
  title: string; // 強み（例: 手を動かし続ける継続力）
  summary: string; // 自己PRの下書き（根拠の説明）
  evidence: DateKey[]; // 裏付けの日記日付。実在するもののみ。
  source: "ai" | "manual";
  createdAt: number;
  updatedAt: number;
}

/**
 * 就活: STARエピソード（§5.2）。ES で使う「状況/課題/行動/結果」の下書き。
 * 元になった日記の日付（dates）にリンクする（実在するもののみ）。
 */
export interface StarEpisode {
  id?: number;
  title: string;
  situation: string; // S 状況
  task: string; // T 課題
  action: string; // A 行動
  result: string; // R 結果
  dates: DateKey[]; // 根拠の日記日付
  source: "ai" | "manual";
  createdAt: number;
  updatedAt: number;
}

// ---- 「今日の組み立て」: AIが下書きを提案し、人間が編集して確定する1日のタイムブロック ----

/**
 * タスクの性質。トピック分類の TaskCategory とは別軸。
 * 「やること」と毎日の「習慣」の2種類。時刻の指定は kind ではなく各項目の任意設定（fixedTime）で行う。
 */
export const PLAN_KINDS = ["task", "habit"] as const;

export type PlanKind = (typeof PLAN_KINDS)[number];

export const PLAN_KIND_JA: Record<PlanKind, string> = {
  task: "やること",
  habit: "習慣",
};

/**
 * 旧データ（must/should/want/fixed）を現行の kind に読み替える。
 * 既存の IndexedDB やエクスポート／インポートを壊さないための後方互換。
 */
const PLAN_KIND_ALIAS: Record<string, PlanKind> = {
  task: "task",
  habit: "habit",
  must: "task",
  should: "task",
  want: "task",
  fixed: "task",
};

export function normalizePlanKind(k: unknown): PlanKind {
  return (typeof k === "string" && PLAN_KIND_ALIAS[k]) || "task";
}

/** ユーザーが「今日やりたいこと」を性質つきで登録する（AI が並べる材料）。 */
export interface PlanItem {
  id?: number;
  date: DateKey;
  kind: PlanKind;
  title: string;
  /** 目安の所要時間（分）。任意。AI が枠を決める参考値。 */
  estMinutes: number | null;
  /** 任意。'HH:MM'。指定するとその時刻に固定して配置する（どの kind でも可）。 */
  fixedTime: string | null;
  order: number;
  createdAt: number;
}

/**
 * AI が提案し人間が編集した、1日のタイムブロック。
 * AI が「決める」のではなく下書きを出すだけで、各ブロックは常に編集可能（Trace の原則）。
 */
export interface PlanBlock {
  id?: number;
  date: DateKey;
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
  title: string;
  kind: PlanKind;
  done: boolean;
  order: number;
  /** 出所。ai = AI の下書き、manual = 人が追加・編集した。 */
  source: "ai" | "manual";
}

/** 起床/就寝の既定値（settings に保存され、AI の配置範囲になる）。 */
export const DEFAULT_WAKE = "07:00";
export const DEFAULT_SLEEP = "23:00";

/**
 * 毎週くり返す固定予定（時間割）。自然言語で入力 → AI が構造化して保存する。
 * 指定曜日に fromDate〜untilDate（前期末・クォーター切替など）の間ずっと自動で入る。
 */
export interface RecurringEvent {
  id?: number;
  /** 0=日 .. 6=土（Date#getDay と同じ並び）。 */
  weekday: number;
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
  title: string;
  fromDate: DateKey; // 有効開始（含む）
  untilDate: DateKey; // 有効終了（含む）
  createdAt: number;
}

/** 曜日表示（Date#getDay と同じ並び）。 */
export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/**
 * 毎日くり返す習慣（筋トレ・英単語など）。時刻は固定せず、毎日どこかの空き時間に入れる。
 * 曜日固定の時間割（RecurringEvent）と違い、時刻を持たず全ての日に効く。
 */
export interface DailyHabit {
  id?: number;
  title: string;
  estMinutes: number | null;
  createdAt: number;
}
