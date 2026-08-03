"use client";

import Dexie, { type EntityTable } from "dexie";
import type {
  Analysis,
  AnalysisJob,
  CategoryCorrection,
  DailyHabit,
  DateKey,
  Entry,
  FocusSession,
  Goal,
  PlanBlock,
  PlanItem,
  RecurringEvent,
  Setting,
  StarEpisode,
  Strength,
  Task,
} from "./types";
import { todayKey } from "./date";

/**
 * ローカル完結のストア（IndexedDB）。仕様書 §2「入力はローカル保存」に対応する。
 * entries と analyses を別テーブルに保つのは §8 の要件（本文と分析結果の分離）。
 */
class TraceDB extends Dexie {
  entries!: EntityTable<Entry, "id">;
  analyses!: EntityTable<Analysis, "id">;
  analysisJobs!: EntityTable<AnalysisJob, "date">;
  // Phase 3
  tasks!: EntityTable<Task, "id">;
  goals!: EntityTable<Goal, "id">;
  categoryCorrections!: EntityTable<CategoryCorrection, "id">;
  settings!: EntityTable<Setting, "key">;
  // 集中セッション
  focusSessions!: EntityTable<FocusSession, "id">;
  // 「今日の組み立て」
  planItems!: EntityTable<PlanItem, "id">;
  planBlocks!: EntityTable<PlanBlock, "id">;
  // 毎週の固定予定（時間割）
  recurringEvents!: EntityTable<RecurringEvent, "id">;
  // 毎日くり返す習慣
  dailyHabits!: EntityTable<DailyHabit, "id">;
  // 就活: 強み仮説
  strengths!: EntityTable<Strength, "id">;
  // 就活: STARエピソード
  starEpisodes!: EntityTable<StarEpisode, "id">;

  constructor() {
    super("trace");
    this.version(1).stores({
      entries: "++id, &date, updatedAt",
      analyses: "++id, entryId, &date, analyzedAt",
      analysisJobs: "date, status",
    });
    // Phase 3 で追加。既存テーブルは変更していないため再宣言は不要。
    this.version(2).stores({
      tasks: "++id, entryId, date, category",
      goals: "++id, parentId, rootId, level, status",
      categoryCorrections: "++id, correctedAt",
    });
    // v3 で秘書ブリーフィング用に briefings を作ったが、AIコメントを廃止したため v4 で削除する。
    this.version(3).stores({
      briefings: "[date+mode], date",
      settings: "key",
    });
    // 集中セッションを追加し、不要になった briefings を削除（null で store を落とす）。
    this.version(4).stores({
      briefings: null,
      focusSessions: "++id, date, category, startedAt",
    });
    // 「今日の組み立て」: その日のタスク素材(planItems)と生成された時間割(planBlocks)。
    this.version(5).stores({
      planItems: "++id, date, kind, order",
      planBlocks: "++id, date, order",
    });
    // 毎週くり返す固定予定（時間割）。曜日で引く。
    this.version(6).stores({
      recurringEvents: "++id, weekday",
    });
    // 毎日くり返す習慣（時刻なし・全日適用）。
    this.version(7).stores({
      dailyHabits: "++id",
    });
    // 就活: 強み仮説（根拠に実在の日記日付を持つ）。
    this.version(8).stores({
      strengths: "++id",
    });
    // 就活: STARエピソード。
    this.version(9).stores({
      starEpisodes: "++id",
    });
  }
}

export const db = new TraceDB();

/** 文字数は Unicode コードポイント単位で数える（絵文字を2文字と数えない）。 */
export function countChars(body: string): number {
  return [...body.trim()].length;
}

/**
 * 本文の同一性判定用ハッシュ。暗号用途ではなく、
 * 「本文が変わっていないなら再解析しない」ためだけに使う FNV-1a。
 */
export function hashBody(body: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export async function getEntry(date: DateKey): Promise<Entry | undefined> {
  return db.entries.where("date").equals(date).first();
}

export async function getAnalysis(date: DateKey): Promise<Analysis | undefined> {
  return db.analyses.where("date").equals(date).first();
}

export interface SaveInput {
  date: DateKey;
  body: string;
  moodManual: number | null;
  tags: string[];
  /** 2分ルールの軽い記入か。省略時は false（通常記入）。 */
  isLightMode?: boolean;
}

/**
 * 1日1エントリ。既存があれば更新、なければ作成。
 * 本文が空になった場合はエントリごと削除して「未記入」に戻す。
 */
export async function saveEntry(input: SaveInput): Promise<Entry | null> {
  const charCount = countChars(input.body);
  const now = Date.now();
  const existing = await getEntry(input.date);

  if (charCount === 0) {
    if (existing?.id != null) {
      await db.transaction(
        "rw",
        db.entries,
        db.analyses,
        db.analysisJobs,
        db.tasks,
        async () => {
          await db.analyses.where("entryId").equals(existing.id!).delete();
          await db.tasks.where("entryId").equals(existing.id!).delete();
          await db.analysisJobs.delete(input.date);
          await db.entries.delete(existing.id!);
        },
      );
    }
    return null;
  }

  if (existing?.id != null) {
    const patch = {
      body: input.body,
      charCount,
      moodManual: input.moodManual,
      tags: input.tags,
      updatedAt: now,
      // isLightMode は明示時のみ更新。通常エディタで書けば軽い記入フラグは解除される。
      ...(input.isLightMode !== undefined ? { isLightMode: input.isLightMode } : {}),
    };
    await db.entries.update(existing.id, patch);
    return { ...existing, ...patch };
  }

  const entry: Entry = {
    date: input.date,
    body: input.body,
    charCount,
    moodManual: input.moodManual,
    tags: input.tags,
    createdAt: now,
    updatedAt: now,
    isLightMode: input.isLightMode ?? false,
  };
  const id = await db.entries.add(entry);
  return { ...entry, id: id as number };
}

/** 記入済みの日付のうち最も古いもの。グラフの表示範囲決定に使う。 */
export async function firstEntryDate(): Promise<DateKey> {
  const first = await db.entries.orderBy("date").first();
  return first?.date ?? todayKey();
}
