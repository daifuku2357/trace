"use client";

import { countChars, db, getAnalysis } from "./db";
import { addDays, fromKey, monthKey, todayKey } from "./date";
import { deleteSetting, getSetting, setSetting, useSetting } from "./settings";
import { analyzeDate } from "./analysis";
import { classifyDate } from "./tasks";
import { MIN_CHARS, type DateKey, type FocusSession, type Goal, type TaskCategory } from "./types";

/**
 * デモデータの投入 / 全消去。
 *
 * このアプリはデータをブラウザ内 IndexedDB にしか持たないため、初回起動時のDBは空。
 * 空のままだと「価値が伝わらない」ので、傾向を含んだ約50日分の日記を投入して体験できる。
 *
 * 【重要】分析は捏造しない。投入するのは日記の「本文」だけで、感情分析（§3.3）と
 * タスク分類（§3.7）は本物の Gemini に実行させる。投入後にバックグラウンドで順に
 * 分析キューを流す（30 RPM を厳守）。＝ デモの分析結果も実データと同じ経路で作られる。
 *
 * 本文の生成は決定的（固定シード）なので、何度入れても同じ日記になる。
 */

const DEMO_FLAG = "demoLoaded";
/** 立っている間、バックグラウンドでデモの分析を流す。完了で消える。 */
const DEMO_ANALYZE_FLAG = "demoAnalyze";

export function useDemoLoaded(): boolean | undefined {
  const v = useSetting(DEMO_FLAG);
  return v === undefined ? undefined : v === "1";
}

/** 固定シードの擬似乱数（GrowthTree と同じ実装）。 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Scene {
  cat: TaskCategory;
  keywords: string[];
  /** 本文の情感の目安（フレーバー文の選択にだけ使う。分析は本物の Gemini が行う）。 */
  flavor: number;
  bodies: string[];
}

const SCENES: Record<string, Scene> = {
  study: {
    cat: "study",
    keywords: ["統計学", "課題", "勉強"],
    flavor: 0.2,
    bodies: [
      "統計学の課題に取り組んだ。最初は分からなかった検定の考え方が、手を動かすうちに腑に落ちてきた。積み重ねると理解が進む感覚がある。",
      "図書館で3時間集中して勉強した。周りも頑張っていると自分も自然と集中できる。今日はページが進んだ。",
      "授業の復習をまとめ直した。ノートを自分の言葉で書き換えると記憶に残る気がする。",
    ],
  },
  make: {
    cat: "make",
    keywords: ["ポートフォリオ", "実装", "制作"],
    flavor: 0.3,
    bodies: [
      "個人開発のアプリに機能を追加した。詰まっていたバグの原因がやっと分かって、直った瞬間は気持ちいい。少しずつ形になってきた。",
      "ポートフォリオのUIを整えた。細部を詰めると全体の印象がぐっと良くなる。作っている時間が一番楽しい。",
      "新しいコンポーネントを実装。設計を先に考えたおかげで手戻りが少なかった。",
    ],
  },
  research: {
    cat: "research",
    keywords: ["論文", "研究室", "ゼミ"],
    flavor: 0,
    bodies: [
      "研究室でゼミの準備。論文を読み込むのは骨が折れるが、面白いテーマではある。発表までにまとめきれるか少し不安。",
      "先行研究を3本読んだ。自分のテーマとの差分が少し見えてきた気がする。",
    ],
  },
  jobhunt: {
    cat: "jobhunt",
    keywords: ["面接", "ES", "自己分析"],
    flavor: -0.05,
    bodies: [
      "面接の練習をした。自分の強みを言葉にするのが難しい。日記を見返すと意外とエピソードが出てくる。",
      "ESを書き進めた。ガクチカのネタを掘り下げると、続けてきたことの意味が見えてくる。",
      "説明会に参加。業界のことが少し分かってきたが、志望動機をどう固めるか悩む。",
    ],
  },
  rest: {
    cat: "rest",
    keywords: ["休息", "散歩", "リフレッシュ"],
    flavor: 0.3,
    bodies: [
      "今日はしっかり休んだ。散歩して気分転換。休むのも大事だと最近思う。",
      "何もしない日にした。よく眠れて頭がすっきりした。",
    ],
  },
  social: {
    cat: "social",
    keywords: ["友人", "家族", "会話"],
    flavor: 0.25,
    bodies: [
      "友人と久しぶりに会って話した。近況を共有すると刺激をもらえる。やる気が出てきた。",
      "家族と夕飯。他愛のない会話でほっとする時間だった。",
    ],
  },
  chore: {
    cat: "chore",
    keywords: ["雑務", "事務", "手続き"],
    flavor: -0.25,
    bodies: [
      "溜まっていた事務手続きを片付けた。面倒だが終わるとすっきり。時間は取られた。",
      "部屋の片付けと雑用で一日が終わってしまった。やるべきことが進まず少し焦る。",
    ],
  },
};

