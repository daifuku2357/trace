"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { backfillMissing } from "@/lib/analysis";
import { db } from "@/lib/db";
import { exportJson, exportMarkdown, importJson } from "@/lib/export";
import { clearAllData, loadDemoData, useDemoLoaded } from "@/lib/demo";

/** 設定タブ: エクスポート / インポート / 未分析分の遡り適用。 */
export default function SettingsPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = useLiveQuery(async () => ({
    entries: await db.entries.count(),
    analyses: await db.analyses.count(),
    queued: await db.analysisJobs.count(),
  }));
  const demoLoaded = useDemoLoaded();
  const hasData = (counts?.entries ?? 0) > 0;

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setMessage(null);
    try {
      setMessage(await fn());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "失敗しました。");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <h1 className="rule-b pb-2 text-sm font-bold tracking-wider">保存状況</h1>
        <dl className="grid grid-cols-3 divide-x divide-rule border-b border-rule">
          <Stat label="日記" value={counts?.entries ?? 0} unit="件" />
          <Stat label="分析済" value={counts?.analyses ?? 0} unit="件" />
          <Stat label="分析待ち" value={counts?.queued ?? 0} unit="件" />
        </dl>
        <p className="pt-2 text-[11px] text-ink-3">
          データはこの端末のブラウザ内（IndexedDB）にのみ保存されます。
          ブラウザのデータを削除すると失われるため、定期的にエクスポートしてください。
        </p>
      </section>

      <section>
        <h2 className="rule-b pb-2 text-sm font-bold tracking-wider">デモデータ</h2>
        <div className="pt-3">
          <p className="pb-3 text-[12px] leading-relaxed text-ink-2">
            約50日分のサンプル日記（本文＋集中・目標・当日の予定）をワンタップで投入します。
            <span className="text-ink">感情分析とタスク分類は捏造せず、本物の Gemini が投入後に順に実行します</span>
            （30 req/分・要 <code className="bg-ai-weak px-1">GEMINI_API_KEY</code>）。
            進捗は画面下部に出ます。「消す」でいつでも空に戻せます。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn"
              disabled={busy !== null || hasData}
              onClick={() =>
                void run("demo", async () => {
                  await loadDemoData();
                  return "デモの日記を投入しました。Gemini が順に分析を開始します（画面下部に進捗）。";
                })
              }
            >
              {busy === "demo" ? "投入中…" : "デモデータを入れて試す"}
            </button>
            <button
              className="btn border-flame text-flame"
              disabled={busy !== null || !hasData}
              onClick={() => {
                if (!window.confirm("すべてのデータ（日記・分析・目標・就活など）を削除して空に戻します。よろしいですか？")) return;
                void run("clear", async () => {
                  await clearAllData();
                  return "すべてのデータを削除しました。空の状態に戻りました。";
                });
              }}
            >
              {busy === "clear" ? "削除中…" : "すべてのデータを消す"}
            </button>
          </div>
          {hasData && demoLoaded === false && (
            <p className="pt-2 text-[11px] text-ink-3">
              ※ 既にあなたのデータが入っています。デモ投入は空の状態のときのみ行えます。
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="rule-b pb-2 text-sm font-bold tracking-wider">エクスポート</h2>
        <div className="flex flex-wrap gap-2 pt-3">
          <button
            className="btn"
            disabled={busy !== null}
            onClick={() => void run("md", async () => (await exportMarkdown(), "Markdown を書き出しました。"))}
          >
            Markdown で書き出す
          </button>
          <button
            className="btn"
            disabled={busy !== null}
            onClick={() => void run("json", async () => (await exportJson(), "JSON を書き出しました。"))}
          >
            JSON で書き出す
          </button>
        </div>
        <p className="pt-2 text-[11px] text-ink-3">
          JSON は本文と分析結果を分けて出力します。インポートで完全に復元できます。
        </p>
      </section>

      <section>
        <h2 className="rule-b pb-2 text-sm font-bold tracking-wider">インポート</h2>
        <div className="pt-3">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void run("import", async () => {
                const r = await importJson(file);
                return `日記 ${r.entries}件・分析 ${r.analyses}件・タスク ${r.tasks}件・目標 ${r.goals}件・組み立て ${r.plan}件・時間割 ${r.recurring}件・習慣 ${r.habit}件・強み ${r.strength}件・STAR ${r.star}件を取り込みました。`;
              });
            }}
          />
          <button className="btn" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
            JSON を読み込む
          </button>
          <p className="pt-2 text-[11px] text-ink-3">同じ日付の日記は上書きされます。</p>
        </div>
      </section>

      <section>
        <h2 className="rule-b pb-2 text-sm font-bold tracking-wider">分析</h2>
        <div className="pt-3">
          <button
            className="btn"
            disabled={busy !== null}
            onClick={() =>
              void run("backfill", async () => {
                const n = await backfillMissing();
                return n > 0 ? `${n}件を分析しました。` : "分析対象はありませんでした。";
              })
            }
          >
            {busy === "backfill" ? "分析中…" : "未分析の日記をまとめて分析"}
          </button>
          <p className="pt-2 text-[11px] text-ink-3">
            分析は本文と分けて保存されるため、後から過去の日記にも遡って適用できます。
            実行には <code className="bg-ai-weak px-1">.env</code> の{" "}
            <code className="bg-ai-weak px-1">GEMINI_API_KEY</code> が必要です。
          </p>
        </div>
      </section>

      {message && (
        <p className="border-l-2 border-ai py-1 pl-2 text-sm text-ink-2" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="px-2 py-2 text-center">
      <dt className="text-[10px] text-ink-3">{label}</dt>
      <dd className="mt-0.5">
        <span className="num text-lg font-bold">{value.toLocaleString("ja-JP")}</span>
        <span className="ml-0.5 text-[10px] text-ink-2">{unit}</span>
      </dd>
    </div>
  );
}
