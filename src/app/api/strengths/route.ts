import { NextResponse } from "next/server";
import { cleanTitle, generateJson, salvageObjects } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 就活の自己分析: 蓄積した日記から「強み仮説」を抽出する（仕様書 §5.2）。
 * 捏造防止のため、各強みは「与えられた日記の日付」からのみ根拠を挙げる。
 * サーバー側でも根拠日付が入力に含まれるか検証し、含まれないものは落とす。
 */
const PROMPT_VERSION = "strengths-v1";

const SYSTEM_PROMPT = `あなたは就活の自己分析を助ける分析者です。与えられた日記の要約群だけを根拠に、書き手の「強み仮説」を抽出します。JSON のみを返してください。

- strengths: 2〜4個。実際の行動・継続・工夫・感情の傾向から読み取れる強みだけを挙げる。
- title: 強みを一言で（体言止め・20字以内）。ありきたりな美辞麗句ではなく、日記の事実に即したもの。
- summary: その強みの根拠を、自己PRの下書きとして2〜3文で。与えられた日記の内容にないことは書かない。
- evidence: その強みを裏付ける日付を、**与えられた日付の中から**2〜3個。与えられていない日付は絶対に書かない。

根拠が薄いものは無理に作らない。捏造は禁止。`;

const responseSchema = {
  type: "OBJECT",
  properties: {
    strengths: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          summary: { type: "STRING" },
          evidence: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["title", "summary", "evidence"],
      },
    },
  },
  required: ["strengths"],
};

interface InItem {
  date: string;
  text: string;
  meta?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
      { error: "強みを出すには記録がまだ足りません。もう少し日記を書きためましょう。" },
      { status: 400 },
    );
  }

  const allowed = new Set(valid.map((it) => it.date));
  const user = valid
    .map((it) => `【${it.date}】${it.meta ? `(${it.meta}) ` : ""}${it.text}`)
    .join("\n");

  const result = await generateJson<{ strengths?: unknown }>({
    system: SYSTEM_PROMPT,
    user: `次はこの利用者の日記の要約です。ここに書かれた事実だけを根拠にしてください。\n\n${user}`,
    schema: responseSchema,
    temperature: 0.3,
    maxOutputTokens: 4096,
  });

  let list: unknown[] = [];
  const model = result.model;
  if (result.ok) list = Array.isArray(result.data.strengths) ? result.data.strengths : [];
  else if (result.raw) list = salvageObjects(result.raw);
  else return NextResponse.json({ error: result.error, detail: result.detail }, { status: result.status });

  const strengths = list
    .map((s) => {
      const item = s as { title?: unknown; summary?: unknown; evidence?: unknown };
      const title = cleanTitle(item.title, 24);
      const summary = typeof item.summary === "string" ? item.summary.replace(/\s+/g, " ").trim().slice(0, 300) : "";
      // 捏造防止: 根拠は「与えられた日付」に実在するものだけを残す。
      const evidence = Array.isArray(item.evidence)
        ? [...new Set(item.evidence.filter((d): d is string => typeof d === "string" && allowed.has(d)))].slice(0, 3)
        : [];
      const titleOk = title != null && !/[{}[\]"<>]/.test(title);
      if (!titleOk || !summary || evidence.length === 0) return null;
      return { title: title!, summary, evidence };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .slice(0, 4);

  if (strengths.length === 0) {
    return NextResponse.json(
      { error: "強みをうまく抽出できませんでした。記録が増えるともう一度お試しください。" },
      { status: 502 },
    );
  }

  return NextResponse.json({ strengths, model, promptVersion: PROMPT_VERSION });
}
