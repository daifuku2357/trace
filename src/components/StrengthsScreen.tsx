"use client";

import { useState } from "react";
import Link from "next/link";
import { celebrate } from "@/lib/celebrate";
import { formatShort } from "@/lib/date";
import {
  addManualStrength,
  generateStrengths,
  removeEvidence,
  removeStrength,
  updateStrength,
  useStrengths,
} from "@/lib/strengths";
import type { DateKey, Strength } from "@/lib/types";

/**
 * 就活の自己分析: 強み仮説の画面。
 * 蓄積した日記から AI が強みを抽出し、必ず裏付けの日記へリンクする（捏造防止）。
 * すべて人間が編集・追加・削除できる。
 */
export default function StrengthsScreen({ enough }: { enough: boolean }) {
  const strengths = useStrengths();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    const res = await generateStrengths();
    setBusy(false);
    if (!res.ok) setError(res.error);
    else if (res.added === 0) setMsg("新しい強みは見つかりませんでした。記録が増えたらまた試してください。");
    else {
      setMsg(`${res.added}件の強みを追加しました。`);
      celebrate({ kind: "goal", title: "強みを抽出しました", detail: `+${res.added}件` });
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-rule bg-paper-2/40 p-3">
        <button
          onClick={() => void run()}
          disabled={busy || !enough}
          className="btn btn-primary w-full !py-2.5 disabled:opacity-40"
        >
          {busy ? "抽出中…" : strengths && strengths.length > 0 ? "さらに強みを抽出" : "強みを抽出する"}
        </button>
        {!enough && (
          <p className="mt-2 text-[11px] text-ink-3">
            分析済みの日記が3日ぶん貯まると抽出できます（日記を書くと自動で分析されます）。
          </p>
        )}
        {msg && <p className="mt-2 text-[12px] text-grow-ink">{msg}</p>}
        {error && <p className="mt-2 text-[12px] text-flame">{error}</p>}
      </div>

      {strengths && strengths.length > 0 ? (
        <ul className="space-y-3">
          {strengths.map((s) => (
            <StrengthCard key={s.id} s={s} />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-ink-3">
          まだ強みがありません。日記を貯めて「強みを抽出する」を押してみましょう。
        </p>
      )}

      <ManualAdd />
    </div>
  );
}

function StrengthCard({ s }: { s: Strength }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(s.title);
  const [summary, setSummary] = useState(s.summary);

  if (editing) {
    return (
      <li className="space-y-2 rounded-xl border border-ai bg-ai-weak/30 p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-rule bg-paper px-2.5 py-1.5 text-sm font-bold outline-none focus:border-ai"
        />
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          className="w-full resize-none rounded-lg border border-rule bg-paper px-2.5 py-1.5 text-sm outline-none focus:border-ai"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              s.id != null &&
              void updateStrength(s.id, { title: title.trim() || s.title, summary: summary.trim() }).then(() =>
                setEditing(false),
              )
            }
            className="rounded-lg bg-ai px-3 py-1 text-[13px] font-bold text-paper active:scale-95"
          >
            保存
          </button>
          <button onClick={() => setEditing(false)} className="text-[12px] text-ink-2 hover:underline">
            やめる
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="space-y-2 rounded-xl border border-rule bg-paper p-3 shadow-soft">
      <div className="flex items-start gap-2">
        <h2 className="flex-1 text-[15px] font-bold text-ink">{s.title}</h2>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
            s.source === "ai" ? "bg-ai-weak text-ai" : "bg-paper-2 text-ink-3"
          }`}
        >
          {s.source === "ai" ? "AI" : "手動"}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-6 text-ink-2">{s.summary}</p>

      {s.evidence.length > 0 && (
        <div className="rounded-lg bg-paper-2/50 p-2">
          <div className="mb-1 text-[10px] font-bold tracking-wider text-ink-3">根拠（この日の日記）</div>
          <div className="flex flex-wrap gap-1.5">
            {s.evidence.map((d) => (
              <EvidenceChip key={d} s={s} date={d} />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-0.5">
        <button onClick={() => setEditing(true)} className="text-[11px] text-ai hover:underline">
          編集
        </button>
        <button
          onClick={() => s.id != null && void removeStrength(s.id)}
          className="text-[11px] text-ink-3 hover:text-flame"
        >
          削除
        </button>
      </div>
    </li>
  );
}

function EvidenceChip({ s, date }: { s: Strength; date: DateKey }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-rule bg-paper px-2 py-0.5 text-[11px]">
      <Link href={`/entry/${date}`} className="num text-ai hover:underline">
        {formatShort(date)}
      </Link>
      <button
        onClick={() => void removeEvidence(s, date)}
        aria-label="根拠から外す"
        className="text-ink-3 hover:text-flame"
      >
        ×
      </button>
    </span>
  );
}

function ManualAdd() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-rule py-2 text-[13px] text-ink-2 hover:bg-paper-2"
      >
        ＋ 強みを手動で追加
      </button>
    );
  }

  const submit = async () => {
    if (!title.trim()) {
      setOpen(false);
      return;
    }
    await addManualStrength(title, summary);
    setTitle("");
    setSummary("");
    setOpen(false);
  };

  return (
    <div className="space-y-2 rounded-xl border border-rule bg-paper p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="強み（例: 粘り強さ）"
        className="w-full rounded-lg border border-rule bg-paper px-2.5 py-1.5 text-sm font-bold outline-none focus:border-ai"
      />
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={3}
        placeholder="根拠・エピソード（自分の言葉で）"
        className="w-full resize-none rounded-lg border border-rule bg-paper px-2.5 py-1.5 text-sm outline-none focus:border-ai"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => void submit()}
          className="rounded-lg bg-ai px-3 py-1.5 text-[13px] font-bold text-paper active:scale-95"
        >
          追加
        </button>
        <button onClick={() => setOpen(false)} className="text-[12px] text-ink-2 hover:underline">
          やめる
        </button>
      </div>
    </div>
  );
}
