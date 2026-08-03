/**
 * パスワードログインの共通ロジック（middleware と /api/login の両方から使う）。
 * Cookie にはパスワードそのものではなく「パスワードから導いたトークン」を入れる。
 * パスワードを知らないと同じトークンを作れないので、Cookie の偽造を防げる。
 * Web Crypto のみを使い、Edge(middleware) と Node(route) の両方で動く。
 */

export const GATE_COOKIE = "trace_login";
const SALT = "trace-login-v1";

/** パスワード → Cookie に入れるトークン（SHA-256 の16進文字列）。 */
export async function gateToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + SALT);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
