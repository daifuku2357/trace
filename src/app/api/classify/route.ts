import { NextResponse } from "next/server";
import { cleanTitle, generateJson } from "@/lib/gemini";
import { TASK_CATEGORIES, TASK_CATEGORY_JA, type TaskCategory } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** メインタスク分類（仕様書 §3.7）。日記本文からその日の主活動を1〜3件抽出する。 */
const PROMPT_VERSION = "classify-v1";

const CATEGORY_GUIDE = TASK_CATEGORIES.map((c) => `${c}（${TASK_CATEGORY_JA[c]}）`).join(" / ");

const SYSTEM_PROMPT = `あなたは日記から「その日の主な活動」を取り出す分類器です。JSON のみを返してください。

- tasks: その日の主活動を1〜3件。多く書かれていても、時間を使った順に最大3件までに絞る。
- title: 本文の記述に即した具体的な行動を、体言止めで20字以内。「勉強」ではなく「線形代数の演習問題」のように対象を含める。本文にない活動を創作しない。
- category: 次のいずれか1つ。${CATEGORY_GUIDE}

活動が読み取れない場合は tasks を空配列にする。感想や気分は活動ではないので含めない。`;

const responseSchema = {
  type: "OBJECT",
  properties: {
    tasks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          category: { type: "STRING", enum: [...TASK_CATEGORIES] },
        },
        required: ["title", "category"],
      },
    },
  },
  required: ["tasks"],
};

interface Correction {
  title: string;
  from: string;
  to: string;
}

/**
 * ユーザーの修正履歴をプロンプトに織り込む（§3.7「修正内容は以後の分類プロンプトに反映」）。
 * 直近のものだけを、正解ラベルの例として渡す。
 */
function correctionHint(corrections: Correction[]): string {
  const valid = corrections
    .filter((c) => TASK_CATEGORIES.includes(c.to as TaskCategory))
    .slice(0, 12);
  if (valid.length === 0) return "";
  const lines = valid.map((c) => `- 「${c.title}」→ ${c.to}`).join("\n");
  return `\n\n過去にこの利用者が分類を修正した例。同じ傾向の活動は修正後のカテゴリに合わせること。\n${lines}`;
}

export async function POST(req: Request) {
  let body: string;
  let corrections: Correction[] = [];
  try {
    const json = (await req.json()) as { body?: unknown; corrections?: unknown };
    if (typeof json.body !== "string" || json.body.trim().length === 0) {
      return NextResponse.json({ error: "本文が空です。" }, { status: 400 });
    }
    body = json.body;
    if (Array.isArray(json.corrections)) corrections = json.corrections as Correction[];
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です。" }, { status: 400 });
  }

  const result = await generateJson<{ tasks?: unknown }>({
    system: SYSTEM_PROMPT + correctionHint(corrections),
    user: body,
    schema: responseSchema,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, detail: result.detail },
      { status: result.status },
    );
  }

  const raw = Array.isArray(result.data.tasks) ? result.data.tasks : [];
  const tasks = raw
    .map((t) => {
      const item = t as { title?: unknown; category?: unknown };
      const title = cleanTitle(item.title, 30);
      const category = TASK_CATEGORIES.includes(item.category as TaskCategory)
        ? (item.category as TaskCategory)
        : null;
      return title && category ? { title, category } : null;
    })
    .filter((t): t is { title: string; category: TaskCategory } => t !== null)
    .slice(0, 3);

  return NextResponse.json({ tasks, model: result.model, promptVersion: PROMPT_VERSION });
}