function pickScene(r: number, recent: boolean): Scene {
  // 直近ほど就活・制作の話題が増える（＝キーワードの増加トレンドを作る）。
  if (recent) {
    if (r < 0.28) return SCENES.jobhunt;
    if (r < 0.55) return SCENES.make;
    if (r < 0.7) return SCENES.study;
    if (r < 0.8) return SCENES.research;
    if (r < 0.88) return SCENES.rest;
    if (r < 0.95) return SCENES.social;
    return SCENES.chore;
  }
  if (r < 0.22) return SCENES.study;
  if (r < 0.42) return SCENES.make;
  if (r < 0.55) return SCENES.research;
  if (r < 0.68) return SCENES.rest;
  if (r < 0.8) return SCENES.social;
  if (r < 0.9) return SCENES.jobhunt;
  return SCENES.chore;
}

const noon = (date: DateKey) => fromKey(date).getTime() + 12 * 3600_000;

/**
 * デモの日記本文を投入する（分析はしない）。既にデータがあれば何もしない。
 * 投入後 DEMO_ANALYZE_FLAG を立て、DemoAnalysisRunner が本物の Gemini で順に分析する。
 */
export async function loadDemoData(): Promise<void> {
  const existing = await db.entries.count();
  if (existing > 0) throw new Error("既にデータがあります。デモは空の状態でのみ投入できます。");

  const today = todayKey();
  const N = 50;
  const r = mulberry32(20260728);

  for (let off = N - 1; off >= 0; off--) {
    const date = addDays(today, -off);
    const wd = fromKey(date).getDay();
    const recent = off <= 24;
    const forceWrite = off < 12; // 直近12日は連続記入（ストリーク演出）
    if (!forceWrite && r() < 0.2) continue; // 約2割は未記入

    const scene = pickScene(r(), recent);
    const hasFocus = r() < (["study", "make", "research", "jobhunt"].includes(scene.cat) ? 0.7 : 0.25);

    // 本文＝日記だけ。フレーバー文で情感に変化を付ける（分析は本物の Gemini が読む）。
    const flavor =
      (scene.flavor >= 0.2 ? "\n良い一日だった。" : scene.flavor < 0 ? "\n少し疲れた。切り替えよう。" : "") +
      (wd === 1 ? "\n週の始まりで少し気が重い。" : "");
    const body = scene.bodies[Math.floor(r() * scene.bodies.length)] + flavor;
    const t = noon(date);

    const entryId = (await db.entries.add({
      date,
      body,
      charCount: countChars(body),
      moodManual: null,
      tags: [],
      createdAt: t,
      updatedAt: t,
      isLightMode: false,
    })) as number;

    // 集中セッション（非AI。木の成長と集中×気分の相関の素材）
    if (hasFocus) {
      const sessions = r() < 0.4 ? 2 : 1;
      for (let k = 0; k < sessions; k++) {
        const minutes = [25, 50, 50, 45][Math.floor(r() * 4)];
        const startedAt = t + k * 90 * 60_000;
        const s2: FocusSession = {
          date,
          category: scene.cat,
          minutes,
          startedAt,
          endedAt: startedAt + minutes * 60_000,
        };
        await db.focusSessions.add(s2);
      }
    }
    void entryId;
  }

  await seedGoals();
  await seedTodayPlan();

  await setSetting("planWake", "07:00");
  await setSetting("planSleep", "23:30");
  await setSetting(DEMO_FLAG, "1");
  // バックグラウンド分析を開始させる（DemoAnalysisRunner が拾う）。
  await setSetting(DEMO_ANALYZE_FLAG, "1");
}

/**
 * デモ（＝未分析の全日記）を本物の Gemini で順に分析＋分類する。
 * 30 RPM を厳守するため、各リクエストの開始を最低 (60/30)=2秒 空ける（余裕を見て 2.2秒）。
 * 既に分析/分類済みの日はスキップするので、中断しても再開できる。
 * DEMO_ANALYZE_FLAG が外れたら（全消去など）途中で止める。
 */
export async function runDemoAnalysis(onProgress?: (done: number, total: number) => void): Promise<void> {
  const entries = (await db.entries.toArray())
    .filter((e) => e.charCount >= MIN_CHARS)
    .sort((a, b) => a.date.localeCompare(b.date));
  const total = entries.length;

  const MIN_INTERVAL = Math.ceil(60_000 / 30) + 200; // ≈2200ms → 実効 ≤ ~27 req/min
  let last = 0;
  const pace = async () => {
    const wait = MIN_INTERVAL - (Date.now() - last);
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    last = Date.now();
  };

  let done = 0;
  for (const e of entries) {
    if ((await getSetting(DEMO_ANALYZE_FLAG)) !== "1") break; // 取り消された
    if (!(await getAnalysis(e.date))) {
      await pace();
      await analyzeDate(e.date);
    }
    if ((await db.tasks.where("date").equals(e.date).count()) === 0) {
      await pace();
      await classifyDate(e.date);
    }
    done++;
    onProgress?.(done, total);
  }
  await deleteSetting(DEMO_ANALYZE_FLAG);
}

