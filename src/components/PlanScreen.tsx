"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, formatLong, relativeLabel, todayKey } from "@/lib/date";
import { celebrate } from "@/lib/celebrate";
import {
  addDailyHabit,
  addManualBlock,
  addPlanItem,
  generatePlan,
  nowNext,
  removeDailyHabit,
  removePlanBlock,
  removePlanItem,
  reschedulePlan,
  setSleep,
  setWake,
  togglePlanBlock,
  updatePlanBlock,
  useDailyHabits,
  usePlanBlocks,
  usePlanItems,
  useWakeSleep,
} from "@/lib/plan";
import {
  applyRecurringToDay,
  eventMinutes,
  recurringForDate,
  useRecurring,
} from "@/lib/recurring";
import { PLAN_KINDS, PLAN_KIND_JA, type PlanBlock, type PlanKind } from "@/lib/types";
import PlanDial from "./PlanDial";
import TimetableManager from "./TimetableManager";

/**
 * 全角数字（０-９）を半角に直してから数字だけ残す。
 * これで日本語入力（IME）を切り替えずに「目安」の分数を入力できる（IMEを戻す手間をなくす）。
 */
function digitsOnly(v: string): string {
  return v.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^0-9]/g, "");
}

/** 性質ごとの配色（紫は使わない）。左ボーダー + チップに使う。 */
const KIND_STYLE: Record<PlanKind, { border: string; chip: string; dot: string }> = {
  task: { border: "border-l-ai", chip: "border-ai bg-ai-weak text-ai", dot: "bg-ai" },
  habit: { border: "border-l-grow", chip: "border-grow bg-grow-weak text-grow-ink", dot: "bg-grow" },
};

/** 単発タスクと毎日の習慣を同じ見た目で扱うためのまとめ型。 */
type MergedItem = {
  key: string;
  id: number;
  title: string;
  kind: PlanKind;
  estMinutes: number | null;
  fixedTime: string | null;
  daily: boolean;
};

