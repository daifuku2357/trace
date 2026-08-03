"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { gatherCandidates } from "@/lib/strengths";
import SelfSummary from "./SelfSummary";
import StrengthsScreen from "./StrengthsScreen";
import StarScreen from "./StarScreen";

/** 就活の自己分析ハブ: 傾向サマリー + 強み / STAR の切替。 */
export default function JobhuntScreen() {
  const candidateCount = useLiveQuery(() => gatherCandidates().then((c) => c.length), []);
  const enough = (candidateCount ?? 0) >= 3;
  const [tab, setTab] = useState<"strength" | "star">("strength");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[17px] font-bold">就活の自己分析</h1>
        <p className="mt-0.5 text-[12px] text-ink-3">
          貯めた日記から強み・エピソードを作ります。根拠は必ず実際の日記にリンク（＝盛らない）。文章は自分で直せます。
        </p>
      </header>

      <SelfSummary />

      <div className="inline-flex rounded-xl border border-rule bg-paper-2/60 p-0.5">
        {([
          ["strength", "強み"],
          ["star", "STAR"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`rounded-lg px-6 py-1.5 text-sm font-bold transition ${
              tab === id ? "bg-paper text-ink shadow-soft" : "text-ink-3 hover:text-ink-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "strength" ? <StrengthsScreen enough={enough} /> : <StarScreen enough={enough} />}
    </div>
  );
}
