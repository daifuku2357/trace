"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { countChars, getAnalysis, getEntry, saveEntry } from "@/lib/db";
import { analyzeDate } from "@/lib/analysis";
import { classifyDate } from "@/lib/tasks";
import { entryXp } from "@/lib/growth";
import { celebrate } from "@/lib/celebrate";
import { addDays, formatLong, isFuture, relativeLabel, todayKey } from "@/lib/date";
import { MIN_CHARS, type DateKey } from "@/lib/types";
import StatusChip, { statusOf } from "./StatusChip";
import AnalysisPanel from "./AnalysisPanel";
import TaskPanel from "./TaskPanel";
import HomeDashboard from "./HomeDashboard";

const AUTOSAVE_MS = 3_000;
/** 自動分析は入力が落ち着いてから。3秒ごとに叩くとAPIを浪費するため別タイマーにする。 */
const AUTO_ANALYZE_IDLE_MS = 20_000;

type SaveState = "idle" | "dirty" | "saving" | "saved";

export default function DiaryScreen({ date }: { date: DateKey }) {
  const [body, setBody] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  // タグ入力は廃止。既存エントリのタグは保存時に温存するためだけに保持する。
  const [tags, setTags] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyzeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 最新値を保持し、アンマウント時の flush で古い state を保存しないようにする。 */
  const latest = useRef({ body: "", mood: null as number | null, tags: [] as string[] });
  /** 読み込み直後の値。これと一致する間は「未編集」とみなし、無駄な保存も分析もしない。 */
  const baseline = useRef("");
  /** すでに「本記入（10字以上）」に達しているか。初めて達したときだけ保存を祝う。 */
  const wasFull = useRef(false);

  const analysis = useLiveQuery(() => getAnalysis(date), [date]);
  const charCount = countChars(body);
  const canSave = charCount >= MIN_CHARS;
  const aiMood = moodFromSentiment(analysis?.sentimentScore ?? 0);

  latest.current = { body, mood, tags };

  // 日付が変わったら読み直す。
  useEffect(() => {
    let active = true;
    setLoaded(false);
    void getEntry(date).then((e) => {
      if (!active) return;
      const b = e?.body ?? "";
      const m = e?.moodManual ?? null;
      const t = e?.tags ?? [];
      baseline.current = snapshot(b, m);
      setBody(b);
      setMood(m);
      setTags(t);
      setSavedAt(e?.updatedAt ?? null);
      setSaveState("idle");
      wasFull.current = (e?.charCount ?? 0) >= MIN_CHARS;
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [date]);

  const isToday = date === todayKey();

  // 起動〜入力欄フォーカスまで2秒以内（仕様書 §2）。読み込み完了と同時に当てる。
  // 今日は上部のダッシュボードを隠さないよう、スクロールは動かさずフォーカスだけ当てる。
  useEffect(() => {
    if (loaded && !preview) textareaRef.current?.focus({ preventScroll: isToday });
  }, [loaded, preview, isToday]);

  const persist = useCallback(async () => {
    const { body: b, mood: m, tags: t } = latest.current;
    const chars = countChars(b);
    if (chars > 0 && chars < MIN_CHARS) {
      // 10文字未満は保存成立しない。入力途中なので何もしない。
      setSaveState("dirty");
      return;
    }
    setSaveState("saving");
    // 通常エディタで書けば本記入（軽い記入フラグは解除）。
    await saveEntry({ date, body: b, moodManual: m, tags: t, isLightMode: false });
    baseline.current = snapshot(b, m);
    setSavedAt(Date.now());
    setSaveState("saved");

    // 今日の本記入に初めて達したら祝う（ドーパミンの起点）。
    const full = chars >= MIN_CHARS;
    if (date === todayKey() && full && !wasFull.current) {
      celebrate({
        kind: "save",
        title: "今日の記録を保存",
        detail: `+${entryXp({ charCount: chars, isLightMode: false })} XP`,
      });
    }
    wasFull.current = full;
  }, [date]);

  const scheduleAnalysis = useCallback(() => {
    if (analyzeTimer.current) clearTimeout(analyzeTimer.current);
    analyzeTimer.current = setTimeout(() => {
      // 感情分析（§3.3）とタスク分類（§3.7）を入力が落ち着いてからまとめて走らせる。
      void analyzeDate(date).catch(() => {});
      void classifyDate(date).catch(() => {});
    }, AUTO_ANALYZE_IDLE_MS);
  }, [date]);

  // 3秒デバウンスの自動保存（仕様書 §3.1）。
  useEffect(() => {
    if (!loaded) return;
    // 読み込んだままの内容なら保存も分析も走らせない。
    if (snapshot(body, mood) === baseline.current) return;
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist().then(scheduleAnalysis);
    }, AUTOSAVE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [body, mood, loaded, persist, scheduleAnalysis]);

  // 画面を離れる／タブを閉じるときは待たずに書き出す。
  useEffect(() => {
    const flush = () => {
      if (!loaded) return;
      const { body: b, mood: m } = latest.current;
      if (snapshot(b, m) === baseline.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void persist();
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      flush();
      if (analyzeTimer.current) clearTimeout(analyzeTimer.current);
    };
  }, [loaded, persist]);

  const status = statusOf(canSave, !!analysis);
  const prev = addDays(date, -1);
  const next = addDays(date, 1);

  return (
    <div>
      {/* 今日はホーム上部に状況ダッシュボード（挨拶・状況・集中メーター・一手・未処理）。 */}
      {isToday && <HomeDashboard date={date} />}

      {/* 日付ナビゲーション。過去日の遡り入力に対応（§3.1）。 */}
      <div className="rule-b flex items-center justify-between pb-2">
        <Link href={`/entry/${prev}`} className="px-1 py-1 text-sm text-ai hover:underline">
          ← 前の日
        </Link>
        <div className="text-center">
          <div className="text-[15px] font-bold">{formatLong(date)}</div>
          <div className="text-[11px] text-ink-3">{relativeLabel(date)}</div>
        </div>
        {isFuture(next) ? (
          <span className="px-1 py-1 text-sm text-ink-3">次の日 →</span>
        ) : (
          <Link href={`/entry/${next}`} className="px-1 py-1 text-sm text-ai hover:underline">
            次の日 →
          </Link>
        )}
      </div>

      <div className="flex items-center justify-between py-2">
        <StatusChip status={status} />
        <span className="text-[11px] text-ink-3" aria-live="polite">
          {saveStateLabel(saveState, savedAt, charCount)}
        </span>
      </div>

      {preview ? (
        <div className="md min-h-[16rem] border border-rule p-3 text-[15px]">
          {body.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          ) : (
            <p className="text-ink-3">まだ何も書かれていません。</p>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={isToday ? "今日は何をした？" : "この日のことを書く"}
          spellCheck={false}
          className="min-h-[16rem] w-full resize-y border border-rule bg-paper p-3 text-[15px] leading-7 outline-none placeholder:text-ink-3 focus:border-ai"
        />
      )}

      <div className="flex items-center justify-between py-2 text-xs">
        <span className={charCount > 0 && !canSave ? "text-ink-2" : "text-ink-3"}>
          <span className="num">{charCount}</span> 字
          {charCount > 0 && !canSave && `（保存にはあと ${MIN_CHARS - charCount} 字）`}
        </span>
        <button type="button" className="btn !px-2 !py-1 !text-xs" onClick={() => setPreview((p) => !p)}>
          {preview ? "編集に戻る" : "プレビュー"}
        </button>
      </div>

      {/* 任意項目。未入力でも保存は成立する（§2 入力負荷）。 */}
      <section className="rule-t space-y-3 py-3">
        {/* 気分は人が選ばず、AI（感情分析）が本文から自動で判定する。 */}
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-ink-2">気分</span>
          {analysis ? (
            <div className="flex flex-wrap items-center gap-2">
              <span aria-hidden className="text-lg leading-none">
                {aiMood.face}
              </span>
              <span className="text-sm">{aiMood.label}</span>
              <span className="num text-[11px] text-ink-3">
                AI判定 {analysis.sentimentScore >= 0 ? "+" : ""}
                {analysis.sentimentScore.toFixed(2)}
              </span>
            </div>
          ) : (
            <span className="text-xs text-ink-3">
              {canSave ? "分析待ち（自動で判定します）" : "記入すると AI が気分を判定します"}
            </span>
          )}
        </div>
      </section>

      <TaskPanel date={date} canClassify={canSave} onBeforeClassify={persist} />

      <AnalysisPanel date={date} analysis={analysis} canAnalyze={canSave} onBeforeAnalyze={persist} />
    </div>
  );
}

/** 編集有無の判定にだけ使う、入力内容の同一性キー。 */
function snapshot(body: string, mood: number | null): string {
  return `${mood ?? "-"} ${body}`;
}

/** 感情スコア(-1〜+1)を気分の表情・言葉に変換する（AI判定の可視化）。 */
function moodFromSentiment(score: number): { face: string; label: string } {
  if (score >= 0.45) return { face: "😄", label: "とても良い" };
  if (score >= 0.15) return { face: "🙂", label: "良い" };
  if (score > -0.15) return { face: "😐", label: "ふつう" };
  if (score > -0.45) return { face: "😕", label: "沈みがち" };
  return { face: "😣", label: "つらい" };
}

function saveStateLabel(state: SaveState, savedAt: number | null, charCount: number): string {
  if (state === "saving") return "保存中…";
  if (state === "dirty" && charCount > 0 && charCount < MIN_CHARS) return "未保存";
  if (state === "dirty") return "編集中…";
  if (savedAt) {
    const d = new Date(savedAt);
    return `保存済 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return "";
}
