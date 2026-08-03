import "server-only";

/**
 * Gemini 呼び出しの共通部分。
 * API キーはこのモジュール経由でのみ読む（ブラウザに漏らさないため server-only）。
 */

const DEFAULT_MODEL = "gemini-2.5-flash";

export type GeminiResult<T> =
  | { ok: true; data: T; model: string }
  | { ok: false; status: number; error: string; detail?: string; raw?: string; model?: string };

export interface GenerateOptions {
  system: string;
  user: string;
  /** Gemini の responseSchema。構造化出力を必須にする。 */
  schema: unknown;
  temperature?: number;
  /**
   * 思考トークン。分類のような単純な抽出は 0（既定）のまま速さを取る。
   * 予定の組み立て等の生成タスクは "dynamic"（thinkingConfig を送らずモデルに委ねる）にする。
   * gemini-2.5-flash は budget 0 を強制すると空・途中切れの応答を返すことがあるため。
   */
  thinkingBudget?: number | "dynamic";
  /** 出力上限。弱いモデルが繰り返しループに陥ったときの暴走を止める。 */
  maxOutputTokens?: number;
}

/**
 * thinkingConfig を受け付けないモデル（Gemma 系など）を憶えておく。
 * GEMINI_MODEL は利用者が自由に差し替えるため、対応表を持たず実際の 400 から学習する。
 */
const noThinkingSupport = new Set<string>();

export async function generateJson<T>(opts: GenerateOptions): Promise<GeminiResult<T>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error: "GEMINI_API_KEY が未設定です。.env にキーを記入してください。",
    };
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // モデルが暴走して数分ハングしても、ここで打ち切って失敗させる（4分ハングの実例あり）。
  const TIMEOUT_MS = 45_000;

  const call = async (withThinking: boolean): Promise<Response> => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        signal: ac.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: opts.system }] },
          contents: [{ role: "user", parts: [{ text: opts.user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: opts.schema,
            temperature: opts.temperature ?? 0.2,
            ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
            // "dynamic" のときは thinkingConfig を送らずモデルに委ねる（budget 0 強制の不具合回避）。
            ...(withThinking && opts.thinkingBudget !== "dynamic"
              ? { thinkingConfig: { thinkingBudget: typeof opts.thinkingBudget === "number" ? opts.thinkingBudget : 0 } }
              : {}),
          },
        }),
      });
    } finally {
      clearTimeout(timer);
    }
  };

  // 1回の送信。thinkingConfig 非対応モデルはここで外して憶える。
  const attempt = async (): Promise<Response> => {
    let r = await call(!noThinkingSupport.has(model));
    if (r.status === 400 && !noThinkingSupport.has(model)) {
      const body = await r.clone().text().catch(() => "");
      if (body.includes("Thinking budget is not supported")) {
        noThinkingSupport.add(model);
        r = await call(false);
      }
    }
    return r;
  };

  // gemini-2.5-flash の無料枠は混雑時に 503/429 を返す。数百 ms 空けて数回だけ再試行する。
  const TRANSIENT = new Set([429, 500, 503]);
  let res: Response;
  try {
    res = await attempt();
    for (let i = 0; TRANSIENT.has(res.status) && i < 2; i++) {
      await new Promise((r) => setTimeout(r, 500 * (i + 1) * (i + 1))); // 500ms, 2000ms
      res = await attempt();
    }
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      status: aborted ? 504 : 502,
      error: aborted
        ? "Gemini の応答が遅すぎたため打ち切りました。もう一度お試しください。"
        : "Gemini API に接続できませんでした。",
    };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const overloaded = res.status === 503 || res.status === 429;
    return {
      ok: false,
      status: 502,
      error: overloaded
        ? "Gemini が混雑しています。少し待ってからもう一度試してください。"
        : `Gemini API エラー (${res.status})`,
      detail: detail.slice(0, 500),
    };
  }

  const payload = (await res.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  };
  const candidate = payload.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  const parsed = parseLoose<T>(text);
  if (parsed !== undefined) return { ok: true, data: parsed, model };

  // モデルを差し替えたときに何が返ってきたのか分からないと詰むため、生の応答を残す。
  // raw はルート側で部分的な救済（salvageObjects）に使う。
  return {
    ok: false,
    status: 502,
    error: "生成結果を解釈できませんでした。",
    detail: `finishReason=${candidate?.finishReason ?? "?"} raw=${text.slice(0, 300)}`,
    raw: text,
    model,
  };
}

/**
 * 崩れた／途中で切れた JSON からでも、完結している {...} オブジェクトだけを取り出す。
 * 弱いモデルが配列の途中で繰り返しループに落ちたとき、それより前の正常な要素を救う。
 */
export function salvageObjects(raw: string | undefined): Record<string, unknown>[] {
  if (!raw) return [];
  const out: Record<string, unknown>[] = [];
  const stack: number[] = []; // 開き括弧の位置。入れ子の各階層を憶える。
  let inStr = false;
  let esc = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") stack.push(i);
    else if (ch === "}") {
      const start = stack.pop();
      if (start === undefined) continue; // 崩れて対応が取れない閉じ括弧は無視
      try {
        const obj = JSON.parse(raw.slice(start, i + 1));
        if (obj && typeof obj === "object") out.push(obj as Record<string, unknown>);
      } catch {
        // この断片は捨てて次へ
      }
    }
  }
  return out;
}

/**
 * responseMimeType を指定しても、モデルによっては ```json フェンスを付けて返す
 * （Gemma 系で実際に発生する）。素の JSON.parse だけに頼らず、そこまで面倒を見る。
 */
function parseLoose<T>(text: string): T | undefined {
  const candidates = [text, stripFence(text), extractBraces(text)];
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c) as T;
    } catch {
      // 次の候補を試す
    }
  }
  return undefined;
}

function stripFence(text: string): string | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return m ? m[1] : null;
}

/** フェンスが閉じていない場合に備え、最初の { から最後の } までを取り出す。 */
function extractBraces(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start !== -1 && end > start ? text.slice(start, end + 1) : null;
}

/** モデル出力は信用せず、必ず範囲内に丸めてから使う。 */
export function clampNumber(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
}

/** 生成されたタイトルの正規化。改行や過剰な長さをここで潰し、崩れた出力は捨てる。 */
export function cleanTitle(v: unknown, maxLen = 60): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s || isDegenerate(s)) return null;
  return s.slice(0, maxLen);
}

/**
 * 弱いモデルが陥る繰り返しループ（「学内-学内-学内…」等）を検出する。
 * 短い断片が過剰に反復する／文字種の多様性が極端に低い場合を崩壊とみなす。
 */
export function isDegenerate(s: string): boolean {
  if (s.length >= 12) {
    const uniqueRatio = new Set(s).size / s.length;
    if (uniqueRatio < 0.25) return true;
  }
  // 2〜6文字の断片が4回以上連続する。
  return /(.{2,6})\1{3,}/.test(s);
}
