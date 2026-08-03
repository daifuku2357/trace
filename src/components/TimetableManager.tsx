"use client";

import { useEffect, useState } from "react";
import { addDays, formatLong, todayKey } from "@/lib/date";
import { celebrate } from "@/lib/celebrate";
import {
  parseTimetable,
  purgeExpiredRecurring,
  removeRecurring,
  saveRecurring,
  useRecurring,
  type ParsedEvent,
} from "@/lib/recurring";
import { WEEKDAY_LABELS } from "@/lib/types";

/**
 * 時間割（毎週の固定予定）の管理。
 * 文章で入力 → AI が構造化 → 確認して有効期間つきで保存。該当曜日の予定に自動反映される。
 */
export default function TimetableManager({ date }: { date?: string }) {
  const events = useRecurring();
  // 末日を過ぎた時間割は自動で削除する（一覧から消える）。
  useEffect(() => {
    void purgeExpiredRecurring();
  }, []);
  // 表示中の日付を基準に、末日を過ぎた時間割は一覧に出さない（既定は今日）。
  const viewDate = date ?? todayKey();
  const active = (events ?? []).filter((e) => e.untilDate >= viewDate);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState<string>(() => todayKey());
  const [until, setUntil] = useState<string>(() => addDays(todayKey(), 120));

  const count = active.length;

  const runParse = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    const res = await parseTimetable(text.trim());
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setParsed(res.events);
  };

  const runSave = async () => {
    if (!parsed || parsed.length === 0) return;
    await saveRecurring(parsed, from, until);
    setParsed(null);
    setText("");
    celebrate({ kind: "goal", title: "時間割を登録しました", detail: `${parsed.length}件・${formatLong(until)}まで` });
  };

  return (
    <section className="rounded-xl border border-rule bg-paper-2/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="text-[13px] font-bold text-ink-2">
          時間割（毎週の固定予定）{count > 0 && <span className="num ml-1 text-ink-3">{count}件</span>}
        </span>
        <span aria-hidden className="text-ink-3">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-rule px-3 py-3">
          {/* 既存の時間割 */}
          {active.length > 0 && (
            <ul className="space-y-1">
              {active.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-[12px]">
                  <span className="w-5 shrink-0 rounded bg-ink-3/15 text-center font-bold text-ink-2">
                    {WEEKDAY_LABELS[e.weekday]}
                  </span>
                  <span className="num text-ink-3">
                    {e.start}–{e.end}
                  </span>
                  <span className="flex-1 truncate">{e.title}</span>
                  <span className="num text-[10px] text-ink-3">～{e.untilDate.slice(5)}</span>
                  <button
                    onClick={() => e.id != null && void removeRecurring(e.id)}
                    aria-label="削除"
                    className="text-ink-3 hover:text-flame"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* 自然言語入力 */}
          {parsed === null ? (
            <div className="space-y-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder={"例: 月3限に統計学、火と木の1限に英語、水5限は実験(16:20-17:50)"}
                className="w-full resize-none rounded-lg border border-rule bg-paper px-2.5 py-1.5 text-sm outline-none focus:border-ai"
              />
              <button
                onClick={() => void runParse()}
                disabled={!text.trim() || busy}
                className="btn btn-primary w-full !py-2 disabled:opacity-40"
              >
                {busy ? "読み取り中…" : "AIで時間割を読み取る"}
              </button>
              {error && <p className="text-[12px] text-flame">{error}</p>}
              <p className="text-[10px] text-ink-3">
                「3限」などのコマ表現も一般的な時限に合わせて時刻化します。確認してから保存できます。
              </p>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-ai bg-ai-weak/40 p-2.5">
              <div className="text-[12px] font-bold text-ai">読み取り結果を確認</div>
              <ul className="space-y-1">
                {parsed.map((e, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12px]">
                    <span className="w-5 shrink-0 rounded bg-ink-3/15 text-center font-bold text-ink-2">
                      {WEEKDAY_LABELS[e.weekday]}
                    </span>
                    <span className="num text-ink-3">
                      {e.start}–{e.end}
                    </span>
                    <span className="flex-1 truncate">{e.title}</span>
                    <button
                      onClick={() => setParsed(parsed.filter((_, j) => j !== i))}
                      aria-label="除外"
                      className="text-ink-3 hover:text-flame"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
                <label className="flex items-center gap-1">
                  開始
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="num rounded border border-rule bg-paper px-1.5 py-1"
                  />
                </label>
                <label className="flex items-center gap-1">
                  期末まで
                  <input
                    type="date"
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                    className="num rounded border border-rule bg-paper px-1.5 py-1"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void runSave()}
                  disabled={parsed.length === 0 || until < from}
                  className="rounded-lg bg-ai px-3 py-1.5 text-[13px] font-bold text-paper active:scale-95 disabled:opacity-40"
                >
                  この期間で保存
                </button>
                <button onClick={() => setParsed(null)} className="text-[12px] text-ink-2 hover:underline">
                  やり直す
                </button>
              </div>
              {until < from && <p className="text-[11px] text-flame">期末は開始日より後にしてください。</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