export default function PlanScreen() {
  // カレンダーで日付を選び、先の日の予定も前もって組める。既定は今日。
  const [date, setDate] = useState<string>(() => todayKey());
  const isToday = date === todayKey();
  const items = usePlanItems(date);
  const blocks = usePlanBlocks(date);
  const habits = useDailyHabits();
  const { wake, sleep } = useWakeSleep();
  const recurringAll = useRecurring();
  // その日の曜日・有効期間に該当する時間割の固定予定。
  const recurToday = recurringForDate(recurringAll ?? [], date);

  // その日の単発タスク＋毎日の習慣を1つのリストにまとめて表示・生成に渡す。
  const merged: MergedItem[] = [
    ...(items ?? []).map((it) => ({
      key: `i${it.id}`, id: it.id!, title: it.title, kind: it.kind,
      estMinutes: it.estMinutes, fixedTime: it.fixedTime, daily: false,
    })),
    ...(habits ?? []).map((h) => ({
      key: `h${h.id}`, id: h.id!, title: h.title, kind: "habit" as PlanKind,
      estMinutes: h.estMinutes, fixedTime: null, daily: true,
    })),
  ];

  const [busy, setBusy] = useState<"generate" | "reschedule" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 日付を切り替えたらエラー表示はリセットする。
  useEffect(() => setError(null), [date]);

  const canGenerate = merged.length > 0 || recurToday.length > 0;

  const runGenerate = async () => {
    if (!canGenerate) return;
    setBusy("generate");
    setError(null);
    // 時間割の固定予定と毎日の習慣も素材として渡し、AI に空き時間だけを埋めさせる。
    const recurItems = recurToday.map((e) => ({
      title: e.title,
      kind: "task" as const,
      estMinutes: eventMinutes(e) || null,
      fixedTime: e.start,
    }));
    const seed = merged.map((m) => ({
      title: m.title,
      kind: m.kind,
      estMinutes: m.estMinutes,
      fixedTime: m.fixedTime,
    }));
    const res = await generatePlan(date, wake, sleep, [...seed, ...recurItems]);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else celebrate({ kind: "goal", title: "下書きができました", detail: "自分に合わせて直そう" });
  };

  return (
    <div className="space-y-3">
      <header className="space-y-2">
        {!isToday && (
          <div className="flex justify-end">
            <button
              onClick={() => setDate(todayKey())}
              className="rounded-full bg-ai-weak px-2.5 py-1 text-[11px] font-bold text-ai active:scale-95"
            >
              今日へ戻る
            </button>
          </div>
        )}
        <DateNav date={date} setDate={setDate} />
      </header>

      <TimetableManager date={date} />

      {recurToday.length > 0 && (
        <div className="rounded-xl border border-ink-3/40 bg-paper-2/50 p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12px] font-bold text-ink-2">この日の時間割（固定）</span>
            <button
              onClick={() =>
                void applyRecurringToDay(date).then((n) => {
                  if (n > 0) celebrate({ kind: "goal", title: "時間割を反映しました", detail: `${n}件` });
                })
              }
              className="rounded-lg border border-ink-3 px-2 py-0.5 text-[11px] text-ink-2 hover:bg-paper-2"
            >
              カレンダーに反映
            </button>
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {recurToday.map((e) => (
              <li key={e.id} className="num rounded-full bg-ink-3/10 px-2 py-0.5 text-[11px] text-ink-2">
                {e.start}–{e.end} {e.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ItemInput date={date} wake={wake} sleep={sleep} />

      {merged.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {merged.map((m) => (
            <li
              key={m.key}
              className={`flex animate-pop items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] ${KIND_STYLE[m.kind].chip}`}
            >
              <span className="font-bold">{PLAN_KIND_JA[m.kind]}</span>
              {m.daily && (
                <span className="rounded-full bg-grow px-1 text-[9px] font-bold text-paper">毎日</span>
              )}
              <span className="text-ink">{m.title}</span>
              {m.estMinutes ? <span className="num text-ink-3">{m.estMinutes}分</span> : null}
              {m.fixedTime ? (
                <span className="num text-ink-3">{m.fixedTime}</span>
              ) : null}
              <button
                onClick={() => void (m.daily ? removeDailyHabit(m.id) : removePlanItem(m.id))}
                aria-label="削除"
                className="ml-0.5 text-ink-3 hover:text-flame"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <button
          onClick={() => void runGenerate()}
          disabled={!canGenerate || busy !== null}
          className="btn btn-primary w-full !py-2.5 disabled:opacity-40"
        >
          {busy === "generate"
            ? "作成中…"
            : blocks && blocks.length > 0
              ? "予定を作り直す"
              : "予定を作成"}
        </button>
        {error && <p className="mt-2 text-[12px] text-flame">{error}</p>}
      </div>

      {blocks && blocks.length > 0 && (
        <>
          <PlanDial blocks={blocks} />
          <Timeline blocks={blocks} isToday={isToday} />
          <EditTools
            date={date}
            wake={wake}
            sleep={sleep}
            blocks={blocks}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
          />
        </>
      )}
    </div>
  );
}

function WakeSleep({ wake, sleep }: { wake: string; sleep: string }) {
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <label className="flex items-center gap-1.5">
        <span className="text-ink-2">起床</span>
        <input
          type="time"
          defaultValue={wake}
          onChange={(e) => void setWake(e.target.value)}
          className="num rounded-lg border border-rule bg-paper px-2 py-1 outline-none focus:border-ai"
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-ink-2">就寝</span>
        <input
          type="time"
          defaultValue={sleep}
          onChange={(e) => void setSleep(e.target.value)}
          className="num rounded-lg border border-rule bg-paper px-2 py-1 outline-none focus:border-ai"
        />
      </label>
    </div>
  );
}

function ItemInput({ date, wake, sleep }: { date: string; wake: string; sleep: string }) {
  const [kind, setKind] = useState<PlanKind>("task");
  const [title, setTitle] = useState("");
  const [est, setEst] = useState("");
  // 時刻の指定は任意。どの「やること」にもチェックひとつで時刻を固定できる。
  const [useTime, setUseTime] = useState(false);
  const [fixedTime, setFixedTime] = useState("09:00");
  // 種別ボタンを押したらタイトル欄へフォーカスを戻す（半角数字の目安欄から日本語入力へ戻すため）。
  const titleRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    const minutes = est ? Math.max(1, Math.min(600, Number(est) || 0)) || null : null;
    // 習慣は「毎日ぶん」に保存し、翌日以降のすべての日に自動で入る。
    if (kind === "habit") {
      await addDailyHabit(t, minutes);
    } else {
      await addPlanItem(date, {
        kind,
        title: t,
        estMinutes: minutes,
        fixedTime: useTime ? fixedTime : null,
      });
    }
    setTitle("");
    setEst("");
  };

  return (
    <div className="space-y-2 rounded-xl border border-rule bg-paper-2/40 p-3">
      <WakeSleep wake={wake} sleep={sleep} />
      <div className="flex flex-wrap gap-1 border-t border-rule pt-2">
        {PLAN_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              // タイトル欄へフォーカスを移し、日本語入力（全角）に戻せるようにする。
              titleRef.current?.focus();
            }}
            aria-pressed={kind === k}
            className={`rounded-full border px-2.5 py-1 text-[12px] transition active:scale-95 ${
              kind === k ? KIND_STYLE[k].chip + " font-bold" : "border-rule text-ink-2 hover:bg-paper-2"
            }`}
          >
            {PLAN_KIND_JA[k]}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && void submit()}
          placeholder={kind === "habit" ? "毎日の習慣（例: 筋トレ）" : "やること（例: レポート提出）"}
          lang="ja"
          inputMode="text"
          className="min-w-0 flex-1 rounded-lg border border-rule bg-paper px-2.5 py-1.5 text-sm outline-none focus:border-ai"
        />
        <button
          onClick={() => void submit()}
          className="shrink-0 rounded-lg bg-ai px-3 py-1.5 text-sm font-bold text-paper active:scale-95"
        >
          追加
        </button>
      </div>
      <div className="flex items-center gap-3 text-[12px] text-ink-2">
        <label className="flex items-center gap-1">
          目安
          <input
            value={est}
            onChange={(e) => setEst(digitsOnly(e.target.value))}
            inputMode="numeric"
            placeholder="分"
            className="num w-14 rounded-lg border border-rule bg-paper px-2 py-1 outline-none focus:border-ai"
          />
        </label>
        {kind === "task" && (
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={useTime}
              onChange={(e) => setUseTime(e.target.checked)}
              className="h-3.5 w-3.5 accent-ai"
            />
            時刻を指定
            {useTime && (
              <input
                type="time"
                value={fixedTime}
                onChange={(e) => setFixedTime(e.target.value)}
                className="num rounded-lg border border-rule bg-paper px-2 py-1 outline-none focus:border-ai"
              />
            )}
          </label>
        )}
        {kind === "habit" && <span className="text-[11px] text-grow-ink">毎日くり返します</span>}
      </div>
    </div>
  );
}

function Timeline({ blocks, isToday }: { blocks: PlanBlock[]; isToday: boolean }) {
  // 「いま」の強調は今日だけ。先の日付の予定には現在時刻の概念がない。
  const current = isToday ? nowNext(blocks).current : null;
  return (
    <ul className="space-y-1.5">
      {blocks.map((b) => (
        <BlockRow key={b.id} block={b} isCurrent={current?.id === b.id} />
      ))}
    </ul>
  );
}

/** 日付ナビ: 前日/翌日ボタン ＋ カレンダー（日付入力）で任意日にジャンプ。 */
function DateNav({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-rule bg-paper-2/40 px-2 py-1.5">
      <button
        onClick={() => setDate(addDays(date, -1))}
        className="rounded-lg px-2 py-1 text-sm text-ai hover:bg-ai-weak"
        aria-label="前の日"
      >
        ← 前日
      </button>
      <label className="flex flex-col items-center">
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="num rounded-lg border border-rule bg-paper px-2 py-1 text-sm outline-none focus:border-ai"
        />
        <span className="mt-0.5 text-[11px] text-ink-3">
          {formatLong(date)}・{relativeLabel(date)}
        </span>
      </label>
      <button
        onClick={() => setDate(addDays(date, 1))}
        className="rounded-lg px-2 py-1 text-sm text-ai hover:bg-ai-weak"
        aria-label="次の日"
      >
        翌日 →
      </button>
    </div>
  );
}

function BlockRow({ block, isCurrent }: { block: PlanBlock; isCurrent: boolean }) {
  const [editing, setEditing] = useState(false);
  const st = KIND_STYLE[block.kind];

  const toggle = () => {
    const becomingDone = !block.done;
    void togglePlanBlock(block).then(() => {
      if (becomingDone) celebrate({ kind: "goal", title: `${block.title} 完了`, detail: "+4 XP" });
    });
  };

  if (editing) return <BlockEditor block={block} onClose={() => setEditing(false)} />;

  return (
    <li
      className={`flex animate-pop items-center gap-2 rounded-lg border border-rule border-l-4 bg-paper px-3 py-2 transition ${st.border} ${
        isCurrent ? "shadow-glow ring-2 ring-ai" : ""
      } ${block.done ? "opacity-70" : ""}`}
    >
      <input
        type="checkbox"
        checked={block.done}
        onChange={toggle}
        className="h-4 w-4 shrink-0 accent-grow"
        aria-label="完了"
      />
      <span className="num shrink-0 text-[12px] text-ink-3">
        {block.start}–{block.end}
      </span>
      <span className={`flex-1 text-[14px] ${block.done ? "text-ink-3 line-through" : ""}`}>
        {block.title}
      </span>
      {isCurrent && !block.done && (
        <span className="shrink-0 animate-pulse rounded-full bg-ai px-1.5 py-0.5 text-[10px] font-bold text-paper">
          いま
        </span>
      )}
      <button
        onClick={() => setEditing(true)}
        className="shrink-0 text-[11px] text-ink-3 hover:text-ai"
        aria-label="編集"
      >
        編集
      </button>
    </li>
  );
}

function BlockEditor({ block, onClose }: { block: PlanBlock; onClose: () => void }) {
  const [start, setStart] = useState(block.start);
  const [end, setEnd] = useState(block.end);
  const [title, setTitle] = useState(block.title);
  const [kind, setKind] = useState<PlanKind>(block.kind);

  const save = async () => {
    if (block.id == null) return;
    await updatePlanBlock(block.id, { start, end, title: title.trim() || block.title, kind, source: "manual" });
    onClose();
  };

  return (
    <li className="space-y-2 rounded-lg border border-ai bg-ai-weak/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="num rounded border border-rule bg-paper px-1.5 py-1 text-[12px]"
        />
        <span className="text-ink-3">–</span>
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="num rounded border border-rule bg-paper px-1.5 py-1 text-[12px]"
        />
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded border border-rule bg-paper px-2 py-1 text-sm outline-none focus:border-ai"
      />
      <div className="flex flex-wrap gap-1">
        {PLAN_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${
              kind === k ? KIND_STYLE[k].chip + " font-bold" : "border-rule text-ink-2"
            }`}
          >
            {PLAN_KIND_JA[k]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => void save()}
          className="rounded-lg bg-ai px-3 py-1 text-[13px] font-bold text-paper active:scale-95"
        >
          保存
        </button>
        <button onClick={onClose} className="text-[12px] text-ink-2 hover:underline">
          やめる
        </button>
        <button
          onClick={() => block.id != null && void removePlanBlock(block.id).then(onClose)}
          className="ml-auto text-[12px] text-flame hover:underline"
        >
          削除
        </button>
      </div>
    </li>
  );
}

/** 下部を1つにまとめる: ブロックの手動追加と自然言語での組み直しを折りたたみに。 */
function EditTools({
  date,
  wake,
  sleep,
  blocks,
  busy,
  setBusy,
  setError,
}: {
  date: string;
  wake: string;
  sleep: string;
  blocks: PlanBlock[];
  busy: "generate" | "reschedule" | null;
  setBusy: (v: "generate" | "reschedule" | null) => void;
  setError: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-rule bg-paper-2/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="text-[13px] font-bold text-ink-2">手直し（ブロック追加・組み直し）</span>
        <span aria-hidden className="text-ink-3">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-rule px-3 py-3">
          <ManualAdd date={date} />
          <Reschedule
            date={date}
            wake={wake}
            sleep={sleep}
            blocks={blocks}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
          />
        </div>
      )}
    </section>
  );
}

function ManualAdd({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("12:30");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<PlanKind>("task");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-rule py-2 text-[13px] text-ink-2 hover:bg-paper-2"
      >
        ＋ ブロックを手動で追加
      </button>
    );
  }

  const submit = async () => {
    if (!title.trim()) {
      setOpen(false);
      return;
    }
    await addManualBlock(date, { start, end, title: title.trim(), kind });
    setTitle("");
    setOpen(false);
  };

  return (
    <div className="space-y-2 rounded-lg border border-rule bg-paper p-3">
      <div className="flex items-center gap-1.5">
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="num rounded border border-rule bg-paper px-1.5 py-1 text-[12px]"
        />
        <span className="text-ink-3">–</span>
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="num rounded border border-rule bg-paper px-1.5 py-1 text-[12px]"
        />
      </div>
      <div className="flex gap-1.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && void submit()}
          placeholder="内容"
          className="min-w-0 flex-1 rounded border border-rule bg-paper px-2 py-1 text-sm outline-none focus:border-ai"
        />
        <button
          onClick={() => void submit()}
          className="shrink-0 rounded bg-ai px-3 py-1 text-sm font-bold text-paper active:scale-95"
        >
          追加
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {PLAN_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${
              kind === k ? KIND_STYLE[k].chip + " font-bold" : "border-rule text-ink-2"
            }`}
          >
            {PLAN_KIND_JA[k]}
          </button>
        ))}
      </div>
    </div>
  );
}

function Reschedule({
  date,
  wake,
  sleep,
  blocks,
  busy,
  setBusy,
  setError,
}: {
  date: string;
  wake: string;
  sleep: string;
  blocks: PlanBlock[];
  busy: "generate" | "reschedule" | null;
  setBusy: (v: "generate" | "reschedule" | null) => void;
  setError: (v: string | null) => void;
}) {
  const [text, setText] = useState("");

  const run = async () => {
    if (!text.trim()) return;
    setBusy("reschedule");
    setError(null);
    const res = await reschedulePlan(date, wake, sleep, blocks, text.trim());
    setBusy(null);
    if (!res.ok) setError(res.error);
    else {
      setText("");
      celebrate({ kind: "goal", title: "組み直しました", detail: "完了ぶんは残しています" });
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-rule bg-paper-2/40 p-3">
      <div className="text-[12px] font-bold text-ink-2">状況が変わったら</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="例: 14時に会議が入った / 疲れたから午後は軽めに"
        rows={2}
        className="w-full resize-none rounded-lg border border-rule bg-paper px-2.5 py-1.5 text-sm outline-none focus:border-ai"
      />
      <button
        onClick={() => void run()}
        disabled={!text.trim() || busy !== null}
        className="btn w-full !py-2 disabled:opacity-40"
      >
        {busy === "reschedule" ? "組み直し中…" : "この内容で組み直す"}
      </button>
    </div>
  );
}
