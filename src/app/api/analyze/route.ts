import { NextResponse } from "next/server";
import { clampNumber, generateJson } from "@/lib/gemini";
import { EMOTION_LABELS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 感情分析（仕様書 §3.3）。
 * プロンプトを変えたら PROMPT_VERSION を上げること。
 * 保存された分析には model と promptVersion が記録され、後から再解析できる。
 */
const PROMPT_VERSION = "analyze-v1";

const SYSTEM_PROMPT = `あなたは日記の感情分析器です。与えられた日記本文を読み、JSON のみを返してください。

- sentiment_score: 全体の感情価を -1.0（強い負）〜 +1.0（強い正）で表す。平坦・淡々とした記述は 0 付近にする。
- labels: 各感情の強さを 0.0〜1.0 で表す。多ラベルであり、合計を1にする必要はない。該当しない感情は 0.0。
- keywords: 本文に実際に現れた具体的な語を3〜5語。抽象的な感想語（「頑張った」等）ではなく、行動・対象・固有名詞を優先する。本文にない語を創作しない。

書き手を評価・励ましせず、記述された内容のみから判定すること。`;

const responseSchema = {
  type: "OBJECT",
  properties: {
    sentiment_score: { type: "NUMBER" },
    labels: {
      type: "OBJECT",
      properties: Object.fromEntries(EMOTION_LABELS.map((l) => [l, { type: "NUMBER" }])),
      required: [...EMOTION_LABELS],
    },
    keywords: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["sentiment_score", "labels", "keywords"],
};

export async function POST(req: Request) {
  let body: string;
  try {
    const json = (await req.json()) as { body?: unknown };
    if (typeof json.body !== "string" || json.body.trim().length === 0) {
      return NextResponse.json({ error: "本文が空です。" }, { status: 400 });
    }
    body = json.body;
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です。" }, { status: 400 });
  }

  const result = await generateJson<{
    sentiment_score?: unknown;
    labels?: Record<string, unknown>;
    keywords?: unknown;
  }>({ system: SYSTEM_PROMPT, user: body, schema: responseSchema });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, detail: result.detail },
      { status: result.status },
    );
  }

  const parsed = result.data;
  const labels = Object.fromEntries(
    EMOTION_LABELS.map((l) => [l, clampNumber(parsed.labels?.[l], 0, 1, 0)]),
  );
  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.filter((k): k is string => typeof k === "string").slice(0, 5)
    : [];

  return NextResponse.json({
    sentimentScore: clampNumber(parsed.sentiment_score, -1, 1, 0),
    labels,
    keywords,
    model: result.model,
    promptVersion: PROMPT_VERSION,
  });
}
