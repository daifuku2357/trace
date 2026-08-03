"use client";

import { useState } from "react";
import { useSetting, setSetting } from "@/lib/settings";
import { loadDemoData } from "@/lib/demo";

/**
 * 初回オンボーディング（3画面）。何のためのアプリかを伝え、最後に
 * 「デモを入れて試す」か「空のまま始める」を選ばせる。
 * 一度閉じれば設定 `onboarded` が立ち、二度と出ない。
 */
const SLIDES = [
  {
    icon: "🖊️",
    title: "書くだけで、自己分析が貯まる",
    body: "毎日の日記をただ書くだけ。AIが感情や行動の傾向を読み取り、あとから振り返れる自己分析の素材になります。",
  },
  {
    icon: "🌱",
    title: "続く仕掛けがある",
    body: "書くほどに木が育ち、集中した時間でレベルが上がる。連続記録やお祝いで、続けること自体が楽しくなります。",
  },
  {
    icon: "🎯",
    title: "就活の成果物に変わる",
    body: "貯めた記録から、強み・STARエピソード・傾向インサイトを生成。エントリーシートや面接の準備にそのまま使えます。",
  },
];

export default function Onboarding() {
  const onboarded = useSetting("onboarded");
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);

  // 設定の読み込み中(undefined)は何も出さない。既に完了なら出さない。
  if (onboarded === undefined || onboarded === "1") return null;

  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  const finish = async (withDemo: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (withDemo) await loadDemoData();
    } catch {
      // 既にデータがある等で失敗しても、オンボーディングは閉じる。
    } finally {
      await setSetting("onboarded", "1");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div className="animate-overlayIn w-full max-w-app overflow-hidden rounded-2xl border border-rule bg-paper shadow-soft">
        <div className="px-6 pb-4 pt-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-grow-weak text-4xl">
            {slide.icon}
          </div>
          <h2 className="text-lg font-bold">{slide.title}</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-2">{slide.body}</p>
        </div>

        {/* ドット */}
        <div className="flex justify-center gap-1.5 pb-4">
          {SLIDES.map((_, k) => (
            <span
              key={k}
              className={`h-1.5 rounded-full transition-all ${
                k === i ? "w-5 bg-grow" : "w-1.5 bg-rule"
              }`}
            />
          ))}
        </div>

        <div className="border-t border-rule p-4">
          {!last ? (
            <div className="flex items-center justify-between">
              <button
                onClick={() => void finish(false)}
                className="px-3 py-2 text-sm text-ink-3 hover:text-ink-2"
              >
                スキップ
              </button>
              <button
                onClick={() => setI((v) => v + 1)}
                className="rounded-xl bg-grow px-5 py-2.5 text-sm font-bold text-paper transition-transform active:scale-95"
              >
                次へ
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => void finish(true)}
                disabled={busy}
                className="w-full rounded-xl bg-grow py-3 text-sm font-bold text-paper transition-transform active:scale-95 disabled:opacity-60"
              >
                {busy ? "サンプルを準備中…" : "デモデータを入れて試す"}
              </button>
              <button
                onClick={() => void finish(false)}
                disabled={busy}
                className="w-full rounded-xl border border-rule py-3 text-sm font-medium text-ink-2 transition-transform active:scale-95 disabled:opacity-60"
              >
                空のまま始める
              </button>
              <p className="pt-1 text-center text-[11px] text-ink-3">
                日記の分析は本物の Gemini が順に実行します。いつでも設定から消せます。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
