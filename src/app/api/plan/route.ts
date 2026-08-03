import { NextResponse } from "next/server";
import { cleanTitle, generateJson } from "@/lib/gemini";
import { PLAN_KINDS, PLAN_KIND_JA, type PlanKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 「今日の組み立て」の下書き生成（改善案 Daily Conductor 由来）。
 * AI は決定者ではなく下書き役。返したブロックは UI 側で人間が自由に編集・確定する。
 */
const PROMPT_VERSION = "plan-v1";

const KIND_GUIDE = PLAN_KINDS.map((k) => `${k}（${PLAN_KIND_JA[k]}）`).join(" / ");

const RULES = `配置のルール:
- 時刻が指定された項目は、その時刻に固定して動かさない。
- やることは、集中しやすい午前などの時間帯を優先して置く。
- habit（習慣）は無理のない時間帯に散らす。
- 集中を要する作業は90分以内に区切り、間に10〜15分の休憩を入れる。
- 食事の時間を確保する（入力になくても朝昼夜に短い枠を置く）。
- 詰め込みすぎず余白を残す。すべて起床〜就寝の範囲に収める。
- start/end は 'HH:MM'（24時間表記）。task は体言止めで20字以内。`;

const GENERATE_SYSTEM = `あなたは利用者の1日のタイムブロックの「下書き」を作る補助役です。JSON のみを返してください。最終決定は利用者が行うので、迷ったら余白を多めにした無理のない案にしてください。

${RULES}

kind は次のいずれか1つ: ${KIND_GUIDE}`;

const RESCHEDULE_SYSTEM = `あなたは進行中の1日の予定を組み直す補助役です。JSON のみを返してください。

- すでに完了したブロックは時刻を変えずそのまま残す。
- 利用者の状況変更の指示を最優先で反映する。
- 未完了ぶんだけを、指示と現在時刻を踏まえて起床〜就寝の範囲で無理なく再配置する。

${RULES}

kind は次のいずれか1つ: ${KIND_GUIDE}`;

const responseSchema = {
  type: "OBJECT",
  properties: {
    blocks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          start: { type: "STRING" },
          end: { type: "STRING" },
          task: { type: "STRING" },
          kind: { type: "STRING", enum: [...PLAN_KINDS] },
        },
        required: ["start", "end", "task", "kind"],
      },
    },
  },
  required: ["blocks"],
};

interface InItem {
  title: string;
  kind: string;
  estMinutes?: number | null;
  fixedTime?: string | null;
}

interface DoneBlock {
  start: string;
  end: string;
  title: string;
  kind: string;
}

const HHMM = /^(\d{1,2}):(\d{2})$/;

function toMinutes(hhmm: unknown): number | null {
  if (typeof hhmm !== "string") return null;
  const m = HHMM.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (mm > 59) return null;
  // 就寝が深夜に及ぶ人向けに 24:00（＝翌0:00）まで受ける。
  if (h > 24 || (h === 24 && mm !== 0)) return null;
  return h * 60 + mm;
}

