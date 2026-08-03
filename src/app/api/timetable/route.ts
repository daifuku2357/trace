import { NextResponse } from "next/server";
import { cleanTitle, generateJson, salvageObjects } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 時間割の自然言語入力を、毎週の固定予定に構造化する。
 * 抽出のみ（本文にない予定は作らない）。返した予定は UI 側で人が確認・編集して保存する。
 */
const PROMPT_VERSION = "timetable-v1";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;
// Date#getDay の並び（0=日..6=土）へ変換する。
const KANJI_TO_INDEX: Record<string, number> = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };

const SYSTEM_PROMPT = `あなたは大学生などの時間割の文章から「毎週くり返す固定予定」を抽出する構造化器です。JSON のみを返してください。

- events: くり返しの固定予定。授業・バイト・通学など、曜日と時間が決まっているもの。
- weekday: 「月」「火」「水」「木」「金」「土」「日」のいずれか1つ。複数の曜日にまたがる予定（例:「水と金」）は、曜日ごとに1件ずつに分けて出す。
- start / end: 'HH:MM'（24時間表記）。「3限」などコマ表現でも、一般的な大学の時限に当てはめて時刻に直す。時刻が全く不明な場合はその予定を出さない。
- title: 科目名など具体的な名称を20字以内・体言止め。本文にない予定を創作しない。

くり返しでない単発の予定や、曜日が不明なものは含めない。`;

const responseSchema = {
  type: "OBJECT",
  properties: {
    events: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          weekday: { type: "STRING", enum: [...WEEKDAYS] },
          start: { type: "STRING" },
          end: { type: "STRING" },
          title: { type: "STRING" },
        },
        required: ["weekday", "start", "end", "title"],
      },
    },
  },
  required: ["events"],
};

const HHMM = /^(\d{1,2}):(\d{2})$/;
function toMinutes(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = HHMM.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}
function pad(hhmm: string): string {
  const m = HHMM.exec(hhmm)!;
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

/**
 * start/end から開始・終了時刻を取り出す。
 * gemma 系は start に "13:10-14:40" のように範囲を入れることがあるため、
 * 両フィールドから HH:MM を全部拾い、最初を開始・最後を終了として扱う。
 */
function extractRange(a: unknown, b: unknown): { start: string; end: string } | null {
  const s = `${typeof a === "string" ? a : ""} ${typeof b === "string" ? b : ""}`;
  const found = (s.match(/\d{1,2}:\d{2}/g) ?? []).filter((t) => toMinutes(t) != null);
  if (found.length < 2) return null;
  const start = found[0];
  const end = found[found.length - 1];
  if ((toMinutes(end) as number) <= (toMinutes(start) as number)) return null;
  return { start: pad(start), end: pad(end) };
}

export async function POST(req: Request) {
  let text: string;
  try {
    const json = (await req.json()) as { text?: unknown };
    if (typeof json.text !== "string" || json.text.trim().length === 0) {
      return NextResponse.json({ error: "時間割の文章を入力してください。" }, { status: 400 });
    }
    text = json.text;
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です。" }, { status: 400 });
  }

  const result = await generateJson<{ events?: unknown }>({
    system: SYSTEM_PROMPT,
    user: text,
    schema: responseSchema,
    temperature: 0.2,
    // .env のモデル（gemma 系）を使う。thinkingConfig 非対応は gemini.ts が自己修復する。
    // 週の多件数で切り詰めないよう上限は広く。
    maxOutputTokens: 8192,
  });

  // 正常なら events を、途中で切れていても raw から完結した予定だけ救い出す。
  const model = result.model;
  let list: unknown[] = [];
  if (result.ok) {
    list = Array.isArray(result.data.events) ? result.data.events : [];
  } else if (result.raw) {
    list = salvageObjects(result.raw);
  } else {
    return NextResponse.json({ error: result.error, detail: result.detail }, { status: result.status });
  }

  const events = list
    .map((e) => {
      const item = e as { weekday?: unknown; start?: unknown; end?: unknown; title?: unknown };
      const weekday = typeof item.weekday === "string" ? KANJI_TO_INDEX[item.weekday] : undefined;
      const range = extractRange(item.start, item.end);
      const title = cleanTitle(item.title, 20);
      // salvage 経由だと壊れた JSON 断片がタイトルに混じることがあるので、記号混入は捨てる。
      const titleOk = title != null && !/[{}[\]"<>]/.test(title);
      if (weekday === undefined || !range || !titleOk) return null;
      return { weekday, start: range.start, end: range.end, title: title! };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .slice(0, 60);

  if (events.length === 0) {
    return NextResponse.json(
      { error: "時間割を読み取れませんでした。曜日と時刻がわかるように書いてみてください。" },
      { status: 502 },
    );
  }

  return NextResponse.json({ events, model, promptVersion: PROMPT_VERSION });
}
