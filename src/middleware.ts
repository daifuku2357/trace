import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gateToken } from "@/lib/gate";

/**
 * パスワードログイン。SITE_PASSWORD が設定された本番でだけ有効。
 * - ローカル開発（NODE_ENV !== "production"）や SITE_PASSWORD 未設定では素通り。
 * - 認証済み Cookie（30日）を持たないアクセスは /login に飛ばす。
 * 単一のパスワードを全員で共有する方式（このアプリはサーバーにデータを持たないため
 * 管理者/利用者の権限分離は不要）。
 */
export async function middleware(req: NextRequest) {
  const pw = process.env.SITE_PASSWORD;
  if (!pw || process.env.NODE_ENV !== "production") return NextResponse.next();

  const cookie = req.cookies.get(GATE_COOKIE)?.value;
  if (cookie && cookie === (await gateToken(pw))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // ログイン画面・ログインAPI・静的アセットは除外し、それ以外を保護する。
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|api/login|manifest|icons|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt|woff2?|webmanifest)).*)",
  ],
};
