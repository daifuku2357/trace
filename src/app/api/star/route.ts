import { NextResponse } from "next/server";
import { cleanTitle, generateJson, salvageObjects } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 就活: 日記から STAR エピソード（状況/課題/行動/結果）の下書きを作る（仕様書 §5.2）。
 * 捏造防止のため、各エピソードは「与えられた日記の日付」からのみ根拠を挙げる（サーバーで検証）。
 */
const PROMPT_VERSION = "star-v1";

const SYSTEM_PROMPT = `あなたは就活の ES 作成を助ける分析者です。与えられた日記の要約だけを根拠に、STAR 形式のエピソードの下書きを作ります。JSON のみを返してください。

- episodes: 1〜3個。実際に行動と結果がある出来事だけを選ぶ。
- title: 一言（体言止め・20字以内）。
- situation: 状況（どんな場面か）。task: 課題（何を求められた/自分で決めた目標か）。action: 行動（具体的に何をしたか）。result: 結果（どうなったか・学び）。各1〜3文、日記にない事実は書かない。
- dates: そのエピソードの根拠になった日付を、**与えられた日付の中から**1〜3個。与えられていない日付は禁止。

行動と結果が読み取れないものは作らない。捏造は禁止。`;

const responseSchema = {
  type: "OBJECT",
  properties: {
    episodes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          situation: { type: "STRING" },
          task: { type: "STRING" },
          action: { type: "STRING" },
          result: { type: "STRING" },
          dates: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["title", "situation", "task", "action", "result", "dates"],
      },
    },
  },
  required: ["episodes"],
};

interface InItem {
  date: string;
  text: string;
  meta?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clip = (v: unknown, n: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "";

export async function POST(req: Request) {
  let items: InItem[] = [];
  try {
    const json = (await req.json()) as { items?: unknown };
    if (Array.isArray(json.items)) items = json.items as InItem[];
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です。" }, { status: 400 });
  }

  const valid = items.filter(
    (it) => typeof it?.date === "string" && DATE_RE.test(it.date) && typeof it.text === "string",
  );
  if (valid.length < 3) {
    return NextResponse.json(
      { error: "エピソードを出すには記録がまだ足りません。もう少し日記を書きためましょう。" },
      { status: 400 },
    );
  }

  const allowed = new Set(valid.map((it) => it.date));
  const user = valid.map((it) => `【${it.date}】${it.meta ? `(${it.meta}) ` : ""}${it.text}`).join("\n");

  const result = await generateJson<{ episodes?: unknown }>({
    system: SYSTEM_PROMPT,
    user: `次はこの利用者の日記の要約です。ここに書かれた事実だけを根拠にしてください。\n\n${user}`,
    schema: responseSchema,
    temperature: 0.3,
    maxOutputTokens: 4096,
  });

  let list: unknown[] = [];
  const model = result.model;
  if (result.ok) list = Array.isArray(result.data.episodes) ? result.data.episodes : [];
  else if (result.raw) list = salvageObjects(result.raw);
  else return NextResponse.json({ error: result.error, detail: result.detail }, { status: result.status });

  const episodes = list
    .map((e) => {
      const it = e as Record<string, unknown>;
      const title = cleanTitle(it.title, 24);
      const situation = clip(it.situation, 300);
      const task = clip(it.task, 300);
      const action = clip(it.action, 300);
      const resultText = clip(it.result, 300);
      const dates = Array.isArray(it.dates)
        ? [...new Set(it.dates.filter((d): d is string => typeof d === "string" && allowed.has(d)))].slice(0, 3)
        : [];
      const titleOk = title != null && !/[{}[\]"<>]/.test(title);
      // 行動と結果は必須。根拠が1つも実在しないものは落とす（捏造防止）。
      if (!titleOk || !action || !resultText || dates.length === 0) return null;
      return { title: title!, situation, task, action, result: resultText, dates };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .slice(0, 3);

  if (episodes.length === 0) {
    return NextResponse.json(
      { error: "エピソードをうまく作れませんでした。記録が増えるともう一度お試しください。" },
      { status: 502 },
    );
  }

  return NextResponse.json({ episodes, model, promptVersion: PROMPT_VERSION });
}
