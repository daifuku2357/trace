"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 「記録」タブ内の分岐。記録（ヒートマップ）と分析（グラフ）を同じタブで切り替える。 */
export default function RecordNav() {
  const pathname = usePathname();
  const onRecord = pathname.startsWith("/record");

  const cls = (active: boolean) =>
    `rounded-lg px-5 py-1.5 text-sm font-bold transition ${
      active ? "bg-paper text-ink shadow-soft" : "text-ink-3 hover:text-ink-2"
    }`;

  return (
    <div className="mb-4 inline-flex rounded-xl border border-rule bg-paper-2/60 p-0.5">
      <Link href="/record" aria-current={onRecord ? "page" : undefined} className={cls(onRecord)}>
        記録
      </Link>
      <Link href="/insights" aria-current={!onRecord ? "page" : undefined} className={cls(!onRecord)}>
        分析
      </Link>
    </div>
  );
}
