"use client";

import { useState } from "react";
import { analyzeDate } from "@/lib/analysis";
import {
  EMOTION_LABELS,
  EMOTION_LABEL_JA,
  type Analysis,
  type DateKey,
  type EmotionLabel,
} from "@/lib/types";

/**
 * 感情分析の結果表示（仕様書 §3.3）。
 * 本文とは罫線で明確に分け、「これは生成物である」ことをモデル名の明示で担保する。
 */
export default function AnalysisPanel({
  date,
  analysis,
  canAnalyze,
  onBeforeAnalyze,
}: {
  date: DateKey;
  analysis: Analysis | undefined;
  canAnalyze: boolean;
  onBeforeAnalyze: () => Promise<void>;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (force: boolean) => {
    setRunning(true);
    setError(null);
    try {
      // 保存前の本文で分析しないよう、先に確定させる。
      await onBeforeAnalyze();
      const result = await analyzeDate(date, force);
      if (result === "failed") {
        setError("分析できませんでした。オフラインか、APIキーが未設定の可能性があります。");
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="rule-t py-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-wider text-ink-2">感情分析</h2>
        <button
          type="button"
          className="btn !px-2 !py-1 !text-xs"
          disabled={!canAnalyze || running}
          onClick={() => void run(!!analysis)}
        >
          {running ? "分析中…" : analysis ? "再分析" : "分析する"}
        </button>
      </div>

      {error && <p className="mt-2 border-l-2 border-ai pl-2 text-xs text-ink-2">{error}</p>}

      {!analysis && !error && (
        <p className="mt-2 text-xs text-ink-3">
          {canAnalyze
            ? "入力が落ち着くと自動で分析されます。"
            : "本文が10字以上になると分析できます。"}
        </p>
      )}

      {analysis && (
        <div className="mt-3 space-y-3">
          <SentimentBar score={analysis.sentimentScore} />

          <div>
            <div className="mb-1 text-[11px] text-ink-3">感情ラベル</div>
            <ul className="space-y-1">
              {[...EMOTION_LABELS]
                .sort((a, b) => analysis.labels[b] - analysis.labels[a])
                .map((label) => (
                  <LabelRow key={label} label={label} value={analysis.labels[label] ?? 0} />
                ))}
            </ul>
          </div>

          <div>
            <div className="mb-1 text-[11px] text-ink-3">キーワード</div>
            <div className="flex flex-wrap gap-1">
              {analysis.keywords.length ? (
                analysis.keywords.map((k) => (
                  <span key={k} className="border border-ai px-1.5 py-0.5 text-xs text-ai">
                    {k}
                  </span>
                ))
              ) : (
                <span className="text-xs text-ink-3">なし</span>
              )}
            </div>
          </div>

          {/* 再解析可能にするためモデル名とプロンプト版を残す（§3.3）。 */}
          <p className="text-[11px] text-ink-3">
            {analysis.model} / {analysis.promptVersion} ・{" "}
            <span className="num">{new Date(analysis.analyzedAt).toLocaleString("ja-JP")}</span>
          </p>
        </div>
      )}
    </section>
  );
}

/** -1〜+1 を中央基準の水平バーで示す。数値も併記する。 */
function SentimentBar({ score }: { score: number }) {
  const pct = Math.abs(score) * 50;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] text-ink-3">感情スコア</span>
        <span className="num text-sm">
          {score > 0 ? "+" : ""}
          {score.toFixed(2)}
        </span>
      </div>
      <div className="relative h-3 border border-rule">
        <div className="absolute inset-y-0 left-1/2 w-px bg-rule-strong" />
        <div
          className="absolute inset-y-0 bg-ai"
          style={
            score >= 0
              ? { left: "50%", width: `${pct}%` }
              : { right: "50%", width: `${pct}%` }
          }
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-ink-3">
        <span>−1.0</span>
        <span>0</span>
        <span>+1.0</span>
      </div>
    </div>
  );
}

function LabelRow({ label, value }: { label: EmotionLabel; value: number }) {
  return (
    <li className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-xs text-ink-2">{EMOTION_LABEL_JA[label]}</span>
      <span className="h-2 flex-1 border border-rule">
        <span className="block h-full bg-ai" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="num w-8 shrink-0 text-right text-[11px] text-ink-3">{value.toFixed(2)}</span>
    </li>
  );
}
