import { NextResponse } from "next/server";
import { GATE_COOKIE, gateToken } from "@/lib/gate";

export const runtime = "nodejs";

/**
 * パスワードを検証し、正しければ30日有効の認証 Cookie を発行する。
 * パスワードは環境変数 SITE_PASSWORD にだけ持ち、コードや GitHub には載せない。
 */
export async function POST(req: Request) {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return NextResponse.json({ ok: false, error: "ログインは未設定です" }, { status: 400 });

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "不正なリクエスト" }, { status: 400 });
  }

  if ((body.password ?? "") !== pw) {
    return NextResponse.json({ ok: false, error: "パスワードが違います" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(GATE_COOKIE, await gateToken(pw), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30日
  });
  return res;
}