/** 目標ツリー（Lv1→Lv3。最小段は週次）を1本入れる。進捗は葉から積み上げる。 */
async function seedGoals() {
  const now = Date.now();
  const add = (g: Omit<Goal, "id">) => db.goals.add(g as Goal) as Promise<number>;

  const rootId = await add({
    parentId: null, rootId: null, level: 1,
    title: "エンジニアとして納得のいく就職をする",
    status: "todo", dueDate: null, progress: 0, order: 0, source: "manual",
    createdAt: now, updatedAt: now,
  });
  await db.goals.update(rootId, { rootId });

  const lv2 = await add({
    parentId: rootId, rootId, level: 2,
    title: "3ヶ月でポートフォリオを完成させる",
    status: "todo", dueDate: monthKey(addDays(todayKey(), 80)), progress: 0, order: 0, source: "manual",
    createdAt: now, updatedAt: now,
  });
  // Lv3（週次＝葉）: 1つ完了・1つ未完了。
  await add({
    parentId: lv2, rootId, level: 3,
    title: "今週：認証機能を実装する",
    status: "todo", dueDate: null, progress: 0, order: 0, source: "manual",
    createdAt: now, updatedAt: now,
  });
  await add({
    parentId: lv2, rootId, level: 3,
    title: "今週：READMEに使い方を書く",
    status: "done", dueDate: null, progress: 1, order: 1, source: "manual",
    createdAt: now, updatedAt: now,
  });

  // 葉が 1/2 完了 → 上位も 0.5（recomputeTree と同じ結果を手で反映）。
  await db.goals.update(lv2, { progress: 0.5 });
  await db.goals.update(rootId, { progress: 0.5 });
}

/** 今日の組み立て（タイムブロック）。午前ぶんは完了済みにして「いま/次」を見せる。 */
async function seedTodayPlan() {
  const date = todayKey();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const blocks: { start: string; end: string; title: string; kind: import("./types").PlanKind }[] = [
    { start: "07:30", end: "08:00", title: "朝食・身支度", kind: "task" },
    { start: "09:00", end: "10:30", title: "ポートフォリオ実装", kind: "task" },
    { start: "10:45", end: "12:00", title: "統計学の課題", kind: "task" },
    { start: "12:00", end: "13:00", title: "昼食・休憩", kind: "task" },
    { start: "13:00", end: "14:30", title: "ES ブラッシュアップ", kind: "task" },
    { start: "15:00", end: "15:30", title: "英単語（習慣）", kind: "habit" },
    { start: "19:00", end: "20:00", title: "散歩でリフレッシュ", kind: "task" },
  ];
  await db.planBlocks.bulkAdd(
    blocks.map((b, i) => ({
      ...b,
      date,
      done: toMin(b.end) <= nowMin, // 現在時刻より前に終わる枠は完了扱い
      order: i,
      source: "ai" as const,
    })) as import("./types").PlanBlock[],
  );

  await db.planItems.bulkAdd([
    { date, kind: "task", title: "ポートフォリオ実装", estMinutes: 90, fixedTime: null, order: 0, createdAt: Date.now() },
    { date, kind: "task", title: "統計学の課題", estMinutes: 75, fixedTime: null, order: 1, createdAt: Date.now() },
    { date, kind: "task", title: "ES ブラッシュアップ", estMinutes: 90, fixedTime: null, order: 2, createdAt: Date.now() },
  ]);
}

/**
 * すべてのデータを消去して空の状態に戻す（デモの取り消し／リセット）。
 * データ系テーブルを丸ごと空にし、デモ・一時系の設定フラグも消す。
 */
export async function clearAllData(): Promise<void> {
  await Promise.all([
    db.entries.clear(),
    db.analyses.clear(),
    db.analysisJobs.clear(),
    db.tasks.clear(),
    db.goals.clear(),
    db.categoryCorrections.clear(),
    db.focusSessions.clear(),
    db.planItems.clear(),
    db.planBlocks.clear(),
    db.recurringEvents.clear(),
    db.dailyHabits.clear(),
    db.strengths.clear(),
    db.starEpisodes.clear(),
  ]);
  await Promise.all([
    deleteSetting(DEMO_FLAG),
    deleteSetting(DEMO_ANALYZE_FLAG),
    deleteSetting("activeFocus"),
    deleteSetting("planWake"),
    deleteSetting("planSleep"),
    deleteSetting("seenLevel"),
    deleteSetting("seenStreakMilestone"),
  ]);
}
