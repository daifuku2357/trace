"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * パスワードの入力画面。middleware が未認証アクセスをここに飛ばす。
 * 認証は30日 Cookie なので、その端末では実質1回だけ入力すればよい。
 */
function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    }).catch(() => null);

    if (r && r.ok) {
      window.location.href = next;
      return;
    }
    const j = r ? await r.json().catch(() => ({})) : {};
    setErr((j as { error?: string }).error || "認証に失敗しました");
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="w-full max-w-xs">
      <div className="mb-6 text-center">
        <div className="text-[15px] font-bold tracking-[0.2em]">TRACE</div>
        <p className="mt-2 text-xs text-ink-2">利用にはパスワードが必要です</p>
      </div>
      <input
        type="password"
        autoFocus
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="パスワード"
        className="w-full border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-ai"
      />
      {err && <p className="mt-2 text-xs text-flame">{err}</p>}
      <button
        type="submit"
        disabled={busy || !pw}
        className="mt-3 w-full bg-ai py-2 text-sm font-bold text-paper disabled:opacity-40"
      >
        {busy ? "確認中…" : "入る"}
      </button>
      <p className="mt-4 text-center text-[10px] text-ink-3">
        一度入れば、この端末では30日間そのまま開けます。
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-paper p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