function pad(hhmm: string): string {
  const m = HHMM.exec(hhmm)!;
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

function describeItems(items: InItem[]): string {
  return items
    .map((it) => {
      const parts = [`${PLAN_KIND_JA[it.kind as PlanKind] ?? it.kind}: ${it.title}`];
      if (it.estMinutes) parts.push(`約${it.estMinutes}分`);
      if (it.fixedTime) parts.push(`${it.fixedTime}に固定`);
      return `- ${parts.join(" / ")}`;
    })
    .join("\n");
}

export async function POST(req: Request) {
  let mode: "generate" | "reschedule" = "generate";
  let items: InItem[] = [];
  let wake = "07:00";
  let sleep = "23:00";
  let done: DoneBlock[] = [];
  let instruction = "";

  try {
    const json = (await req.json()) as Record<string, unknown>;
    if (json.mode === "reschedule") mode = "reschedule";
    if (Array.isArray(json.items)) items = json.items as InItem[];
    if (typeof json.wake === "string" && HHMM.test(json.wake)) wake = json.wake;
    if (typeof json.sleep === "string" && HHMM.test(json.sleep)) sleep = json.sleep;
    if (Array.isArray(json.done)) done = json.done as DoneBlock[];
    if (typeof json.instruction === "string") instruction = json.instruction.trim();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です。" }, { status: 400 });
  }

  const validItems = items.filter(
    (it) => typeof it?.title === "string" && it.title.trim().length > 0,
  );
  if (mode === "generate" && validItems.length === 0) {
    return NextResponse.json({ error: "タスクを1つ以上入力してください。" }, { status: 400 });
  }
  if (mode === "reschedule" && instruction.length === 0) {
    return NextResponse.json({ error: "変更内容を入力してください。" }, { status: 400 });
  }

  const user =
    mode === "generate"
      ? `起床 ${wake} / 就寝 ${sleep}。この範囲で今日の予定を組んでください。\n\n今日やること:\n${describeItems(validItems)}`
      : [
          `起床 ${wake} / 就寝 ${sleep}。`,
          done.length
            ? `完了済み（時刻はそのまま残す）:\n${done
                .map((d) => `- ${d.start}〜${d.end} ${d.title}`)
                .join("\n")}`
            : "完了済みはまだありません。",
          validItems.length ? `未消化のタスク:\n${describeItems(validItems)}` : "",
          `状況変更の指示:「${instruction}」`,
        ]
          .filter(Boolean)
          .join("\n\n");

  const result = await generateJson<{ blocks?: unknown }>({
    system: mode === "generate" ? GENERATE_SYSTEM : RESCHEDULE_SYSTEM,
    user,
    schema: responseSchema,
    temperature: 0.4,
    // 予定が細かい日は件数が増えるため、切り詰めで壊れないよう広めに取る。
    maxOutputTokens: 4096,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, detail: result.detail },
      { status: result.status },
    );
  }

  const list = Array.isArray(result.data.blocks) ? result.data.blocks : [];
  const seen = new Set<string>();
  const blocks = list
    .map((b) => {
      const item = b as { start?: unknown; end?: unknown; task?: unknown; kind?: unknown };
      const startOk = toMinutes(item.start);
      const endOk = toMinutes(item.end);
      const title = cleanTitle(item.task, 24);
      const kind = PLAN_KINDS.includes(item.kind as PlanKind) ? (item.kind as PlanKind) : null;
      // 弾くのは「本当に壊れているブロック」だけ。時刻が読めない・種別不正・空タイトル・
      // 長さ0（開始＝終了）。起床〜就寝の範囲外でも捨てない（就寝は人が編集・削除で調整できる）。
      if (startOk == null || endOk == null || !title || !kind) return null;
      if (startOk === endOk) return null;
      // gemma がまれに壊れた JSON 断片や記号列をタイトルに混ぜる（語彙の崩れ）。
      // JSON メタ文字を含むタイトルは捨てる（timetable ルートと同じ防御）。
      if (/[{}[\]"<>]/.test(title)) return null;
      // gemma がまれに同じ内容のブロックを何度も繰り返す（degeneration）。
      // 同一開始時刻、または「開始+タイトル」が重複するものは捨てて重複生成を防ぐ。
      const startKey = `s:${startOk}`;
      const titleKey = `t:${startOk}:${title}`;
      if (seen.has(startKey) || seen.has(titleKey)) return null;
      seen.add(startKey);
      seen.add(titleKey);
      return {
        start: pad(item.start as string),
        end: pad(item.end as string),
        title,
        kind,
        source: "ai" as const,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => (toMinutes(a.start) ?? 0) - (toMinutes(b.start) ?? 0))
    .slice(0, 40);

  if (blocks.length === 0) {
    return NextResponse.json(
      { error: "有効な予定を生成できませんでした。もう一度お試しください。" },
      { status: 502 },
    );
  }

  return NextResponse.json({ blocks, model: result.model, promptVersion: PROMPT_VERSION });
}
