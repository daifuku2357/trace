"use client";

import { useState } from "react";
import Link from "next/link";
import { celebrate } from "@/lib/celebrate";
import { formatShort } from "@/lib/date";
import {
  addManualStar,
  generateStar,
  removeStar,
  removeStarDate,
  updateStar,
  useStarEpisodes,
} from "@/lib/star";
import type { DateKey, StarEpisode } from "@/lib/types";

/** 就活: STARエピソード。日記から状況/課題/行動/結果の下書きを作り、根拠日付にリンクする。 */
export default function StarScreen({ enough }: { enough: boolean }) {
  const episodes = useStarEpisodes();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    const res = await generateStar();
    setBusy(false);
    if (!res.ok) setError(res.error);
    else if (res.added === 0) setMsg("新しいエピソードは見つかりませんでした。");
    else {
      setMsg(`${res.added}件のエピソードを追加しました。`);
      celebrate({ kind: "goal", title: "STARを作成しました", detail: `+${res.added}件` });
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
          {busy ? "作成中…" : episodes && episodes.length > 0 ? "さらにエピソードを作る" : "STARエピソードを作る"}
        </button>
        {!enough && (
          <p className="mt-2 text-[11px] text-ink-3">分析済みの日記が3日ぶん貯まると作成できます。</p>
        )}
        {msg && <p className="mt-2 text-[12px] text-grow-ink">{msg}</p>}
        {error && <p className="mt-2 text-[12px] text-flame">{error}</p>}
      </div>

      {episodes && episodes.length > 0 ? (
        <ul className="space-y-3">
          {episodes.map((ep) => (
            <StarCard key={ep.id} ep={ep} />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-ink-3">
          まだエピソードがありません。日記を貯めて「STARエピソードを作る」を押してみましょう。
        </p>
      )}

      <button
        onClick={() => void addManualStar()}
        className="w-full rounded-lg border border-dashed border-rule py-2 text-[13px] text-ink-2 hover:bg-paper-2"
      >
        ＋ エピソードを手動で追加
      </button>
    </div>
  );
}

function StarCard({ ep }: { ep: StarEpisode }) {
  const [editing, setEditing] = useState(false);

  if (editing) return <StarEditor ep={ep} onClose={() => setEditing(false)} />;

  return (
    <li className="space-y-2 rounded-xl border border-rule bg-paper p-3 shadow-soft">
      <div className="flex items-start gap-2">
        <h2 className="flex-1 text-[15px] font-bold text-ink">{ep.title}</h2>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
            ep.source === "ai" ? "bg-ai-weak text-ai" : "bg-paper-2 text-ink-3"
          }`}
        >
          {ep.source === "ai" ? "AI" : "手動"}
        </span>
      </div>
      <Part label="状況" text={ep.situation} />
      <Part label="課題" text={ep.task} />
      <Part label="行動" text={ep.action} />
      <Part label="結果" text={ep.result} />

      {ep.dates.length > 0 && (
        <div className="rounded-lg bg-paper-2/50 p-2">
          <div className="mb-1 text-[10px] font-bold tracking-wider text-ink-3">根拠（この日の日記）</div>
          <div className="flex flex-wrap gap-1.5">
            {ep.dates.map((d) => (
              <DateChip key={d} ep={ep} date={d} />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-0.5">
        <button onClick={() => setEditing(true)} className="text-[11px] text-ai hover:underline">
          編集
        </button>
        <button
          onClick={() => ep.id != null && void removeStar(ep.id)}
          className="text-[11px] text-ink-3 hover:text-flame"
        >
          削除
        </button>
      </div>
    </li>
  );
}

function Part({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <p className="text-[13px] leading-6">
      <span className="mr-1.5 rounded bg-paper-2 px-1 py-0.5 text-[10px] font-bold text-ink-3">{label}</span>
      <span className="text-ink-2">{text}</span>
    </p>
  );
}

function DateChip({ ep, date }: { ep: StarEpisode; date: DateKey }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-rule bg-paper px-2 py-0.5 text-[11px]">
      <Link href={`/entry/${date}`} className="num text-ai hover:underline">
        {formatShort(date)}
      </Link>
      <button onClick={() => void removeStarDate(ep, date)} aria-label="根拠から外す" className="text-ink-3 hover:text-flame">
        ×
      </button>
    </span>
  );
}

function StarEditor({ ep, onClose }: { ep: StarEpisode; onClose: () => void }) {
  const [title, setTitle] = useState(ep.title);
  const [situation, setSituation] = useState(ep.situation);
  const [task, setTask] = useState(ep.task);
  const [action, setAction] = useState(ep.action);
  const [result, setResult] = useState(ep.result);

  const field = (label: string, value: string, set: (v: string) => void, rows = 2) => (
    <label className="block">
      <span className="text-[11px] font-bold text-ink-3">{label}</span>
      <textarea
        value={value}
        onChange={(e) => set(e.target.value)}
        rows={rows}
        className="mt-0.5 w-full resize-none rounded-lg border border-rule bg-paper px-2 py-1 text-sm outline-none focus:border-ai"
      />
    </label>
  );

  return (
    <li className="space-y-2 rounded-xl border border-ai bg-ai-weak/30 p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg border border-rule bg-paper px-2.5 py-1.5 text-sm font-bold outline-none focus:border-ai"
      />
      {field("状況", situation, setSituation)}
      {field("課題", task, setTask)}
      {field("行動", action, setAction, 3)}
      {field("結果", result, setResult)}
      <div className="flex items-center gap-2">
        <button
          onClick={() =>
            ep.id != null &&
            void updateStar(ep.id, {
              title: title.trim() || ep.title,
              situation: situation.trim(),
              task: task.trim(),
              action: action.trim(),
              result: result.trim(),
            }).then(onClose)
          }
          className="rounded-lg bg-ai px-3 py-1 text-[13px] font-bold text-paper active:scale-95"
        >
          保存
        </button>
        <button onClick={onClose} className="text-[12px] text-ink-2 hover:underline">
          やめる
        </button>
      </div>
    </li>
  );
}
